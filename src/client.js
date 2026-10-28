import { createElement as h, useEffect, useRef, useState } from 'react';

const ID = 'otakuneko-harness-native-plugin';
const CHANNEL = '/api';
export const inject = ['sidebarRightTabs', 'slots', 'connection'];

export function apply(ctx) {
  function OtakuNekoPanel({ sessionId } = {}) {
    const [keyword, setKeyword] = useState('');
    const [items, setItems] = useState([]);
    const [detail, setDetail] = useState(null);
    const [status, setStatus] = useState('输入名称，搜索 Bangumi 动画。');
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState('search');
    const [calendar, setCalendar] = useState([]);
    const [collections, setCollections] = useState([]);
    const [collectionPage, setCollectionPage] = useState(0);
    const [account, setAccount] = useState(null);
    const [persona, setPersona] = useState(null);
    const [network, setNetwork] = useState(null);
    const [remote, setRemote] = useState(null);
    const pending = useRef(null);
    useEffect(() => () => {
      const current = pending.current;
      pending.current = null;
      current?.abort();
    }, []);
    useEffect(() => {
      pending.current?.abort();
      pending.current = null;
      setBusy(false);
      setSaving(false);
      setRemote(null);
      setCollections([]);
      setAccount(null);
      setPersona(null);
      setNetwork(null);
      setView('search');
      if (!sessionId) { setStatus('请先在工作区内打开会话。'); return; }
      setStatus('输入名称，搜索 Bangumi 动画。');
      const controller = new AbortController();
      ctx.connection.rpc.call(CHANNEL, 'otakuneko-native/workspace-activate', { sessionId }, controller.signal)
        .then(result => { if (!controller.signal.aborted && !result.ok) setStatus(result.error?.message || '无法启用当前工作区'); })
        .catch(() => { if (!controller.signal.aborted) setStatus('无法启用当前工作区'); });
      return () => controller.abort();
    }, [sessionId]);

    async function call(endpoint, payload) {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setSaving(['collection-save', 'account-connect', 'account-disconnect', 'persona-save', 'network-save'].includes(endpoint));
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

    async function search(event) {
      event.preventDefault();
      if (!keyword.trim() || keyword.trim().length > 100) {
        const current = pending.current;
        pending.current = null;
        current?.abort();
        setBusy(false);
        setStatus('请输入 1 至 100 个字符。');
        return;
      }
      setDetail(null);
      setItems([]);
      const result = await call('search', { keyword: keyword.trim(), limit: 12 });
      if (result) {
        setItems(result.items);
        setStatus(result.items.length ? `找到 ${result.total} 条结果` : '没有找到动画，试试其他名称。');
      }
    }

    async function showDetails(id) {
      const result = await call('details', { id });
      if (result) { setDetail(result); setView('search'); }
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
      const result = await call('remote-collections', { offset, limit: 20 });
      if (result) { setRemote(result); setStatus(`Bangumi 账号收藏：共 ${result.total} 项，仅供查看。`); }
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
      if (result) { setAccount(result); setStatus('Bangumi 账号验证成功，个人令牌已保存。'); }
    }

    async function disconnectAccount() {
      const result = await call('account-disconnect', {});
      if (result) { setAccount(result); setStatus('已删除本机保存的令牌；如需撤销令牌，请在 Bangumi 管理。'); }
    }

    async function loadCollections(page) {
      const result = await call('collection-list', { limit: 50, offset: page * 50 });
      if (result) { setCollectionPage(page); setCollections(result); setStatus(result.length ? '收藏保存在本机。' : (page ? '没有更多收藏。' : '暂无本地收藏，可从搜索结果添加。')); }
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

    const button = { cursor: 'pointer', padding: '8px 10px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit' };
    const textStyle = { opacity: 0.8, fontSize: 13, lineHeight: 1.5 };
    return h('section', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', color: 'inherit' } },
      h('h2', { style: { margin: '0 0 12px', fontSize: 18 } }, 'OtakuNeko 番组'),
      view === 'search' && h('form', { onSubmit: search, style: { display: 'flex', gap: 8 } },
        h('input', { value: keyword, onChange: e => setKeyword(e.target.value), maxLength: 100, placeholder: '搜索动画名称', 'aria-label': '动画名称', style: { flex: 1, minWidth: 0, padding: 8, borderRadius: 6, border: '1px solid currentColor', color: 'inherit', background: 'transparent' } }),
        h('button', { type: 'submit', disabled: busy, style: button }, '搜索')),
      h('nav', { 'aria-label': '番组功能', style: { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' } },
        [['search', '搜索'], ['calendar', '放送日历'], ['collection', '本地收藏'], ['remote', 'Bangumi 收藏'], ['account', '账号'], ['persona', '人设'], ['network', '连接']].map(([key, label]) =>
          h('button', { key, type: 'button', disabled: saving, 'aria-pressed': view === key, onClick: () => changeView(key), style: button }, label))),
      h('p', { role: 'status', style: textStyle }, status),
      view === 'search' && detail && h('article', { style: { padding: 12, border: '1px solid currentColor', borderRadius: 8, marginBottom: 12 } },
        h('button', { type: 'button', onClick: () => setDetail(null), style: button }, '返回结果'),
        h('h3', null, detail.nameCn || detail.name),
        detail.nameCn && detail.name && h('p', { style: textStyle }, detail.name),
        h('p', { style: textStyle }, `放送：${detail.date || '未知'}　评分：${detail.score ?? '暂无'}`),
        h('p', { style: { ...textStyle, whiteSpace: 'pre-wrap' } }, detail.summary || '暂无简介。'),
        h('a', { href: detail.url, target: '_blank', rel: 'noopener noreferrer' }, '在 Bangumi 查看'),
        h('div', { style: { marginTop: 10 } }, h('button', { type: 'button', disabled: busy, onClick: saveDetail, style: button }, '保存到本地收藏'))),
      view === 'search' && !detail && h('div', { style: { display: 'grid', gap: 8 } },
        items.map(item => h('button', { key: item.id, type: 'button', disabled: busy, onClick: () => showDetails(item.id), style: { ...button, textAlign: 'left' } },
          h('strong', null, item.nameCn || item.name),
          h('span', { style: { ...textStyle, display: 'block', marginTop: 4 } }, `${item.date || '日期未知'} · 评分 ${item.score ?? '暂无'}`)))),
      view === 'calendar' && calendar.map(day => h('section', { key: day.weekday },
        h('h3', null, `星期${['', '一', '二', '三', '四', '五', '六', '日'][day.weekday]}`),
        day.items.length ? h('div', { style: { display: 'grid', gap: 6 } }, day.items.map(item =>
          h('button', { key: item.id, type: 'button', disabled: busy, onClick: () => showDetails(item.id), style: { ...button, textAlign: 'left' } }, item.nameCn || item.name))) : h('p', { style: textStyle }, '暂无条目'))),
      view === 'collection' && collections.map(item => h('form', { key: `${item.source}:${item.sourceId}:${item.updatedAt}`, onSubmit: e => saveCollection(e, item), style: { display: 'grid', gap: 8, padding: 12, border: '1px solid currentColor', borderRadius: 8, marginBottom: 12 } },
        h('strong', null, item.nameCn || item.name),
        h('label', null, '状态 ', h('select', { name: 'status', disabled: busy, defaultValue: item.status },
          [[1, '想看'], [2, '看过'], [3, '在看'], [4, '搁置'], [5, '抛弃']].map(([value, label]) => h('option', { key: value, value }, label)))),
        h('label', null, '进度 ', h('input', { name: 'progress', type: 'number', required: true, disabled: busy, min: 0, max: 100000, defaultValue: item.progress })),
        h('label', null, '评分 ', h('input', { name: 'rating', type: 'number', disabled: busy, min: 0, max: 10, defaultValue: item.rating ?? '', placeholder: '0–10，留空为未评分' })),
        h('label', null, h('input', { name: 'private', type: 'checkbox', disabled: busy, defaultChecked: item.private }), ' 私密收藏'),
        h('label', null, '标签（逗号分隔） ', h('input', { name: 'tags', disabled: busy, maxLength: 1500, defaultValue: item.tags.join(', ') })),
        h('label', null, '备注 ', h('textarea', { name: 'comment', disabled: busy, maxLength: 5000, defaultValue: item.comment })),
        h('button', { type: 'submit', disabled: busy, style: button }, '保存更改'))),
      view === 'collection' && h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { type: 'button', disabled: busy || collectionPage === 0, onClick: () => loadCollections(collectionPage - 1), style: button }, '上一页'),
        h('button', { type: 'button', disabled: busy || collections.length < 50, onClick: () => loadCollections(collectionPage + 1), style: button }, '下一页')),
      view === 'remote' && remote && h('section', null,
        h('p', { style: textStyle }, '这是 Bangumi 账号的在线收藏，不会自动写入本地收藏。'),
        remote.items.map(item => h('article', { key: item.id, style: { padding: 10, border: '1px solid currentColor', borderRadius: 6, marginBottom: 8 } },
          h('strong', null, item.nameCn || item.name || `条目 ${item.id}`),
          h('p', { style: textStyle }, `${['未知', '想看', '看过', '在看', '搁置', '抛弃'][item.status] || '未知'} · 进度 ${item.progress ?? '未知'} · 评分 ${item.rating || '未评分'}${item.private ? ' · 私密' : ''}`))),
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
