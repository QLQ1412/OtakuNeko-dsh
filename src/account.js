const KEY = 'otakuneko-harness-native-plugin/bangumi';

export function createBangumiAccount({ credentials, fetchImpl = globalThis.fetch, key = KEY }) {
  let queue = Promise.resolve();
  function exclusive(action) {
    const result = queue.then(action, action);
    queue = result.catch(() => {});
    return result;
  }

  async function status() {
    let record;
    try { record = await credentials.readRecord(key); } catch { throw new Error('无法读取 Bangumi 凭据，请检查 Harness 凭据服务'); }
    const user = record?.kind === 'grant' && record.payload?.user;
    if (!user || typeof record.payload.token !== 'string') return { connected: false };
    return { connected: true, method: 'personal-token', user: { id: user.id, username: user.username, nickname: user.nickname } };
  }

  function connect(token, signal) {
    return exclusive(async () => {
      if (typeof token !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(token)) throw new Error('请输入有效的 Bangumi 个人访问令牌');
      const timeout = AbortSignal.timeout(12000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response;
      try {
        response = await fetchImpl('https://api.bgm.tv/v0/me', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'OtakuNeko/1.0 (showayhacci@qq.com)' },
          signal: combined, redirect: 'error',
        });
      } catch {
        if (signal?.aborted) throw new Error('账号连接已取消');
        if (timeout.aborted) throw new Error('Bangumi 请求超时，请检查网络后重试');
        throw new Error('无法连接 Bangumi，请检查网络后重试');
      }
      if (response.status === 401 || response.status === 403) throw new Error('Bangumi 令牌无效或已过期');
      if (!response.ok) throw new Error(`Bangumi 账号验证失败（HTTP ${response.status}）`);
      let data;
      try { data = await response.json(); } catch { throw new Error('Bangumi 账号信息无法解析'); }
      if (signal?.aborted) throw new Error('账号连接已取消');
      if (timeout.aborted) throw new Error('Bangumi 请求超时，请检查网络后重试');
      if (!Number.isSafeInteger(data?.id) || data.id < 1 || typeof data.username !== 'string' || !data.username) throw new Error('Bangumi 账号信息格式不正确');
      const user = { id: data.id, username: data.username, nickname: typeof data.nickname === 'string' ? data.nickname : '' };
      try { await credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { token, user } })); }
      catch { throw new Error('无法保存 Bangumi 凭据，请检查 Harness 凭据服务'); }
      return { connected: true, method: 'personal-token', user };
    });
  }

  function disconnect() {
    return exclusive(async () => { try { await credentials.deleteRecord(key); } catch { throw new Error('无法删除本地 Bangumi 凭据'); } return { connected: false }; });
  }

  async function remoteCollections({ offset = 0, limit = 20 } = {}, signal) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('收藏分页参数无效');
    let record;
    try { record = await credentials.readRecord(key); } catch { throw new Error('无法读取 Bangumi 凭据'); }
    const token = record?.kind === 'grant' ? record.payload?.token : undefined;
    const username = record?.payload?.user?.username;
    if (typeof token !== 'string' || typeof username !== 'string' || !username) throw new Error('请先在当前工作区连接 Bangumi 账号');
    const timeout = AbortSignal.timeout(12000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const query = new URLSearchParams({ subject_type: '2', limit: String(limit), offset: String(offset) });
    let response;
    try { response = await fetchImpl(`https://api.bgm.tv/v0/users/${encodeURIComponent(username)}/collections?${query}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'OtakuNeko/1.0 (showayhacci@qq.com)' }, signal: combined, redirect: 'error' }); }
    catch { if (signal?.aborted) throw new Error('请求已取消'); if (timeout.aborted) throw new Error('Bangumi 请求超时，请检查网络'); throw new Error('无法连接 Bangumi，请检查网络'); }
    if (response.status === 401 || response.status === 403) throw new Error('Bangumi 令牌无效或已过期，请重新连接');
    if (!response.ok) throw new Error(`Bangumi 收藏读取失败（HTTP ${response.status}）`);
    let data;
    try { data = await response.json(); } catch { throw new Error('Bangumi 收藏数据无法解析'); }
    if (!Array.isArray(data?.data)) throw new Error('Bangumi 收藏数据格式不正确');
    const items = data.data.filter(item => Number.isSafeInteger(item?.subject_id) && item.subject_id > 0).map(item => ({
      id: item.subject_id, name: typeof item.subject?.name === 'string' ? item.subject.name : '',
      nameCn: typeof item.subject?.name_cn === 'string' ? item.subject.name_cn : '',
      status: Number.isInteger(item.type) ? item.type : null,
      rating: Number.isInteger(item.rate) ? item.rate : null,
      progress: Number.isInteger(item.ep_status) ? item.ep_status : null,
      private: item.private === true,
    }));
    return { total: Number.isInteger(data.total) ? data.total : items.length, offset, limit, items };
  }

  return { accountStatus: status, accountConnect: connect, accountDisconnect: disconnect, remoteCollections };
}
