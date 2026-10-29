import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createMemoryStore({ databasePath }) {
  function session(value) {
    if (typeof value !== 'string' || !value || value.length > 256) throw new Error('无法确定当前会话');
    return value;
  }
  function database(callback) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(`PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)`);
      return callback(db);
    } finally { db.close(); }
  }
  const map = row => ({ id: row.id, content: row.content, createdAt: row.created_at });
  function listMemories(sessionId) {
    session(sessionId);
    return database(db => db.prepare('SELECT id, content, created_at FROM memories WHERE session_id = ? ORDER BY created_at DESC, id').all(sessionId).map(map));
  }
  function saveMemory(sessionId, content) {
    session(sessionId);
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 1000) throw new Error('记忆内容须为 1 至 1000 个字符');
    return database(db => {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (db.prepare('SELECT count(*) AS n FROM memories WHERE session_id = ?').get(sessionId).n >= 200) throw new Error('当前会话最多保存 200 条记忆');
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        db.prepare('INSERT INTO memories (id, session_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, sessionId, content.trim(), createdAt);
        db.exec('COMMIT');
        return { id, content: content.trim(), createdAt };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }
  function deleteMemory(sessionId, id) {
    session(sessionId);
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('记忆 ID 无效');
    return database(db => {
      if (!db.prepare('DELETE FROM memories WHERE id = ? AND session_id = ?').run(id, sessionId).changes) throw new Error('记忆不存在或不属于当前会话');
      return { deleted: true };
    });
  }
  return { listMemories, saveMemory, deleteMemory };
}
