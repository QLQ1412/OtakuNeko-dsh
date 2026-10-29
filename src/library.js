import { existsSync, mkdirSync } from 'node:fs';
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

export function createLibraryStore({ databasePath = defaultDatabasePath(), legacyDatabasePath } = {}) {
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

  function listCollections({ includePrivate = false, limit = 100, offset = 0, status, keyword = '' } = {}) {
    const count = integer(limit, '数量', 1, 200, 100);
    const skip = integer(offset, '偏移量', 0, 1000000, 0);
    if (status !== undefined && status !== null) integer(status, '收藏状态', 1, 5);
    const query = text(keyword, '关键词', 100).replace(/[\\%_]/g, '\\$&');
    return withDatabase(db => db.prepare(
      `SELECT * FROM collections WHERE (? = 1 OR is_private = 0) AND (? IS NULL OR status = ?)
        AND (? = '' OR name LIKE ? ESCAPE '\\' OR name_cn LIKE ? ESCAPE '\\') ORDER BY updated_at DESC, source, source_id LIMIT ? OFFSET ?`,
    ).all(includePrivate ? 1 : 0, status ?? null, status ?? null, query, `%${query}%`, `%${query}%`, count, skip).map(mapRow));
  }

  function deleteCollection({ source, sourceId, expectedUpdatedAt } = {}) {
    source = text(source, '来源', 32);
    sourceId = text(typeof sourceId === 'number' ? String(sourceId) : sourceId, '条目 ID', 100);
    if (!/^[a-z][a-z0-9_-]*$/.test(source) || !sourceId || typeof expectedUpdatedAt !== 'string') throw new Error('删除参数无效');
    return withDatabase(db => {
      if (!db.prepare('DELETE FROM collections WHERE source = ? AND source_id = ? AND updated_at = ?').run(source, sourceId, expectedUpdatedAt).changes) throw new Error('收藏已更改或不存在，请刷新后重试');
      return { deleted: true };
    });
  }

  function updatePublicCollection({ source = 'bangumi', sourceId, status, progress, rating } = {}) {
    source = text(source, '来源', 32);
    sourceId = text(typeof sourceId === 'number' ? String(sourceId) : sourceId, '条目 ID', 100);
    if (!/^[a-z][a-z0-9_-]*$/.test(source) || !sourceId) throw new Error('收藏来源或条目 ID 无效');
    if (status === undefined && progress === undefined && rating === undefined) throw new Error('请指定要修改的状态、进度或评分');
    const current = withDatabase(db => db.prepare('SELECT * FROM collections WHERE source = ? AND source_id = ? AND is_private = 0').get(source, sourceId));
    if (!current) throw new Error('未找到可供 Agent 修改的本地收藏');
    const result = saveCollection({ source, sourceId, expectedUpdatedAt: current.updated_at, status, progress, rating });
    const { comment, tags, ...safe } = result;
    return safe;
  }

  function collectionStats({ includePrivate = false } = {}) {
    return withDatabase(db => {
      const rows = db.prepare('SELECT status, count(*) AS count FROM collections WHERE (? = 1 OR is_private = 0) GROUP BY status').all(includePrivate ? 1 : 0);
      const counts = [0, 0, 0, 0, 0];
      for (const row of rows) counts[row.status - 1] = row.count;
      return { total: counts.reduce((sum, count) => sum + count, 0), wish: counts[0], completed: counts[1], watching: counts[2], onHold: counts[3], dropped: counts[4] };
    });
  }

  function readLegacyCollections() {
    if (!legacyDatabasePath || !existsSync(legacyDatabasePath)) return null;
    const source = new DatabaseSync(legacyDatabasePath, { readOnly: true });
    try {
      source.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000');
      if (source.prepare('PRAGMA user_version').get().user_version !== 1) throw new Error('旧收藏数据库版本不受支持，未进行迁移');
      const rows = source.prepare('SELECT * FROM collections LIMIT 50001').all();
      if (rows.length > 50000) throw new Error('旧收藏超过 50000 条，请分批迁移');
      for (const row of rows) {
        let tags;
        try { tags = JSON.parse(row.tags_json); } catch { throw new Error('旧收藏标签数据无效，未进行迁移'); }
        if (typeof row.source !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(row.source) || typeof row.source_id !== 'string' || !row.source_id || row.source_id.length > 100 || typeof row.name !== 'string' || row.name.length > 300 || typeof row.name_cn !== 'string' || row.name_cn.length > 300 || (!row.name.trim() && !row.name_cn.trim()) || !Number.isInteger(row.status) || row.status < 1 || row.status > 5 || !Number.isInteger(row.progress) || row.progress < 0 || row.progress > 100000 || (row.rating !== null && (!Number.isInteger(row.rating) || row.rating < 0 || row.rating > 10)) || ![0, 1].includes(row.is_private) || typeof row.comment !== 'string' || row.comment.length > 5000 || !Array.isArray(tags) || tags.length > 30 || tags.some(tag => typeof tag !== 'string' || tag.length > 50) || typeof row.updated_at !== 'string') throw new Error('旧收藏数据无效，未进行迁移');
      }
      return rows;
    } finally { source.close(); }
  }

  function previewLegacyCollections() {
    const rows = readLegacyCollections();
    if (!rows) return { available: false, total: 0, added: 0, skipped: 0 };
    return withDatabase(db => {
      const find = db.prepare('SELECT 1 FROM collections WHERE source = ? AND source_id = ?');
      let skipped = 0;
      for (const row of rows) if (find.get(row.source, row.source_id)) skipped++;
      return { available: true, total: rows.length, added: rows.length - skipped, skipped };
    });
  }

  function importLegacyCollections() {
    const rows = readLegacyCollections();
    if (!rows) throw new Error('当前工作区没有旧版收藏数据库');
    return withDatabase(db => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare(`INSERT INTO collections (source, source_id, name, name_cn, status, progress, rating, is_private, comment, tags_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source, source_id) DO NOTHING`);
        let added = 0;
        for (const row of rows) added += Number(insert.run(row.source, row.source_id, row.name, row.name_cn, row.status, row.progress, row.rating, row.is_private, row.comment, row.tags_json, row.updated_at).changes);
        db.exec('COMMIT');
        return { total: rows.length, added, skipped: rows.length - added };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  function importRemoteCollections(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error('请选择 1 至 20 项收藏导入');
    const seen = new Set();
    const normalized = items.map(item => {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || seen.has(item.id)) throw new Error('收藏条目 ID 无效或重复');
      seen.add(item.id);
      const name = text(item.name, '名称', 300);
      const nameCn = text(item.nameCn, '中文名称', 300);
      const status = integer(item.status, '收藏状态', 1, 5);
      if (status === undefined) throw new Error('收藏状态缺失，未导入');
      const progress = item.progress === null ? 0 : integer(item.progress, '观看进度', 0, 100000, 0);
      const rating = item.rating === null ? null : integer(item.rating, '评分', 0, 10, null);
      if (typeof item.private !== 'boolean') throw new Error('隐私设置无效，未导入');
      return { sourceId: String(item.id), name: name || (!nameCn ? `Bangumi #${item.id}` : ''), nameCn, status, progress, rating, private: item.private };
    });
    return withDatabase(db => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare(`INSERT INTO collections (source, source_id, name, name_cn, status, progress, rating, is_private, comment, tags_json, updated_at)
          VALUES ('bangumi', ?, ?, ?, ?, ?, ?, ?, '', '[]', ?) ON CONFLICT(source, source_id) DO NOTHING`);
        let imported = 0;
        const updatedAt = new Date().toISOString();
        for (const item of normalized) imported += Number(insert.run(item.sourceId, item.name, item.nameCn, item.status, item.progress, item.rating, item.private ? 1 : 0, updatedAt).changes);
        db.exec('COMMIT');
        return { selected: normalized.length, imported, skipped: normalized.length - imported };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
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

  return { listCollections, saveCollection, deleteCollection, updatePublicCollection, collectionStats, importRemoteCollections, previewLegacyCollections, importLegacyCollections };
}
