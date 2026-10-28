import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { apply } from '../src/index.js';

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
      workspaceRegistry: { list: () => [{ id: 'workspace-a', sessionIds: ['session-a'] }] },
      tools: { register: tool => tools.push(tool) },
      connection: { fetch: { register: route => routes.push(route) } },
    });
    assert.equal(tools.length, 0);
    assert.deepEqual(routes.map(route => route.path), ['/api/otakuneko-native/search', '/api/otakuneko-native/details', '/api/otakuneko-native/calendar', '/api/otakuneko-native/collection-list', '/api/otakuneko-native/collection-save', '/api/otakuneko-native/account-status', '/api/otakuneko-native/account-connect', '/api/otakuneko-native/account-disconnect', '/api/otakuneko-native/persona-state', '/api/otakuneko-native/persona-save', '/api/otakuneko-native/workspace-activate', '/api/otakuneko-native/network-state', '/api/otakuneko-native/network-save', '/api/otakuneko-native/network-test', '/api/otakuneko-native/remote-collections']);
    const activate = routes.find(route => route.path.endsWith('/workspace-activate'));
    const activationRequest = new Request(`http://localhost${activate.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'a', method: 'otakuneko-native/workspace-activate', payload: { sessionId: 'session-a' } }) });
    assert.equal((await (await activate.fetch(activationRequest)).json()).result.ok, true);
    assert.deepEqual(tools.map(tool => tool.name), ['otakuneko_native_anime_episodes', 'otakuneko_native_search_anime', 'otakuneko_native_anime_details', 'otakuneko_native_airing_calendar', 'otakuneko_native_list_collection', 'otakuneko_native_search_advanced', 'otakuneko_native_anime_staff', 'otakuneko_native_anime_cast']);
    const request = new Request('http://localhost/api/otakuneko-native/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: 'otakuneko-native/search', payload: { keyword: 'Test', sessionId: 'session-a' } }) });
    const rpc = (await (await routes[0].fetch(request)).json()).result;
    const tool = JSON.parse(await tools.find(entry => entry.name === 'otakuneko_native_search_anime').execute({ keyword: 'Test' }, { agent }));
    await assert.rejects(tools.find(entry => entry.name === 'otakuneko_native_search_anime').execute({ keyword: 'Test' }, { agent: { id: 'other' } }), /当前会话/);
    assert.deepEqual(rpc.value, tool);
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
    assert.equal(toolsB.length, 0);
    assert.equal((await call('collection-save', { sourceId: 1, name: 'Public', comment: 'secret note', tags: ['personal'] })).ok, true);
    assert.equal((await call('collection-save', { sourceId: 2, name: 'Private', private: true })).ok, true);
    assert.equal((await call('collection-list', {})).value.length, 2);
    assert.deepEqual((await call('collection-list', { sessionId: 'session-b' })).value, []);
    assert.equal((await call('collection-list', { sessionId: 'unknown' })).ok, false);
    const agent = JSON.parse(await tools.find(tool => tool.name === 'otakuneko_native_list_collection').execute({}, { agent: { id: 'session-a' } }));
    assert.equal(agent.length, 1);
    assert.equal(agent[0].name, 'Public');
    assert.equal('comment' in agent[0], false);
    assert.equal('tags' in agent[0], false);
    assert.equal((await call('workspace-activate', { sessionId: 'session-b' })).ok, true);
    assert.deepEqual(JSON.parse(await toolsB.find(tool => tool.name === 'otakuneko_native_list_collection').execute({}, { agent: { id: 'session-b' } })), []);
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
  await elements(render()).find(node => node.type === 'button' && node.children[0] === '本地收藏').props.onClick();
  let form = elements(render()).find(node => node.type === 'form');
  await form.props.onSubmit({ preventDefault() {}, currentTarget: { status: '3', progress: '', rating: '', tags: '', comment: '' } });
  assert.equal(saves, 0);
  assert.ok(elements(render()).some(node => node.props.role === 'status' && String(node.children[0]).includes('请输入观看进度')));
  form = elements(render()).find(node => node.type === 'form');
  const submitted = form.props.onSubmit({ preventDefault() {}, currentTarget: { status: '3', progress: '3', rating: '', tags: '', comment: '' } });
  const duringSave = elements(render());
  assert.equal(duringSave.find(node => node.props.name === 'progress').props.disabled, true);
  assert.equal(duringSave.find(node => node.type === 'button' && node.children[0] === '搜索').props.disabled, true);
  resolveSave({ ok: true, value: { ...item, progress: 3, updatedAt: 'after' } });
  await submitted;
  assert.equal(elements(render()).find(node => node.props.name === 'progress').props.disabled, false);
});
