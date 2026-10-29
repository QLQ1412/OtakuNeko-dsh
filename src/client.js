import { createElement as h, useEffect, useRef, useState } from 'react';
import { scheduleCalendar } from './calendar-export.js';
import { mascot } from './mascot.js';
import { panelStyle } from './panel-style.js';

const ID = 'otakuneko-harness-native-plugin';
const CHANNEL = '/api';
export const inject = ['sidebarRightTabs', 'slots', 'connection'];

export function apply(ctx) {
  function OtakuNekoPanel({ sessionId } = {}) {
    const [keyword, setKeyword] = useState('');
    const [searchKind, setSearchKind] = useState('anime');
    const [entityPage, setEntityPage] = useState(null);
    const [entityRelated, setEntityRelated] = useState(null);
    const [items, setItems] = useState([]);
    const [detail, setDetail] = useState(null);
    const [watch, setWatch] = useState(null);
    const [status, setStatus] = useState('输入名称，搜索 Bangumi 动画。');
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState('search');
    const [calendar, setCalendar] = useState([]);
    const [collections, setCollections] = useState([]);
    const [collectionPage, setCollectionPage] = useState(0);
    const [collectionFilter, setCollectionFilter] = useState({ keyword: '', status: '' });
    const [legacyPreview, setLegacyPreview] = useState(null);
    const [deletingCollection, setDeletingCollection] = useState(null);
    const [scheduleDraft, setScheduleDraft] = useState(null);
    const [account, setAccount] = useState(null);
    const [persona, setPersona] = useState(null);
    const [network, setNetwork] = useState(null);
    const [remote, setRemote] = useState(null);
    const [remoteSelected, setRemoteSelected] = useState([]);
    const [stats, setStats] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [deletingSchedule, setDeletingSchedule] = useState(null);
    const pending = useRef(null);
    const observedRevision = useRef(0);
    const panelState = useRef(null);
    panelState.current = { view, busy };
    useEffect(() => () => {
      const current = pending.current;
      pending.current = null;
      current?.abort();
    }, []);
    useEffect(() => {
      observedRevision.current = 0;
      pending.current?.abort();
      pending.current = null;
      setBusy(false);
      setSaving(false);
      setRemote(null);
      setRemoteSelected([]);
      setStats(null);
      setSchedules([]);
      setDeletingSchedule(null);
      setCollections([]);
      setCollectionFilter({ keyword: '', status: '' });
      setLegacyPreview(null);
      setDeletingCollection(null);
      setScheduleDraft(null);
      setAccount(null);
      setPersona(null);
      setNetwork(null);
      setView('search');
      setEntityPage(null);
      setEntityRelated(null);
      setItems([]);
      setDetail(null);
      setWatch(null);
      if (!sessionId) { setStatus('请先在工作区内打开会话。'); return; }
      setStatus('输入名称，搜索 Bangumi 动画。');
      const controller = new AbortController();
      ctx.connection.rpc.call(CHANNEL, 'otakuneko-native/workspace-activate', { sessionId }, controller.signal)
        .then(result => { if (!controller.signal.aborted && !result.ok) setStatus(result.error?.message || '无法启用当前工作区'); })
        .catch(() => { if (!controller.signal.aborted) setStatus('无法启用当前工作区'); });
      return () => controller.abort();
    }, [sessionId]);

    useEffect(() => {
      if (!sessionId) return;
      let active = true;
      let timer;
      let controller;
      async function refreshConversation() {
        controller = new AbortController();
        try {
          const result = await ctx.connection.rpc.call(CHANNEL, 'otakuneko-native/conversation-result', { sessionId }, controller.signal);
          const update = result?.ok && result.value;
          if (!active || !update || update.revision <= observedRevision.current || panelState.current.view !== 'search' || panelState.current.busy) return;
          observedRevision.current = update.revision;
          setEntityRelated(null);
          setEntityPage(null);
          setWatch(null);
          if (update.kind === 'detail') {
            setDetail(update.value);
            setStatus('显示当前会话中查询的番剧。');
          } else {
            setDetail(null);
            setSearchKind(update.kind);
            setKeyword(update.value.keyword || '');
            setItems(update.value.items);
            if (update.kind !== 'anime') setEntityPage({ offset: update.value.offset || 0, limit: update.value.limit || 12, total: update.value.total });
            setStatus(update.value.items.length ? `当前会话查询：找到 ${update.value.total} 条结果` : '当前会话查询没有找到结果。');
          }
        } catch { /* The conversation remains usable when synchronization is unavailable. */ }
        finally { if (active) timer = setTimeout(refreshConversation, 3000); }
      }
      refreshConversation();
      return () => { active = false; clearTimeout(timer); controller?.abort(); };
    }, [sessionId]);

    async function call(endpoint, payload) {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setSaving(['collection-save', 'collection-delete', 'collection-import', 'collection-legacy-import', 'account-connect', 'account-disconnect', 'persona-save', 'network-save', 'schedule-save', 'schedule-delete'].includes(endpoint));
      setStatus('正在加载…');
      try {
        const result = await ctx.connection.rpc.call(CHANNEL, `otakuneko-native/${endpoint}`, { ...payload, sessionId }, controller.signal);
        if (controller.signal.aborted) return null;
        if (!result.ok) throw new Error(result.error?.message || '请求失败');
        setStatus('');
        return result.value;
      } catch (error) {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : '请求失败');
        return null;
      } finally {
        if (pending.current === controller) { pending.current = null; setBusy(false); setSaving(false); }
      }
    }

    async function runSearch(offset = 0) {
      if (!keyword.trim() || keyword.trim().length > 100) {
        const current = pending.current;
        pending.current = null;
        current?.abort();
        setBusy(false);
        setStatus('请输入 1 至 100 个字符。');
        return;
      }
      setDetail(null);
      setEntityRelated(null);
      setEntityPage(null);
      setItems([]);
      const result = searchKind === 'anime'
        ? await call('search', { keyword: keyword.trim(), limit: 12 })
        : await call('entity-search', { kind: searchKind, keyword: keyword.trim(), limit: 12, offset });
      if (result) {
        setItems(result.items);
        if (searchKind !== 'anime') setEntityPage({ offset, limit: 12, total: result.total });
        setStatus(result.items.length ? `找到 ${result.total} 条结果` : '没有找到结果，试试其他名称。');
      }
    }

    async function search(event) { event.preventDefault(); await runSearch(0); }

    async function showEntity(item, offset = 0) {
      const result = await call('entity-anime', { kind: searchKind, id: item.id, offset, limit: 60 });
      if (result) { setEntityRelated({ ...result, entityName: item.name }); setStatus(result.items.length ? `${item.name}：找到 ${result.total} 部关联动画。` : `${item.name} 暂无已记录的关联动画。`); }
    }

    async function showDetails(id) {
      setWatch(null);
      const result = await call('details', { id });
      if (result) { setDetail(result); setView('search'); }
    }

    async function loadWatchLinks() {
      setWatch(null);
      const result = await call('watch-links', { id: detail.id });
      if (result) { setWatch(result); setStatus(result.dataset.state === 'unavailable' ? '平台数据暂不可用，可使用 B 站搜索。' : '已查询平台作品页；可用性可能因地区或会员状态变化。'); }
    }

    async function changeView(next) {
      setView(next);
      setDetail(null);
      if (next === 'search') {
        const current = pending.current;
        pending.current = null;
        current?.abort();
        setBusy(false);
        setStatus('输入名称，搜索 Bangumi 动画。');
      } else if (next === 'calendar') {
        const result = await call('calendar', {});
        if (result) { setCalendar(result); setStatus(result.length ? '每周放送日历（仅显示星期）。' : '暂无放送数据。'); }
      } else if (next === 'collection') {
        await loadCollections(0);
      } else if (next === 'schedule') {
        await loadSchedules();
      } else if (next === 'stats') {
        setStats(null);
        const result = await call('collection-stats', {});
        if (result) { setStats(result); setStatus('统计共享的本地收藏，包含私密收藏。'); }
      } else if (next === 'account') {
        const result = await call('account-status', {});
        if (result) { setAccount(result); setStatus(result.connected ? '已保存 Bangumi 账号，令牌有效性在使用时检查。' : '尚未连接 Bangumi 账号。'); }
      } else if (next === 'persona') {
        const result = await call('persona-state', { sessionId });
        if (result) { setPersona(result); setStatus('人设仅应用于当前会话。'); }
      } else if (next === 'remote') {
        await loadRemote(0);
      } else {
        const result = await call('network-state', {});
        if (result) { setNetwork(result); setStatus('Bangumi 连接设置仅用于当前工作区。'); }
      }
    }

    async function loadRemote(offset) {
      setRemote(null);
      setRemoteSelected([]);
      const result = await call('remote-collections', { offset, limit: 20 });
      if (result) { setRemote(result); setStatus(`Bangumi 账号收藏：共 ${result.total} 项。`); }
    }

    async function importRemote() {
      const items = remote?.items.filter(item => remoteSelected.includes(item.id)) || [];
      if (!items.length) { setStatus('请先选择要导入的收藏。'); return; }
      const result = await call('collection-import', { items });
      if (result) { setRemoteSelected([]); setStatus(`已导入 ${result.imported} 项，跳过已有的 ${result.skipped} 项。`); }
    }

    async function loadSchedules() {
      const result = await call('schedule-list', {});
      if (result) { setSchedules(result); setDeletingSchedule(null); setStatus(result.length ? '每周观看安排，时间按本地时钟填写。' : '还没有观看安排，可以在下方添加。'); }
      return !!result;
    }

    async function saveSchedule(event, item) {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      const result = await call('schedule-save', {
        ...(item ? { id: item.id, expectedUpdatedAt: item.updatedAt } : {}),
        title: String(fields.get('title') || ''), weekday: Number(fields.get('weekday')),
        watchTime: String(fields.get('watchTime') || ''), duration: Number(fields.get('duration')),
        private: fields.has('private'),
      });
      if (result) { if (!item) { form.reset(); setScheduleDraft(null); } if (await loadSchedules()) setStatus('观看安排已保存。'); }
    }

    async function deleteSchedule(item) {
      const result = await call('schedule-delete', { id: item.id, expectedUpdatedAt: item.updatedAt });
      if (result && await loadSchedules()) setStatus('观看安排已删除。');
    }

    function exportSchedule() {
      try {
        const data = scheduleCalendar(schedules);
        const url = URL.createObjectURL(new Blob([data], { type: 'text/calendar;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'otakuneko-watch-schedule.ics';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus('已导出当前工作区的时间表，包括私密安排。');
      } catch { setStatus('导出失败，请重新加载时间表后重试。'); }
    }

    async function saveNetwork(event) {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const result = await call('network-save', { proxy: String(fields.get('proxy') || '').trim() });
      if (result) { setNetwork(result); setStatus('连接设置已保存，可以测试 Bangumi 连接。'); }
    }

    async function testNetwork() {
      const result = await call('network-test', {});
      if (result) setStatus(`连接成功：${result.nameCn || result.name || 'Bangumi'}`);
    }

    async function savePersona(event) {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const result = await call('persona-save', {
        sessionId,
        selected: String(fields.get('selected') || 'none'),
        custom: { name: String(fields.get('name') || ''), persona: String(fields.get('persona') || ''), tone: String(fields.get('tone') || ''), rules: String(fields.get('rules') || '') },
      });
      if (result) { setPersona(result); setStatus('人设已保存，将用于后续模型请求。'); }
    }

    async function connectAccount(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const token = new FormData(form).get('token');
      form.reset();
      const result = await call('account-connect', { token });
      if (result) { setRemote(null); setRemoteSelected([]); setAccount(result); setStatus('Bangumi 账号验证成功，个人令牌已保存。'); }
    }

    async function disconnectAccount() {
      const result = await call('account-disconnect', {});
      if (result) { setRemote(null); setRemoteSelected([]); setAccount(result); setStatus('已删除本机保存的令牌；如需撤销令牌，请在 Bangumi 管理。'); }
    }

    async function loadCollections(page, filter = collectionFilter) {
      const result = await call('collection-list', { limit: 50, offset: page * 50, keyword: filter.keyword, ...(filter.status ? { status: Number(filter.status) } : {}) });
      if (result) { setCollectionPage(page); setCollections(result); setDeletingCollection(null); setStatus(result.length ? '收藏保存在本机。' : (page ? '没有更多收藏。' : '没有匹配的本地收藏。')); }
      return !!result;
    }

    async function previewLegacy() {
      setLegacyPreview(null);
      const result = await call('collection-legacy-preview', {});
      if (result) { setLegacyPreview(result); setStatus(result.available ? '已检查当前工作区旧收藏，确认后才会合并。' : '当前工作区没有旧收藏数据库。'); }
    }

    async function importLegacy() {
      const result = await call('collection-legacy-import', {});
      if (result) {
        setLegacyPreview(null);
        if (await loadCollections(0)) setStatus(`旧收藏合并完成：新增 ${result.added} 项，跳过已有 ${result.skipped} 项。旧数据库保持原样。`);
      }
    }

    async function filterCollections(event) {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const filter = { keyword: String(fields.get('keyword') || '').trim(), status: String(fields.get('status') || '') };
      setCollectionFilter(filter);
      await loadCollections(0, filter);
    }

    async function deleteCollection(item) {
      const result = await call('collection-delete', { source: item.source, sourceId: item.sourceId, expectedUpdatedAt: item.updatedAt });
      if (result && await loadCollections(collectionPage)) setStatus('已删除本地收藏；Bangumi 收藏和现有观看安排未更改。');
    }

    async function scheduleCollection(item) {
      setScheduleDraft({ title: (item.nameCn || item.name).slice(0, 200), private: item.private });
      setView('schedule');
      if (await loadSchedules()) setStatus('已带入收藏名称和隐私标记，请设置观看时间后添加；之后两者独立保存。');
    }

    async function saveDetail() {
      const result = await call('collection-save', { source: 'bangumi', sourceId: detail.id, name: detail.name, nameCn: detail.nameCn });
      if (result) setStatus('已保存到本地收藏，可在“收藏”中修改状态和进度。');
    }

    async function saveCollection(event, item) {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const rating = fields.get('rating');
      const progress = fields.get('progress');
      if (typeof progress !== 'string' || !progress.trim()) {
        setStatus('请输入观看进度；如尚未观看，请填写 0。');
        return;
      }
      const result = await call('collection-save', {
        source: item.source, sourceId: item.sourceId, expectedUpdatedAt: item.updatedAt,
        status: Number(fields.get('status')), progress: Number(progress),
        rating: rating === '' ? null : Number(rating), private: fields.has('private'),
        comment: String(fields.get('comment') || ''),
        tags: String(fields.get('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean),
      });
      if (result) {
        setCollections(current => current.map(entry => entry.source === result.source && entry.sourceId === result.sourceId ? result : entry));
        setStatus('收藏已保存到本机。');
      }
    }

    const button = { cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--otk-line)', background: 'transparent', color: 'inherit' };
    const textStyle = { opacity: 0.8, fontSize: 13, lineHeight: 1.5 };
    return h('section', { className: 'otk-panel', style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', color: 'inherit' } },
      h('header', { className: 'otk-header' }, h('style', null, panelStyle), h('img', { className: 'otk-mascot', src: mascot, alt: '' }), h('div', { className: 'otk-heading' }, h('h2', null, 'OtakuNeko 番组'), h('p', null, '你的动画探索与追番空间'))),
      view === 'search' && h('form', { className: 'otk-search', onSubmit: search },
        h('input', { value: keyword, onChange: e => setKeyword(e.target.value), maxLength: 100, placeholder: { anime: '搜索动画名称', character: '搜索角色名称', voice: '搜索声优名称', staff: '搜索制作人员或公司' }[searchKind], 'aria-label': '搜索关键词', style: { flex: 1, minWidth: 0, padding: 8, borderRadius: 6, border: '1px solid currentColor', color: 'inherit', background: 'transparent' } }),
        h('select', { value: searchKind, 'aria-label': '搜索类别', disabled: busy, onChange: e => { setSearchKind(e.target.value); setItems([]); setEntityPage(null); setEntityRelated(null); setDetail(null); } }, [['anime', '番剧'], ['character', '角色'], ['voice', '声优'], ['staff', '制作人员/公司']].map(([value, label]) => h('option', { key: value, value }, label))),
        h('button', { type: 'submit', disabled: busy, style: button }, '搜索')),
      h('nav', { className: 'otk-nav', 'aria-label': '番组功能' },
        [['search', '搜索'], ['calendar', '放送日历'], ['schedule', '追番时间表'], ['collection', '收藏'], ['account', '账号'], ['persona', '人设'], ['network', '连接']].map(([key, label]) =>
          h('button', { key, type: 'button', disabled: saving, 'aria-pressed': key === 'collection' ? ['collection', 'stats', 'remote'].includes(view) : view === key, onClick: () => changeView(key), style: button }, label))),
      ['collection', 'stats', 'remote'].includes(view) && h('nav', { className: 'otk-subnav', 'aria-label': '收藏分类' },
        [['collection', '本地收藏'], ['stats', '收藏统计'], ['remote', 'Bangumi 收藏']].map(([key, label]) => h('button', { key, type: 'button', disabled: saving, 'aria-pressed': view === key, onClick: () => changeView(key), style: button }, label))),
      h('p', { className: 'otk-status', role: 'status', 'aria-live': 'polite' }, status),
      view === 'search' && !detail && !entityRelated && !items.length && !busy && !keyword.trim() && h('div', { className: 'otk-empty' }, h('strong', null, '发现下一部心动作品'), h('p', null, '搜索动画、角色或声优，也可以在会话中聊聊喜欢的番剧。')),
      view === 'search' && detail && h('article', { className: 'otk-card otk-detail', style: { padding: 12, border: '1px solid currentColor', borderRadius: 8, marginBottom: 12 } },
        h('button', { type: 'button', onClick: () => { setDetail(null); setWatch(null); pending.current?.abort(); }, style: button }, '返回结果'),
        detail.image && h('img', { src: detail.image, alt: `${detail.nameCn || detail.name} 封面`, referrerPolicy: 'no-referrer', style: { display: 'block', maxWidth: '100%', width: 160, marginTop: 10, borderRadius: 6 } }),
        h('h3', null, detail.nameCn || detail.name),
        detail.nameCn && detail.name && h('p', { style: textStyle }, detail.name),
        h('p', { style: textStyle }, `放送：${detail.date || '未知'}　评分：${detail.score ?? '暂无'}`),
        h('p', { style: { ...textStyle, whiteSpace: 'pre-wrap' } }, detail.summary || '暂无简介。'),
        h('a', { href: detail.url, target: '_blank', rel: 'noopener noreferrer' }, '在 Bangumi 查看'),
        (detail.nameCn || detail.name) && h('div', { style: { marginTop: 10 } }, h('a', { href: `https://search.bilibili.com/all?keyword=${encodeURIComponent(detail.nameCn || detail.name)}`, target: '_blank', rel: 'noopener noreferrer' }, '在 B 站搜索（搜索结果未确认）')),
        h('div', { style: { marginTop: 10 } }, h('button', { type: 'button', disabled: busy, onClick: loadWatchLinks, style: button }, '查询观看平台')),
        watch && h('section', null,
          h('p', { style: textStyle }, watch.platforms.length ? '平台作品页（是否可播放取决于地区和平台）' : '未找到平台作品页。'),
          watch.platforms.map(link => h('p', { key: link.url, style: textStyle }, h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, link.name), link.regions.length ? ` · 地区：${link.regions.join('、')}` : '')),
          h('p', { style: textStyle }, watch.dataset.state === 'stale' ? '当前使用过期缓存，数据可能已变化。 ' : '', '平台数据来源：', h('a', { href: watch.dataset.url, target: '_blank', rel: 'noopener noreferrer' }, 'bangumi-data（CC BY 4.0）'))),
        h('div', { style: { marginTop: 10 } }, h('button', { type: 'button', disabled: busy, onClick: saveDetail, style: button }, '保存到本地收藏'))),
      view === 'search' && !detail && entityRelated && h('section', null,
        h('button', { type: 'button', disabled: busy, onClick: () => { setEntityRelated(null); setStatus('请选择搜索结果。'); }, style: button }, '返回搜索结果'),
        h('h3', null, `${entityRelated.entityName} · 关联动画`),
        h('div', { style: { display: 'grid', gap: 8 } }, entityRelated.items.map(item => h('button', { key: item.id, type: 'button', disabled: busy, onClick: () => showDetails(item.id), style: { ...button, textAlign: 'left' } },
          h('strong', null, item.nameCn || item.name || `条目 ${item.id}`),
          item.roles.length > 0 && h('span', { style: { ...textStyle, display: 'block' } }, `${searchKind === 'voice' ? '配音角色' : '关联/职务'}：${item.roles.join('、')}`)))),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h('button', { type: 'button', disabled: busy || !(entityRelated.offset > 0), onClick: () => showEntity({ id: entityRelated.entityId, name: entityRelated.entityName }, Math.max(0, entityRelated.offset - entityRelated.limit)), style: button }, '上一页'),
          h('button', { type: 'button', disabled: busy || !entityRelated.truncated, onClick: () => showEntity({ id: entityRelated.entityId, name: entityRelated.entityName }, entityRelated.offset + entityRelated.limit), style: button }, '下一页'))),
      view === 'search' && !detail && !entityRelated && h('div', { style: { display: 'grid', gap: 8 } },
        items.map(item => h('button', { key: item.id, className: 'otk-card otk-result', type: 'button', disabled: busy, onClick: () => searchKind === 'anime' ? showDetails(item.id) : showEntity(item), style: { ...button, textAlign: 'left' } },
          item.image ? h('img', { src: item.image, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : h('span', { className: 'otk-placeholder', 'aria-hidden': true }, '✦'),
          h('strong', null, item.nameCn || item.name),
          h('span', { style: { ...textStyle, display: 'block', marginTop: 4 } }, searchKind === 'anime' ? `${item.date || '日期未知'} · 评分 ${item.score ?? '暂无'}` : (item.description || (item.career.length ? item.career.join('、') : `ID ${item.id}`))))),
        entityPage && h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { type: 'button', disabled: busy || entityPage.offset === 0, onClick: () => runSearch(Math.max(0, entityPage.offset - entityPage.limit)), style: button }, '上一页'),
          h('button', { type: 'button', disabled: busy || entityPage.offset + entityPage.limit >= entityPage.total, onClick: () => runSearch(entityPage.offset + entityPage.limit), style: button }, '下一页'))),
      view === 'calendar' && calendar.map(day => h('section', { key: day.weekday },
        h('h3', null, `星期${['', '一', '二', '三', '四', '五', '六', '日'][day.weekday]}`),
        day.items.length ? h('div', { style: { display: 'grid', gap: 6 } }, day.items.map(item =>
          h('button', { key: item.id, type: 'button', disabled: busy, onClick: () => showDetails(item.id), style: { ...button, textAlign: 'left' } }, item.nameCn || item.name))) : h('p', { style: textStyle }, '暂无条目'))),
      view === 'schedule' && h('section', null,
        h('p', { style: textStyle }, '手动安排每周观看时间，按填写时的本地时钟显示；不会自动同步 Bangumi 或转换时区。私密安排不会提供给 Agent。'),
        h('button', { type: 'button', disabled: busy || !schedules.length, onClick: exportSchedule, style: button }, '导出全部安排（ICS）'),
        h('p', { style: textStyle }, '导出包括私密安排；日历按本地时钟每周重复，不绑定时区。'),
        h('form', { key: scheduleDraft ? `${scheduleDraft.title}:${scheduleDraft.private}` : 'new', onSubmit: e => saveSchedule(e), style: { display: 'grid', gap: 8, marginBottom: 16 } },
          h('h3', null, '添加观看安排'),
          h('label', null, '名称 ', h('input', { name: 'title', required: true, maxLength: 200, disabled: busy, defaultValue: scheduleDraft?.title || '' })),
          h('label', null, '星期 ', h('select', { name: 'weekday', disabled: busy, defaultValue: 1 }, ['一', '二', '三', '四', '五', '六', '日'].map((day, i) => h('option', { key: day, value: i + 1 }, `星期${day}`)))),
          h('label', null, '观看时间 ', h('input', { name: 'watchTime', type: 'time', required: true, disabled: busy, defaultValue: '20:00' })),
          h('label', null, '时长（分钟） ', h('input', { name: 'duration', type: 'number', required: true, min: 1, max: 1440, disabled: busy, defaultValue: 24 })),
          h('label', null, h('input', { name: 'private', type: 'checkbox', disabled: busy, defaultChecked: scheduleDraft?.private || false }), ' 私密安排'),
          h('button', { type: 'submit', disabled: busy, style: button }, '添加安排')),
        schedules.map(item => h('form', { key: `${item.id}:${item.updatedAt}`, onSubmit: e => saveSchedule(e, item), style: { display: 'grid', gap: 8, padding: 12, border: '1px solid currentColor', borderRadius: 8, marginBottom: 10 } },
          h('label', null, '名称 ', h('input', { name: 'title', required: true, maxLength: 200, disabled: busy, defaultValue: item.title })),
          h('label', null, '星期 ', h('select', { name: 'weekday', disabled: busy, defaultValue: item.weekday }, ['一', '二', '三', '四', '五', '六', '日'].map((day, i) => h('option', { key: day, value: i + 1 }, `星期${day}`)))),
          h('label', null, '观看时间 ', h('input', { name: 'watchTime', type: 'time', required: true, disabled: busy, defaultValue: item.watchTime })),
          h('label', null, '时长（分钟） ', h('input', { name: 'duration', type: 'number', required: true, min: 1, max: 1440, disabled: busy, defaultValue: item.duration })),
          h('label', null, h('input', { name: 'private', type: 'checkbox', disabled: busy, defaultChecked: item.private }), ' 私密安排'),
          h('button', { type: 'submit', disabled: busy, style: button }, '保存安排'),
          deletingSchedule === item.id
            ? h('div', null, h('span', null, '确认删除这条安排？ '), h('button', { type: 'button', disabled: busy, style: button, onClick: () => deleteSchedule(item) }, '确认删除'), h('button', { type: 'button', disabled: busy, style: button, onClick: () => setDeletingSchedule(null) }, '取消'))
            : h('button', { type: 'button', disabled: busy, style: button, onClick: () => setDeletingSchedule(item.id) }, '删除安排')))),
      view === 'collection' && h('section', null,
        h('p', { style: textStyle }, '本地收藏由 OtakuNeko 工作区共享；观看安排、记忆和账号连接仍按各自范围保存。'),
        h('button', { type: 'button', disabled: busy, onClick: previewLegacy, style: button }, '预览当前工作区的旧收藏'),
        legacyPreview?.available && h('div', null,
          h('p', { style: textStyle }, `旧收藏 ${legacyPreview.total} 项：预计新增 ${legacyPreview.added} 项，跳过已有 ${legacyPreview.skipped} 项。不会覆盖共享收藏或删除旧数据。`),
          h('button', { type: 'button', disabled: busy || !legacyPreview.total, onClick: importLegacy, style: button }, '确认合并旧收藏'))),
      view === 'collection' && h('form', { onSubmit: filterCollections, key: 'collection-filter', style: { display: 'grid', gap: 8, marginBottom: 12 } },
        h('label', null, '搜索名称 ', h('input', { name: 'keyword', maxLength: 100, disabled: busy, defaultValue: collectionFilter.keyword })),
        h('label', null, '筛选状态 ', h('select', { name: 'status', disabled: busy, defaultValue: collectionFilter.status }, [['', '全部'], ['1', '想看'], ['2', '看过'], ['3', '在看'], ['4', '搁置'], ['5', '抛弃']].map(([value, label]) => h('option', { key: value, value }, label)))),
        h('button', { type: 'submit', disabled: busy, style: button }, '筛选收藏')),
      view === 'collection' && collections.map(item => h('form', { key: `${item.source}:${item.sourceId}:${item.updatedAt}`, className: 'otk-card', onSubmit: e => saveCollection(e, item), style: { display: 'grid', gap: 8, padding: 12, border: '1px solid currentColor', borderRadius: 8, marginBottom: 12 } },
        h('strong', null, item.nameCn || item.name),
        h('label', null, '状态 ', h('select', { name: 'status', disabled: busy, defaultValue: item.status },
          [[1, '想看'], [2, '看过'], [3, '在看'], [4, '搁置'], [5, '抛弃']].map(([value, label]) => h('option', { key: value, value }, label)))),
        h('label', null, '进度 ', h('input', { name: 'progress', type: 'number', required: true, disabled: busy, min: 0, max: 100000, defaultValue: item.progress })),
        h('label', null, '评分 ', h('input', { name: 'rating', type: 'number', disabled: busy, min: 0, max: 10, defaultValue: item.rating ?? '', placeholder: '0–10，留空为未评分' })),
        h('label', null, h('input', { name: 'private', type: 'checkbox', disabled: busy, defaultChecked: item.private }), ' 私密收藏'),
        h('label', null, '标签（逗号分隔） ', h('input', { name: 'tags', disabled: busy, maxLength: 1500, defaultValue: item.tags.join(', ') })),
        h('label', null, '备注 ', h('textarea', { name: 'comment', disabled: busy, maxLength: 5000, defaultValue: item.comment })),
        h('button', { type: 'submit', disabled: busy, style: button }, '保存更改'),
        h('button', { type: 'button', disabled: busy, style: button, onClick: () => scheduleCollection(item) }, '创建观看安排'),
        deletingCollection === `${item.source}:${item.sourceId}`
          ? h('div', null, h('span', null, '确认删除本地收藏？ '), h('button', { type: 'button', disabled: busy, style: button, onClick: () => deleteCollection(item) }, '确认删除'), h('button', { type: 'button', disabled: busy, style: button, onClick: () => setDeletingCollection(null) }, '取消'))
          : h('button', { type: 'button', disabled: busy, style: button, onClick: () => setDeletingCollection(`${item.source}:${item.sourceId}`) }, '删除本地收藏'))),
      view === 'collection' && h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { type: 'button', disabled: busy || collectionPage === 0, onClick: () => loadCollections(collectionPage - 1), style: button }, '上一页'),
        h('button', { type: 'button', disabled: busy || collections.length < 50, onClick: () => loadCollections(collectionPage + 1), style: button }, '下一页')),
      view === 'stats' && stats && h('section', null,
        h('p', { style: textStyle }, '共享本地收藏统计，包含私密条目；Agent 查询时不包含私密收藏。'),
        h('p', null, `总计 ${stats.total} · 想看 ${stats.wish} · 看过 ${stats.completed} · 在看 ${stats.watching} · 搁置 ${stats.onHold} · 抛弃 ${stats.dropped}`)),
      view === 'remote' && remote && h('section', null,
        h('p', { style: textStyle }, '勾选当前页要导入的收藏；已有本地条目会跳过，不会覆盖。本次导入状态、进度、评分与私密标记，不导入备注和标签。'),
        remote.items.map(item => h('article', { key: item.id, style: { padding: 10, border: '1px solid currentColor', borderRadius: 6, marginBottom: 8 } },
          h('label', null, h('input', { type: 'checkbox', disabled: busy, checked: remoteSelected.includes(item.id), onChange: e => { const checked = e.target.checked; setRemoteSelected(current => checked ? [...current, item.id] : current.filter(id => id !== item.id)); } }), ' ', h('strong', null, item.nameCn || item.name || `条目 ${item.id}`)),
          h('p', { style: textStyle }, `${['未知', '想看', '看过', '在看', '搁置', '抛弃'][item.status] || '未知'} · 进度 ${item.progress ?? '未知'} · 评分 ${item.rating || '未评分'}${item.private ? ' · 私密' : ''}`))),
        h('button', { type: 'button', disabled: busy || !remoteSelected.length, onClick: importRemote, style: button }, `导入所选 ${remoteSelected.length} 项`),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { type: 'button', disabled: busy || remote.offset === 0, onClick: () => loadRemote(Math.max(0, remote.offset - remote.limit)), style: button }, '上一页'),
          h('button', { type: 'button', disabled: busy || remote.offset + remote.limit >= remote.total, onClick: () => loadRemote(remote.offset + remote.limit), style: button }, '下一页'))),
      view === 'account' && h('section', null,
        account?.connected && h('p', null, `当前账号：${account.user.nickname || account.user.username} (@${account.user.username})`),
        h('p', { style: textStyle }, '使用 Bangumi 个人访问令牌连接；这不是 OAuth 登录，也不会自动同步收藏。'),
        h('a', { href: 'https://next.bgm.tv/demo/access-token', target: '_blank', rel: 'noopener noreferrer' }, '在 Bangumi 创建个人令牌'),
        h('form', { onSubmit: connectAccount, style: { display: 'grid', gap: 8, marginTop: 12 } },
          h('label', null, '个人访问令牌 ', h('input', { name: 'token', type: 'password', autoComplete: 'off', required: true, disabled: busy, maxLength: 4096 })),
          h('button', { type: 'submit', disabled: busy, style: button }, account?.connected ? '验证并更换账号' : '验证并连接')),
        h('p', { style: textStyle }, '令牌保存在 Harness 凭据服务中；其默认本地文件可由同一系统用户及其 Agent 进程读取。'),
        account?.connected && h('button', { type: 'button', disabled: busy, onClick: disconnectAccount, style: button }, '删除本地凭据')),
      view === 'persona' && persona && h('form', { onSubmit: savePersona, style: { display: 'grid', gap: 10 } },
        h('p', { style: textStyle }, '此设置只应用于当前会话；选择“关闭”即可停止注入。模型参数仍由 Harness 管理。'),
        h('label', null, '启用人设 ', h('select', { name: 'selected', disabled: busy, defaultValue: persona.selected },
          [['none', '关闭'], ['preset-1', 'Bangumi 漫评分析师'], ['preset-2', '吐槽役'], ['preset-3', '傲娇猫娘辅助'], ['custom', '自定义']].map(([value, label]) => h('option', { key: value, value }, label)))),
        h('p', { style: textStyle }, '以下字段用于“自定义”人设；切换预设不会清除。'),
        h('label', null, '名称 ', h('input', { name: 'name', disabled: busy, maxLength: 80, defaultValue: persona.custom.name })),
        h('label', null, '核心身份 ', h('textarea', { name: 'persona', disabled: busy, maxLength: 2000, defaultValue: persona.custom.persona })),
        h('label', null, '语气风格 ', h('textarea', { name: 'tone', disabled: busy, maxLength: 1000, defaultValue: persona.custom.tone })),
        h('label', null, '行为准则 ', h('textarea', { name: 'rules', disabled: busy, maxLength: 3000, defaultValue: persona.custom.rules })),
        h('button', { type: 'submit', disabled: busy, style: button }, '保存人设')),
      view === 'network' && network && h('section', null,
        h('p', { style: textStyle }, '为当前工作区配置本机 HTTP 代理；留空使用 Harness 默认连接。不会更改其他插件的网络设置。'),
        h('form', { onSubmit: saveNetwork, style: { display: 'grid', gap: 8 } },
          h('label', null, 'HTTP 代理 ', h('input', { name: 'proxy', disabled: busy, maxLength: 200, defaultValue: network.proxy, placeholder: 'http://127.0.0.1:7890' })),
          h('button', { type: 'submit', disabled: busy, style: button }, '保存连接设置')),
        h('button', { type: 'button', disabled: busy, onClick: testNetwork, style: { ...button, marginTop: 8 } }, '测试 Bangumi 连接')));
  }

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID,
    kind: 'otakuneko-native',
    title: () => 'OtakuNeko',
    guide: [{ id: 'otakuneko-native', order: 100, title: () => 'OtakuNeko 番组', description: () => '搜索动画并查看详情' }],
  }), 'OtakuNeko tab');
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: ID }, OtakuNekoPanel,
  ));
}
