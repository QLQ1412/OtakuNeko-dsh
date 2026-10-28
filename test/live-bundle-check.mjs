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
  if (item.id !== 1 || scopedTools.length !== 8) throw new Error('Unexpected result');
  const detail = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_anime_details').execute({ subjectId: 1 }, { agent }));
  if (detail.id !== 1) throw new Error('Tool did not use workspace proxy');
  const episodes = JSON.parse(await scopedTools.find(tool => tool.name === 'otakuneko_native_anime_episodes').execute({ subjectId: 1, limit: 5 }, { agent }));
  if (!Array.isArray(episodes.items)) throw new Error('Episode lookup failed');
  console.log('Bundled plugin: workspace activation, proxy and Agent tool succeeded.');
} finally {
  for (const dispose of cleanup.reverse()) dispose();
  rmSync(directory, { recursive: true, force: true });
}
