import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../lib/index.mjs';

const directory = mkdtempSync(join(tmpdir(), 'otakuneko-bundle-proxy-'));
process.env.DSH_HOME = directory;
const routes = [];
const scopedTools = [];
const agent = { id: 'test-session', ctx: { tools: { register: tool => { scopedTools.push(tool); return () => {}; } } } };
const cleanup = [];
try {
  apply({
    agents: { list: () => [agent] }, on() {}, logger: { warn() {} },
    effect: callback => { const dispose = callback(); if (typeof dispose === 'function') cleanup.push(dispose); return dispose; },
    systemPrompt: { section: () => () => {} },
    workspaceRegistry: { list: () => [{ id: 'test-workspace', sessionIds: ['test-session'] }] },
    connection: { fetch: { register: route => routes.push(route) } },
  });
  async function call(operation, payload = {}) {
    const route = routes.find(item => item.path.endsWith(`/${operation}`));
    const request = new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: `otakuneko-native/${operation}`, payload: { sessionId: 'test-session', ...payload } }) });
    const result = (await (await route.fetch(request)).json()).result;
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }
  await call('workspace-activate');
  await call('network-save', { proxy: process.argv[2] });
  const item = await call('network-test');
  if (item.id !== 1 || scopedTools.length !== 16) throw new Error('Unexpected result');
  const detail = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_anime_details').execute({ subjectId: 1 }, { agent }));
  if (detail.id !== 1) throw new Error('Tool did not use workspace proxy');
  const episodes = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_anime_episodes').execute({ subjectId: 1, limit: 5 }, { agent }));
  if (!Array.isArray(episodes.items)) throw new Error('Episode lookup failed');
  const watch = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_watch_links').execute({ subjectId: 37258 }, { agent }));
  if (!watch.platforms.some(link => link.site === 'bilibili') || watch.dataset.state === 'unavailable') throw new Error('Verified platform link not found');
  console.log(`Watch links: dataset=${watch.dataset.state}; platforms=${watch.platforms.length}`);
  for (const [kind, keyword] of [['character', '綾波レイ'], ['voice', '花澤香菜'], ['staff', '京都アニメーション']]) {
    const result = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_search_entities').execute({ kind, keyword, limit: 5 }, { agent }));
    if (!result.items.length) throw new Error(`No ${kind} candidates for real search`);
    const works = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_entity_anime').execute({ kind, id: result.items[0].id }, { agent }));
    if (!Array.isArray(works.items)) throw new Error(`No ${kind} relation response`);
    console.log(`${kind}: candidates=${result.items.length}; related anime=${works.total}`);
  }
  console.log('Bundled plugin: workspace activation, proxy and Agent tool succeeded.');
} finally {
  for (const dispose of cleanup.reverse()) dispose();
  rmSync(directory, { recursive: true, force: true });
}
