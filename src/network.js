import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProxyAgent } from 'undici';
import { workspaceDatabasePath } from './workspace.js';

export function createWorkspaceNetwork(workspaceId, { fetchImpl = globalThis.fetch, agentFactory = uri => new ProxyAgent(uri) } = {}) {
  const configPath = join(dirname(workspaceDatabasePath(workspaceId)), 'network.json');
  let agent;
  let currentProxy;

  function state() {
    if (!existsSync(configPath)) return { proxy: '' };
    const data = JSON.parse(readFileSync(configPath, 'utf8'));
    return { proxy: validateProxy(data.proxy) };
  }
  function validateProxy(value) {
    if (value === '') return '';
    if (typeof value !== 'string' || value.length > 200) throw new Error('代理地址无效');
    let uri;
    try { uri = new URL(value.trim()); } catch { throw new Error('代理地址格式无效'); }
    if (uri.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname) || !uri.port || uri.username || uri.password || uri.pathname !== '/' || uri.search || uri.hash) {
      throw new Error('请填写不含账号密码的本机 HTTP 代理，例如 http://127.0.0.1:7890');
    }
    return uri.origin;
  }
  function save(input) {
    const proxy = validateProxy(input?.proxy);
    mkdirSync(dirname(configPath), { recursive: true });
    const temp = `${configPath}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, JSON.stringify({ proxy }), { flag: 'wx' }); renameSync(temp, configPath); }
    finally { rmSync(temp, { force: true }); }
    return { proxy };
  }
  async function fetch(url, options = {}) {
    const { proxy } = state();
    if (!proxy) return fetchImpl(url, options);
    if (currentProxy !== proxy) {
      const previous = agent;
      agent = agentFactory(proxy);
      currentProxy = proxy;
      if (previous) void previous.close().catch(() => {});
    }
    return fetchImpl(url, { ...options, dispatcher: agent });
  }
  function dispose() { if (agent) void agent.close().catch(() => {}); agent = undefined; }
  return { networkState: state, networkSave: save, fetch, dispose };
}
