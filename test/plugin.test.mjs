import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { apply } from '../src/index.js';

test('sidebar displays the current session conversation result with artwork', async () => {
  let registration, panel, timer;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController, setTimeout: callback => { timer = callback; return 1; }, clearTimeout() {} });
  let index = 0;
  const state = [], effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect(callback) { index++; effects.push(callback); },
  };
  let revision = 1;
  registration.factory(() => react).apply({ effect: cb => cb(), sidebarRightTabs: { register: () => () => {} }, slots: { inject: (_name, cb) => cb(), register: (_definition, component) => { panel = component; } }, connection: { rpc: { call: async (_channel, method, payload) => {
    assert.equal(payload.sessionId, 'session-a');
    if (method.endsWith('/workspace-activate')) return { ok: true };
    if (method.endsWith('/conversation-result')) return { ok: true, value: { revision, kind: 'voice', value: { keyword: '声优甲', total: 1, items: [{ id: 10, name: '声优甲', image: 'https://lain.bgm.tv/pic/a.jpg', description: '', career: [] }] } } };
    if (method.endsWith('/collection-list')) return { ok: true, value: [] };
    throw new Error(method);
  } } } });
  const render = () => { index = 0; return panel({ sessionId: 'session-a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  render();
  const cleanups = effects.splice(0).map(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(elements(render()).some(node => node.type === 'img' && node.props.src === 'https://lain.bgm.tv/pic/a.jpg'));
  assert.equal(elements(render()).find(node => node.props['aria-label'] === '搜索类别').props.value, 'voice');
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏').props.onClick();
  render();
  revision = 2;
  await timer();
  assert.ok(elements(render()).some(node => node.props['aria-pressed'] === true && node.children[0] === '收藏'));
  cleanups.forEach(cleanup => typeof cleanup === 'function' && cleanup());
});

test('anime detail shows labeled search and loads attributed platform links', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController });
  let index = 0;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  let panel;
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: async (_channel, method, payload) => {
      if (method.endsWith('/search')) return { ok: true, value: { total: 1, items: [{ id: 42, name: '动画', nameCn: '', date: '', score: null }] } };
      if (method.endsWith('/details')) return { ok: true, value: { id: 42, name: '动画', nameCn: '', url: 'https://bgm.tv/subject/42' } };
      if (method.endsWith('/watch-links')) { assert.equal(payload.id, 42); return { ok: true, value: { platforms: [{ name: 'B站', url: 'https://www.bilibili.com/bangumi/media/md1/', regions: ['CN'] }], dataset: { state: 'fresh', url: 'https://github.com/bangumi-data/bangumi-data' } } }; }
      throw new Error('unexpected call');
    } } },
  });
  const render = () => { index = 0; return panel({ sessionId: 'session-a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  elements(render()).find(node => node.props['aria-label'] === '搜索关键词').props.onChange({ target: { value: '动画' } });
  await elements(render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await elements(render()).find(node => node.type === 'button' && elements(node).some(child => child.type === 'strong' && child.children[0] === '动画')).props.onClick();
  assert.match(elements(render()).find(node => node.type === 'a' && node.children[0].includes('B 站搜索')).props.href, /^https:\/\/search\.bilibili\.com\/all\?keyword=/);
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '查询观看平台').props.onClick();
  assert.ok(elements(render()).some(node => node.type === 'a' && node.children[0] === 'B站'));
  assert.ok(elements(render()).some(node => node.type === 'a' && node.children[0] === 'bangumi-data（CC BY 4.0）'));
});

test('sidebar can search voice actors, browse related anime and open its details', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController });
  let index = 0;
  const state = [], calls = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  let panel;
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: async (_channel, method, payload) => {
      calls.push({ method, payload });
      if (method.endsWith('/entity-search')) return { ok: true, value: { total: 1, items: [{ id: 10, name: '声优甲', description: '', career: ['seiyu'] }] } };
      if (method.endsWith('/entity-anime')) return { ok: true, value: { total: 1, truncated: false, items: [{ id: 99, name: 'Anime', nameCn: '动画甲', roles: ['角色甲'] }] } };
      if (method.endsWith('/details')) return { ok: true, value: { id: 99, name: 'Anime', nameCn: '动画甲', url: 'https://bgm.tv/subject/99' } };
      throw new Error('unexpected call');
    } } },
  });
  const render = () => { index = 0; return panel({ sessionId: 'session-a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  elements(render()).find(node => node.props['aria-label'] === '搜索类别').props.onChange({ target: { value: 'voice' } });
  elements(render()).find(node => node.props['aria-label'] === '搜索关键词').props.onChange({ target: { value: '声优' } });
  await elements(render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0].payload.kind, 'voice');
  await elements(render()).find(node => node.type === 'button' && elements(node).some(child => child.type === 'strong' && child.children[0] === '声优甲')).props.onClick();
  assert.equal(calls[1].payload.id, 10);
  assert.ok(elements(render()).some(node => node.type === 'span' && String(node.children[0]).includes('角色甲')));
  await elements(render()).find(node => node.type === 'button' && elements(node).some(child => child.type === 'strong' && child.children[0] === '动画甲')).props.onClick();
  assert.equal(calls[2].payload.id, 99);
  assert.ok(elements(render()).some(node => node.type === 'a' && node.children[0] === '在 Bangumi 查看'));
});

test('legacy collections require preview and explicit merge from the current session', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController });
  let index = 0;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  let panel, imported = false, importSession;
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: async (_channel, method, payload) => {
      if (method.endsWith('/collection-list')) return { ok: true, value: [] };
      if (method.endsWith('/collection-legacy-preview')) return { ok: true, value: { available: true, total: 2, added: 1, skipped: 1 } };
      if (method.endsWith('/collection-legacy-import')) { imported = true; importSession = payload.sessionId; return { ok: true, value: { total: 2, added: 1, skipped: 1 } }; }
      throw new Error('unexpected call');
    } } },
  });
  const render = () => { index = 0; return panel({ sessionId: 'session-a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏').props.onClick();
  assert.equal(elements(render()).some(node => node.type === 'button' && node.children[0] === '确认合并旧收藏'), false);
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '预览当前工作区的旧收藏').props.onClick();
  assert.equal(imported, false);
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '确认合并旧收藏').props.onClick();
  assert.equal(imported, true);
  assert.equal(importSession, 'session-a');
  assert.match(elements(render()).find(node => node.props.role === 'status').children[0], /新增 1 项，跳过已有 1 项/);
});

test('collection sidebar prefills private schedule and confirms local deletion', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController });
  let index = 0;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  const item = { source: 'bangumi', sourceId: '42', name: 'A', nameCn: '私密番组', status: 3, progress: 0, rating: null, private: true, comment: '', tags: [], updatedAt: 'v1' };
  let deleted = false, panel;
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: async (_channel, method) => {
      if (method.endsWith('/collection-list')) return { ok: true, value: deleted ? [] : [item] };
      if (method.endsWith('/schedule-list')) return { ok: true, value: [] };
      if (method.endsWith('/collection-delete')) { deleted = true; return { ok: true, value: { deleted: true } }; }
      throw new Error('unexpected call');
    } } },
  });
  const render = () => { index = 0; return panel({ sessionId: 'a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏').props.onClick();
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '创建观看安排').props.onClick();
  assert.equal(elements(render()).find(node => node.props.name === 'title').props.defaultValue, '私密番组');
  assert.equal(elements(render()).find(node => node.props.name === 'private').props.defaultChecked, true);
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏').props.onClick();
  elements(render()).find(node => node.type === 'button' && node.children[0] === '删除本地收藏').props.onClick();
  assert.equal(deleted, false);
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '确认删除').props.onClick();
  assert.equal(deleted, true);
});

test('sidebar imports only explicitly selected remote entries and displays results', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController });
  let index = 0;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  const entries = [1, 2].map(id => ({ id, name: `Anime ${id}`, nameCn: '', status: 3, rating: 8, progress: 1, private: id === 2 }));
  let panel;
  let imported;
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: async (_channel, method, payload) => {
      if (method.endsWith('/collection-list')) return { ok: true, value: [] };
      if (method.endsWith('/collection-stats')) return { ok: true, value: { total: 2, wish: 1, completed: 1, watching: 0, onHold: 0, dropped: 0 } };
      if (method.endsWith('/remote-collections')) return { ok: true, value: { items: entries, total: 2, offset: 0, limit: 20 } };
      if (method.endsWith('/collection-import')) { imported = payload.items; return { ok: true, value: { selected: 1, imported: 1, skipped: 0 } }; }
      throw new Error('unexpected call');
    } } },
  });
  const render = () => { index = 0; return panel({ sessionId: 'session-a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏').props.onClick();
  assert.ok(elements(render()).some(node => node.props['aria-label'] === '收藏分类'));
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏统计').props.onClick();
  assert.ok(elements(render()).some(node => node.type === 'p' && String(node.children[0]).includes('总计 2')));
  await elements(render()).find(node => node.type === 'button' && node.children[0] === 'Bangumi 收藏').props.onClick();
  elements(render()).filter(node => node.type === 'input' && node.props.type === 'checkbox')[1].props.onChange({ target: { checked: true } });
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '导入所选 1 项').props.onClick();
  assert.equal(imported.length, 1);
  assert.equal(imported[0].id, 2);
  assert.equal(imported[0].private, true);
  assert.match(elements(render()).find(node => node.props.role === 'status').children[0], /已导入 1 项/);
});

test('sidebar schedule adds a local entry and requires confirmation before deleting', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  class FakeFormData {
    constructor(values) { this.values = values; }
    get(key) { return this.values[key] ?? null; }
    has(key) { return Object.hasOwn(this.values, key); }
  }
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController, FormData: FakeFormData });
  let index = 0;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  const entries = [];
  const methods = [];
  let panel;
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: async (_channel, method, payload) => {
      methods.push(method);
      if (method.endsWith('/schedule-save')) entries.push({ ...payload, id: 'id', updatedAt: 'v1' });
      if (method.endsWith('/schedule-delete')) entries.pop();
      return { ok: true, value: method.endsWith('/schedule-list') ? [...entries] : { deleted: true } };
    } } },
  });
  const render = () => { index = 0; return panel({ sessionId: 'session-a' }); };
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(elements)];
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '追番时间表').props.onClick();
  const form = elements(render()).find(node => node.type === 'form');
  await form.props.onSubmit({ preventDefault() {}, currentTarget: { title: '测试', weekday: '1', watchTime: '20:00', duration: '24', reset() {} } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].private, false);
  elements(render()).find(node => node.type === 'button' && node.children[0] === '删除安排').props.onClick();
  assert.equal(methods.some(method => method.endsWith('/schedule-delete')), false);
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '确认删除').props.onClick();
  assert.equal(entries.length, 0);
});

test('Host registers independent tools and authenticated RPC using the same service', async () => {
  const originalFetch = globalThis.fetch;
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-tools-test-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  globalThis.fetch = async () => Response.json({ total: 1, data: [{ id: 3, name: 'Test' }] });
  try {
    const tools = [];
    const routes = [];
    const agent = { id: 'session-a', ctx: { tools: { register: tool => { tools.push(tool); return () => {}; } } } };
    apply({
      effect: callback => callback(), systemPrompt: { section: () => () => {} },
      on() {}, agents: { list: () => [agent] },
      workspaceRegistry: { list: () => [{ id: 'workspace-a', sessionIds: ['session-a', 'session-b'] }] },
      tools: { register: tool => tools.push(tool) },
      connection: { fetch: { register: route => routes.push(route) } },
    });
    assert.equal(tools.length, 0);
    assert.ok(routes.some(route => route.path === '/api/otakuneko-native/conversation-result'));
    const activate = routes.find(route => route.path.endsWith('/workspace-activate'));
    const activationRequest = new Request(`http://localhost${activate.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'a', method: 'otakuneko-native/workspace-activate', payload: { sessionId: 'session-a' } }) });
    assert.equal((await (await activate.fetch(activationRequest)).json()).result.ok, true);
    assert.deepEqual(tools.map(tool => tool.name), ['otakuneko_native_anime_episodes', 'otakuneko_native_list_schedule', 'otakuneko_native_collection_stats', 'otakuneko_native_remember', 'otakuneko_native_recall', 'otakuneko_native_search_anime', 'otakuneko_native_search_entities', 'otakuneko_native_entity_anime', 'otakuneko_native_anime_details', 'otakuneko_native_watch_links', 'otakuneko_native_airing_calendar', 'otakuneko_native_list_collection', 'otakuneko_native_update_collection', 'otakuneko_native_search_advanced', 'otakuneko_native_anime_staff', 'otakuneko_native_anime_cast']);
    const request = new Request('http://localhost/api/otakuneko-native/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: 'otakuneko-native/search', payload: { keyword: 'Test', sessionId: 'session-a' } }) });
    const rpc = (await (await routes[0].fetch(request)).json()).result;
    const tool = JSON.parse(await tools.find(entry => entry.name === 'otakuneko_native_search_anime').execute({ keyword: 'Test' }, { agent }));
    await assert.rejects(tools.find(entry => entry.name === 'otakuneko_native_search_anime').execute({ keyword: 'Test' }, { agent: { id: 'other' } }), /当前会话/);
    assert.deepEqual(rpc.value, tool);
    const sync = routes.find(route => route.path.endsWith('/conversation-result'));
    const getSync = async sessionId => (await (await sync.fetch(new Request(`http://localhost${sync.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 's', method: 'otakuneko-native/conversation-result', payload: { sessionId } }) }))).json()).result.value;
    assert.equal((await getSync('session-a')).value.items[0].id, 3);
    assert.equal(await getSync('session-b'), null);
  } finally { globalThis.fetch = originalFetch; if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; rmSync(directory, { recursive: true, force: true }); }
});

test('owner RPC can edit collections while Agent tool omits private entries and notes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-rpc-test-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  try {
    const tools = [];
    const routes = [];
    const toolsB = [];
    const agents = [{ id: 'session-a', ctx: { tools: { register: tool => { tools.push(tool); return () => {}; } } } }, { id: 'session-b', ctx: { tools: { register: tool => { toolsB.push(tool); return () => {}; } } } }];
    apply({ on() {}, agents: { list: () => agents }, effect: callback => callback(), systemPrompt: { section: () => () => {} }, workspaceRegistry: { list: () => [{ id: 'workspace-a', sessionIds: ['session-a'] }, { id: 'workspace-b', sessionIds: ['session-b'] }] }, tools: { register() { throw new Error('global registration forbidden'); } }, connection: { fetch: { register: route => routes.push(route) } } });
    const call = async (operation, payload) => {
      const route = routes.find(entry => entry.path.endsWith(`/${operation}`));
      const request = new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: `otakuneko-native/${operation}`, payload: { sessionId: 'session-a', ...payload } }) });
      return (await (await route.fetch(request)).json()).result;
    };
    assert.equal((await call('workspace-activate', {})).ok, true);
    const savedMemory = JSON.parse(await tools.find(tool => tool.name === 'otakuneko_native_remember').execute({ content: '不要剧透' }, { agent: { id: 'session-a' } }));
    assert.equal((await call('memory-list', {})).value[0].content, '不要剧透');
    assert.deepEqual((await call('memory-list', { sessionId: 'session-b' })).value, []);
    assert.equal((await call('memory-delete', { sessionId: 'session-b', id: savedMemory.id })).ok, false);
    assert.equal(JSON.parse(await tools.find(tool => tool.name === 'otakuneko_native_recall').execute({}, { agent: { id: 'session-a' } })).items.length, 1);
    assert.equal((await call('schedule-save', { title: 'Public schedule', weekday: 1, watchTime: '20:00', duration: 24, private: false })).ok, true);
    assert.equal((await call('schedule-save', { title: 'Private schedule', weekday: 1, watchTime: '21:00', duration: 24, private: true })).ok, true);
    assert.equal((await call('schedule-list', {})).value.length, 2);
    assert.deepEqual((await call('schedule-list', { sessionId: 'session-b' })).value, []);
    const schedule = JSON.parse(await tools.find(tool => tool.name === 'otakuneko_native_list_schedule').execute({}, { agent: { id: 'session-a' } }));
    assert.deepEqual(schedule.map(item => item.title), ['Public schedule']);
    assert.equal(toolsB.length, 0);
    assert.equal((await call('collection-save', { sourceId: 1, name: 'Public', comment: 'secret note', tags: ['personal'] })).ok, true);
    assert.equal((await call('collection-save', { sourceId: 2, name: 'Private', private: true })).ok, true);
    const update = tools.find(tool => tool.name === 'otakuneko_native_update_collection');
    const updated = JSON.parse(await update.execute({ sourceId: '1', progress: 5 }, { agent: { id: 'session-a' } }));
    assert.equal(updated.progress, 5);
    assert.equal('comment' in updated, false);
    await assert.rejects(update.execute({ sourceId: '2', progress: 5 }, { agent: { id: 'session-a' } }), /未找到/);
    await assert.rejects(update.execute({ sourceId: '1', progress: 5 }, { agent: { id: 'session-b' } }), /当前会话/);
    const selected = [{ id: 2, name: 'Online', nameCn: '', status: 1, rating: 5, progress: 1, private: false }, { id: 3, name: 'Online private', nameCn: '', status: 3, rating: 8, progress: 2, private: true }];
    assert.deepEqual((await call('collection-import', { items: selected })).value, { selected: 2, imported: 1, skipped: 1 });
    assert.equal((await call('collection-list', {})).value.find(item => item.sourceId === '2').private, true);
    assert.equal((await call('collection-list', {})).value.length, 3);
    assert.equal((await call('collection-stats', {})).value.total, 3);
    assert.equal((await call('collection-stats', { sessionId: 'session-b' })).ok, false);
    assert.equal(JSON.parse(await tools.find(tool => tool.name === 'otakuneko_native_collection_stats').execute({}, { agent: { id: 'session-a' } })).total, 1);
    assert.equal((await call('collection-list', { sessionId: 'session-b' })).ok, false);
    assert.equal((await call('collection-list', { sessionId: 'unknown' })).ok, false);
    const agent = JSON.parse(await tools.find(tool => tool.name === 'otakuneko_native_list_collection').execute({}, { agent: { id: 'session-a' } }));
    assert.equal(agent.length, 1);
    assert.equal(agent[0].name, 'Public');
    assert.equal('comment' in agent[0], false);
    assert.equal('tags' in agent[0], false);
    assert.equal((await call('workspace-activate', { sessionId: 'session-b' })).ok, true);
    assert.equal((await call('collection-list', { sessionId: 'session-b' })).value.length, 3);
    assert.equal((await call('collection-stats', { sessionId: 'session-b' })).value.total, 3);
    assert.equal(JSON.parse(await toolsB.find(tool => tool.name === 'otakuneko_native_list_collection').execute({}, { agent: { id: 'session-b' } })).length, 1);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('persona RPC changes the dynamic Harness section without replacing the system prompt', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-persona-rpc-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  try {
    let section;
    const routes = [];
    apply({ on() {}, agents: { list: () => [] }, effect: callback => callback(), systemPrompt: { section: value => { section = value; return () => {}; } }, workspaceRegistry: { list: () => [{ id: 'workspace-a', sessionIds: ['session-a'] }, { id: 'workspace-b', sessionIds: ['session-b'] }] }, tools: { register() {} }, connection: { fetch: { register: route => routes.push(route) } } });
    assert.equal(section.complete, undefined);
    assert.equal(section.interpolate, false);
    assert.equal(section.text(), '');
    const route = routes.find(entry => entry.path.endsWith('/persona-save'));
    const request = new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: 'otakuneko-native/persona-save', payload: { sessionId: 'session-a', selected: 'custom', custom: { name: '角色', persona: '身份 {{test}}', tone: '', rules: '' } } }) });
    assert.equal((await (await route.fetch(request)).json()).result.ok, true);
    assert.match(section.text({ agent: { id: 'session-a' } }), /身份 \{\{test\}\}/);
    assert.equal(section.text({ agent: { id: 'session-b' } }), '');
    assert.equal(section.text({}), '');
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('built client registers a native sidebar tab and body with Harness loader', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  assert.equal(registration.id, 'otakuneko-harness-native-plugin');
  const client = registration.factory(name => {
    assert.equal(name, 'react');
    return { createElement() {}, useEffect() {}, useRef() {}, useState() {} };
  });
  let tab;
  let slot;
  client.apply({
    effect: callback => callback(),
    sidebarRightTabs: { register: definition => { definition.guide.map(entry => entry.title()); tab = definition; return () => {}; } },
    slots: { inject: (_name, callback) => callback(), register: (definition, component) => { slot = { definition, component }; } },
  });
  assert.equal(tab.kind, 'otakuneko-native');
  assert.equal(tab.guide.length, 1);
  assert.equal(tab.guide[0].id, 'otakuneko-native');
  assert.equal(tab.guide[0].title(), 'OtakuNeko 番组');
  assert.equal(tab.id, registration.id);
  assert.equal(slot.definition.key, registration.id);
  assert.equal(typeof slot.component, 'function');
});

test('sidebar sends searches over Harness Connection and cancels on unmount', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController });
  let index = 0;
  const state = [];
  let cleanup;
  let mounted = true;
  let lateUpdates = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const key = index++;
      if (!(key in state)) state[key] = initial;
      return [state[key], value => { if (!mounted) lateUpdates++; state[key] = value; }];
    },
    useRef(initial) {
      const key = index++;
      if (!(key in state)) state[key] = { current: initial };
      return state[key];
    },
    useEffect(callback) { index++; if (!cleanup) cleanup = callback(); },
  };
  const client = registration.factory(() => react);
  let panel;
  let rpcCall;
  let finish;
  client.apply({
    effect: callback => callback(),
    sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: (...args) => { rpcCall = args; return new Promise(resolve => { finish = resolve; }); } } },
  });
  const render = () => { index = 0; return panel(); };
  render().children[1].children[0].props.onChange({ target: { value: '动画' } });
  const submitted = render().children[1].props.onSubmit({ preventDefault() {} });
  assert.equal(rpcCall[0], '/api');
  assert.equal(rpcCall[1], 'otakuneko-native/search');
  assert.equal(rpcCall[2].keyword, '动画');
  mounted = false;
  cleanup();
  assert.equal(rpcCall[3].aborted, true);
  finish({ ok: true, value: { items: [], total: 0 } });
  await submitted;
  assert.equal(lateUpdates, 0);
});

test('collection editor rejects empty progress and locks edits while saving', async () => {
  let registration;
  const script = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  class FakeFormData {
    constructor(values) { this.values = values; }
    get(key) { return this.values[key] ?? null; }
    has(key) { return Object.hasOwn(this.values, key); }
  }
  vm.runInNewContext(script, { window: { __ModuleLoader__: { load: value => { registration = value; } } }, AbortController, FormData: FakeFormData });
  let index = 0;
  const state = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
    useRef(initial) { const key = index++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
    useEffect() { index++; },
  };
  let panel;
  let resolveSave;
  let saves = 0;
  const item = { source: 'bangumi', sourceId: '42', name: 'Example', nameCn: '', status: 3, progress: 2, rating: null, private: false, comment: '', tags: [], updatedAt: 'before' };
  registration.factory(() => react).apply({
    effect: callback => callback(), sidebarRightTabs: { register: () => () => {} },
    slots: { inject: (_name, callback) => callback(), register: (_definition, component) => { panel = component; } },
    connection: { rpc: { call: (_channel, method) => {
      if (method.endsWith('/collection-list')) return Promise.resolve({ ok: true, value: [item] });
      if (method.endsWith('/collection-save')) { saves++; return new Promise(resolve => { resolveSave = resolve; }); }
      throw new Error(`Unexpected method ${method}`);
    } } },
  });
  const render = () => { index = 0; return panel(); };
  const elements = root => {
    const found = [];
    function visit(node) { if (Array.isArray(node)) node.forEach(visit); else if (node && typeof node === 'object' && node.type) { found.push(node); visit(node.children); } }
    visit(root);
    return found;
  };
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '收藏').props.onClick();
  let form = elements(render()).find(node => node.type === 'form' && elements(node).some(child => child.props.name === 'progress'));
  await form.props.onSubmit({ preventDefault() {}, currentTarget: { status: '3', progress: '', rating: '', tags: '', comment: '' } });
  assert.equal(saves, 0);
  assert.ok(elements(render()).some(node => node.props.role === 'status' && String(node.children[0]).includes('请输入观看进度')));
  form = elements(render()).find(node => node.type === 'form' && elements(node).some(child => child.props.name === 'progress'));
  const submitted = form.props.onSubmit({ preventDefault() {}, currentTarget: { status: '3', progress: '3', rating: '', tags: '', comment: '' } });
  const duringSave = elements(render());
  assert.equal(duringSave.find(node => node.props.name === 'progress').props.disabled, true);
  assert.equal(duringSave.find(node => node.type === 'button' && node.children[0] === '搜索').props.disabled, true);
  resolveSave({ ok: true, value: { ...item, progress: 3, updatedAt: 'after' } });
  await submitted;
  assert.equal(elements(render()).find(node => node.props.name === 'progress').props.disabled, false);
});
