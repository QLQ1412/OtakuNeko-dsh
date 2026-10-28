import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function workspaceIdentity(registry, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256) throw new Error('无法确定当前会话，请在工作区内打开一个会话');
  const matches = registry.list().filter(workspace => workspace.sessionIds.includes(sessionId));
  if (matches.length !== 1 || typeof matches[0].id !== 'string' || !matches[0].id) throw new Error('无法确定会话所属工作区，请在左侧工作区打开会话');
  return matches[0].id;
}

export function workspaceHash(workspaceId) {
  if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 512) throw new Error('工作区标识无效');
  return createHash('sha256').update(workspaceId).digest('hex');
}

export function workspaceDatabasePath(workspaceId) {
  const configured = process.env.DSH_HOME?.trim();
  const home = configured ? resolve(configured.replace(/^~(?=[\\/]|$)/, homedir())) : join(homedir(), '.dsh');
  return join(home, 'otakuneko-native', 'workspaces', workspaceHash(workspaceId), 'library.sqlite3');
}

export function workspaceEnabled(workspaceId) {
  return existsSync(join(dirname(workspaceDatabasePath(workspaceId)), 'enabled'));
}

export function enableWorkspace(workspaceId) {
  const directory = dirname(workspaceDatabasePath(workspaceId));
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'enabled'), '1', { flag: 'w' });
}
