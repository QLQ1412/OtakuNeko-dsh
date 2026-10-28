const BASE_URL = 'https://api.bgm.tv/v0';
const TIMEOUT_MS = 12000;

function subject(raw) {
  if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    nameCn: typeof raw.name_cn === 'string' ? raw.name_cn : '',
    date: typeof raw.date === 'string' ? raw.date : (typeof raw.air_date === 'string' ? raw.air_date : null),
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 1200) : '',
    score: Number.isFinite(raw.rating?.score) ? raw.rating.score : null,
    rank: Number.isFinite(raw.rating?.rank) ? raw.rating.rank : null,
    episodes: Number.isFinite(raw.total_episodes) ? raw.total_episodes : (Number.isFinite(raw.eps) ? raw.eps : null),
    url: `https://bgm.tv/subject/${raw.id}`,
  };
}

export function createBangumiService({ fetchImpl = globalThis.fetch } = {}) {
  async function request(path, options = {}, signal, baseUrl = BASE_URL) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...options,
        headers: { 'User-Agent': 'OtakuNeko/1.0 (showayhacci@qq.com)', Accept: 'application/json', ...options.headers },
        signal: combined,
      });
    } catch (error) {
      if (signal?.aborted) throw new Error('请求已取消');
      if (timeout.aborted) throw new Error('Bangumi 请求超时，请稍后重试');
      throw new Error('无法连接 Bangumi，请检查网络后重试', { cause: error });
    }
    if (!response.ok) throw new Error(`Bangumi 请求失败（HTTP ${response.status}）`);
    try {
      return await response.json();
    } catch {
      if (signal?.aborted) throw new Error('请求已取消');
      if (timeout.aborted) throw new Error('Bangumi 请求超时，请稍后重试');
      throw new Error('Bangumi 返回的数据无法解析');
    }
  }

  async function search(keyword, limit = 8, signal) {
    if (typeof keyword !== 'string' || !keyword.trim() || keyword.trim().length > 100) {
      throw new Error('关键词必须是 1 到 100 个字符');
    }
    const count = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
    const query = new URLSearchParams({ limit: String(count), offset: '0' });
    const data = await request(`/search/subjects?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword.trim(), sort: 'rank', filter: { type: [2] } }),
    }, signal);
    if (!Array.isArray(data?.data)) throw new Error('Bangumi 搜索结果格式不正确');
    return { keyword: keyword.trim(), total: Number.isFinite(data.total) ? data.total : data.data.length, items: data.data.map(subject).filter(Boolean) };
  }

  async function details(id, signal) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Bangumi 条目 ID 必须是正整数');
    const data = await request(`/subjects/${id}`, {}, signal);
    const item = subject(data);
    if (!item || item.id !== id) throw new Error('Bangumi 条目数据格式不正确');
    return item;
  }

  async function advancedSearch(args, signal) {
    const keyword = args.keyword ?? '';
    if (typeof keyword !== 'string' || keyword.trim().length > 100) throw new Error('关键词不能超过 100 个字符');
    const filter = { type: [2] };
    if (args.tags !== undefined) {
      if (typeof args.tags !== 'string' || args.tags.length > 300) throw new Error('标签格式无效');
      const tags = args.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      if (tags.length > 10 || tags.some(tag => tag.length > 50)) throw new Error('最多提供 10 个标签，每个不超过 50 字符');
      if (tags.length) filter.tag = tags;
    }
    for (const key of ['minRating', 'maxRating']) {
      if (args[key] !== undefined && (typeof args[key] !== 'number' || !Number.isFinite(args[key]) || args[key] < 0 || args[key] > 10)) throw new Error('评分范围必须在 0 到 10 之间');
    }
    if (args.minRating !== undefined && args.maxRating !== undefined && args.minRating > args.maxRating) throw new Error('最低评分不能高于最高评分');
    if (args.minRating !== undefined || args.maxRating !== undefined) filter.rating = [
      ...(args.minRating !== undefined ? [`>=${args.minRating}`] : []),
      ...(args.maxRating !== undefined ? [`<=${args.maxRating}`] : []),
    ];
    for (const key of ['startDate', 'endDate']) {
      if (args[key] !== undefined) {
        const value = args[key];
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期必须是有效的 YYYY-MM-DD 格式');
        const date = new Date(`${value}T00:00:00Z`);
        if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('日期必须是有效的 YYYY-MM-DD 格式');
      }
    }
    if (args.startDate && args.endDate && args.startDate > args.endDate) throw new Error('开始日期不能晚于结束日期');
    if (args.startDate || args.endDate) filter.air_date = [
      ...(args.startDate ? [`>=${args.startDate}`] : []),
      ...(args.endDate ? [`<=${args.endDate}`] : []),
    ];
    if (!keyword.trim() && Object.keys(filter).length === 1) throw new Error('请至少提供关键词或一个筛选条件');
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20)) throw new Error('数量必须在 1 到 20 之间');
    const count = args.limit ?? 10;
    const query = new URLSearchParams({ limit: String(count), offset: '0' });
    const data = await request(`/search/subjects?${query}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword.trim(), sort: 'rank', filter }),
    }, signal);
    if (!Array.isArray(data?.data)) throw new Error('Bangumi 搜索结果格式不正确');
    return { keyword: keyword.trim(), total: Number.isFinite(data.total) ? data.total : data.data.length, items: data.data.map(subject).filter(Boolean), appliedFilter: filter };
  }

  async function related(id, kind, signal) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Bangumi 条目 ID 必须是正整数');
    const data = await request(`/subjects/${id}/${kind}`, {}, signal);
    if (!Array.isArray(data)) throw new Error('Bangumi 关联人员数据格式不正确');
    const entries = data.filter(item => Number.isSafeInteger(item?.id) && typeof item.name === 'string');
    const items = entries.slice(0, 40).map(item => kind === 'persons'
      ? { id: item.id, name: item.name, relation: typeof item.relation === 'string' ? item.relation : '', type: item.type }
      : { id: item.id, name: item.name, relation: typeof item.relation === 'string' ? item.relation : '', actors: Array.isArray(item.actors) ? item.actors.filter(actor => Number.isSafeInteger(actor?.id) && typeof actor.name === 'string').slice(0, 10).map(actor => ({ id: actor.id, name: actor.name })) : [] });
    return { subjectId: id, total: entries.length, truncated: entries.length > items.length, items };
  }

  async function episodes(id, offset = 0, limit = 30, signal) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Bangumi 条目 ID 必须是正整数');
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('剧集分页参数无效');
    const query = new URLSearchParams({ subject_id: String(id), type: '0', limit: String(limit), offset: String(offset) });
    const data = await request(`/episodes?${query}`, {}, signal);
    if (!Array.isArray(data?.data)) throw new Error('Bangumi 剧集数据格式不正确');
    return { subjectId: id, total: Number.isFinite(data.total) ? data.total : data.data.length, offset, limit, items: data.data.filter(ep => Number.isSafeInteger(ep?.id)).map(ep => ({ id: ep.id, number: Number.isFinite(ep.ep) ? ep.ep : null, name: typeof ep.name === 'string' ? ep.name : '', nameCn: typeof ep.name_cn === 'string' ? ep.name_cn : '', airdate: typeof ep.airdate === 'string' ? ep.airdate : null, duration: typeof ep.duration === 'string' ? ep.duration : '' })) };
  }

  async function calendar(signal) {
    const data = await request('/calendar', {}, signal, 'https://api.bgm.tv');
    if (!Array.isArray(data)) throw new Error('Bangumi 放送日历格式不正确');
    return data.map(day => {
      if (!Number.isInteger(day?.weekday?.id) || day.weekday.id < 1 || day.weekday.id > 7 || !Array.isArray(day.items)) {
        throw new Error('Bangumi 放送日历格式不正确');
      }
      return { weekday: day.weekday.id, items: day.items.map(subject).filter(Boolean) };
    }).sort((a, b) => a.weekday - b.weekday);
  }

  return { search, details, calendar, advancedSearch, episodes, staff: (id, signal) => related(id, 'persons', signal), cast: (id, signal) => related(id, 'characters', signal) };
}

export function createFetchRoute(service, operation) {
  const method = `otakuneko-native/${operation}`;
  return {
    path: `/api/${method}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let envelope;
      try { envelope = await request.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
      if (!envelope || envelope.type !== 'client-request' || envelope.method !== method ||
          typeof envelope.rpcId !== 'string' || !envelope.rpcId || envelope.rpcId.length > 256) {
        return new Response('invalid request', { status: 400 });
      }
      const payload = envelope.payload;
      let result;
      try {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('请求参数无效');
        let value;
        const scoped = service.forSession ? service.forSession(payload.sessionId) : service;
        if (operation === 'search') value = await scoped.search(payload.keyword, payload.limit, request.signal);
        else if (operation === 'details') value = await scoped.details(payload.id, request.signal);
        else if (operation === 'calendar') value = await scoped.calendar(request.signal);
        else if (operation === 'collection-list') value = scoped.listCollections({ includePrivate: true, limit: payload.limit, offset: payload.offset });
        else if (operation === 'collection-save') value = scoped.saveCollection(payload);
        else if (operation === 'account-status') value = await scoped.accountStatus();
        else if (operation === 'account-connect') value = await scoped.accountConnect(payload.token, request.signal);
        else if (operation === 'account-disconnect') value = await scoped.accountDisconnect();
        else if (operation === 'persona-state') value = scoped.personaState(payload.sessionId);
        else if (operation === 'persona-save') value = scoped.personaSave(payload);
        else if (operation === 'workspace-activate') value = service.activate(payload.sessionId);
        else if (operation === 'network-state') value = scoped.networkState();
        else if (operation === 'network-save') value = scoped.networkSave(payload);
        else if (operation === 'network-test') value = await scoped.details(1, request.signal);
        else if (operation === 'remote-collections') value = await scoped.remoteCollections({ offset: payload.offset, limit: payload.limit }, request.signal);
        else throw new Error('未知操作');
        result = { ok: true, value };
      } catch (error) {
        result = { ok: false, error: { code: 'otakuneko/request-failed', message: error instanceof Error ? error.message : '请求失败', details: {} } };
      }
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result });
    },
  };
}
