import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function defaultDatabasePath() {
  const configured = process.env.DSH_HOME?.trim();
  const home = configured
    ? resolve(configured.replace(/^~(?=[\\/]|$)/, homedir()))
    : join(homedir(), '.dsh');
  return join(home, 'otakuneko-native', 'library.sqlite3');
}

function integer(value, label, min, max, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}必须在 ${min} 到 ${max} 之间`);
  return value;
}

function text(value, label, max, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}格式不正确`);
  return value.trim();
}

function mapRow(row) {
  return {
    source: row.source, sourceId: row.source_id, name: row.name, nameCn: row.name_cn,
    status: row.status, progress: row.progress, rating: row.rating,
    private: row.is_private === 1, comment: row.comment, tags: JSON.parse(row.tags_json),
    updatedAt: row.updated_at,
  };
}

export function createLibraryStore({ databasePath = defaultDatabasePath() } = {}) {
  function withDatabase(callback) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1) throw new Error('收藏数据库版本较新，请升级插件后再使用');
      if (version === 0) {
        db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE IF NOT EXISTS collections (
            source TEXT NOT NULL, source_id TEXT NOT NULL,
            name TEXT NOT NULL, name_cn TEXT NOT NULL DEFAULT '',
            status INTEGER NOT NULL CHECK(status BETWEEN 1 AND 5),
            progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0),
            rating INTEGER CHECK(rating BETWEEN 0 AND 10),
            is_private INTEGER NOT NULL DEFAULT 0 CHECK(is_private IN (0, 1)),
            comment TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL,
            PRIMARY KEY(source, source_id)
          );
          PRAGMA user_version = 1;
          COMMIT;`);
      }
      return callback(db);
    } finally { db.close(); }
  }

  function listCollections({ includePrivate = false, limit = 100, offset = 0 } = {}) {
    const count = integer(limit, '数量', 1, 200, 100);
    const skip = integer(offset, '偏移量', 0, 1000000, 0);
    return withDatabase(db => db.prepare(
      'SELECT * FROM collections WHERE (? = 1 OR is_private = 0) ORDER BY updated_at DESC, source, source_id LIMIT ? OFFSET ?',
    ).all(includePrivate ? 1 : 0, count, skip).map(mapRow));
  }

  function saveCollection(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('收藏数据无效');
    const source = text(input.source, '来源', 32, 'bangumi');
    const sourceId = text(typeof input.sourceId === 'number' ? String(input.sourceId) : input.sourceId, '条目 ID', 100);
    if (!/^[a-z][a-z0-9_-]*$/.test(source) || !sourceId) throw new Error('收藏来源或条目 ID 无效');

    return withDatabase(db => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const old = db.prepare('SELECT * FROM collections WHERE source = ? AND source_id = ?').get(source, sourceId);
        if (input.expectedUpdatedAt !== undefined && (typeof input.expectedUpdatedAt !== 'string' || !old || input.expectedUpdatedAt !== old.updated_at)) {
          throw new Error('收藏已在其他窗口更改，请刷新收藏后重试');
        }
        const name = text(input.name, '名称', 300, old?.name || '');
        const nameCn = text(input.nameCn, '中文名称', 300, old?.name_cn || '');
        if (!name && !nameCn) throw new Error('收藏名称不能为空');
        const status = integer(input.status, '收藏状态', 1, 5, old?.status ?? 3);
        const progress = integer(input.progress, '观看进度', 0, 100000, old?.progress ?? 0);
        const rating = input.rating === null ? null : integer(input.rating, '评分', 0, 10, old?.rating ?? null);
        if (input.private !== undefined && typeof input.private !== 'boolean') throw new Error('隐私设置无效');
        const privateValue = input.private === undefined ? (old?.is_private ?? 0) : (input.private ? 1 : 0);
        const comment = text(input.comment, '备注', 5000, old?.comment || '');
        let tags = old ? JSON.parse(old.tags_json) : [];
        if (input.tags !== undefined) {
          if (!Array.isArray(input.tags) || input.tags.length > 30 || input.tags.some(tag => typeof tag !== 'string' || tag.length > 50)) {
            throw new Error('标签格式不正确');
          }
          tags = input.tags.map(tag => tag.trim()).filter(Boolean);
        }
        const previousTime = Date.parse(old?.updated_at || '');
        const updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
        db.prepare(`INSERT INTO collections (source, source_id, name, name_cn, status, progress, rating, is_private, comment, tags_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source, source_id) DO UPDATE SET name=excluded.name, name_cn=excluded.name_cn,
          status=excluded.status, progress=excluded.progress, rating=excluded.rating,
          is_private=excluded.is_private, comment=excluded.comment, tags_json=excluded.tags_json, updated_at=excluded.updated_at`)
          .run(source, sourceId, name, nameCn, status, progress, rating, privateValue, comment, JSON.stringify(tags), updatedAt);
        const result = mapRow(db.prepare('SELECT * FROM collections WHERE source = ? AND source_id = ?').get(source, sourceId));
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  return { listCollections, saveCollection };
}
