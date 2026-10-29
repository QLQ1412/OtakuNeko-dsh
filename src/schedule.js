import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Each workspace owns a separate file; times are wall-clock times, not UTC instants.
export function createScheduleStore({ databasePath }) {
  function withDatabase(callback) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(`PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, weekday INTEGER NOT NULL,
          watch_time TEXT NOT NULL, duration INTEGER NOT NULL,
          is_private INTEGER NOT NULL, updated_at TEXT NOT NULL
        )`);
      return callback(db);
    } finally { db.close(); }
  }
  const map = row => ({ id: row.id, title: row.title, weekday: row.weekday, watchTime: row.watch_time, duration: row.duration, private: row.is_private === 1, updatedAt: row.updated_at });
  function listSchedules({ includePrivate = false, weekday } = {}) {
    if (weekday !== undefined && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) throw new Error('星期必须在 1 到 7 之间');
    return withDatabase(db => db.prepare('SELECT * FROM schedules WHERE (? = 1 OR is_private = 0) AND (? IS NULL OR weekday = ?) ORDER BY weekday, watch_time, title, id').all(includePrivate ? 1 : 0, weekday ?? null, weekday ?? null).map(map));
  }
  function saveSchedule(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('时间表数据无效');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) throw new Error('请输入不超过 200 字符的名称');
    if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) throw new Error('星期必须在 1 到 7 之间');
    if (typeof input.watchTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.watchTime)) throw new Error('观看时间必须是 HH:mm 格式');
    if (!Number.isInteger(input.duration) || input.duration < 1 || input.duration > 1440) throw new Error('时长必须在 1 到 1440 分钟之间');
    if (typeof input.private !== 'boolean') throw new Error('隐私设置无效');
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/.test(input.id))) throw new Error('时间表 ID 无效');
    return withDatabase(db => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const old = input.id ? db.prepare('SELECT * FROM schedules WHERE id = ?').get(input.id) : null;
        if (input.id && (!old || input.expectedUpdatedAt !== old.updated_at)) throw new Error('时间表已更改或不存在，请刷新后重试');
        if (!old && db.prepare('SELECT count(*) AS n FROM schedules').get().n >= 500) throw new Error('每个工作区最多保存 500 条时间表');
        const previous = Date.parse(old?.updated_at || '');
        const updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
        const id = old?.id || randomUUID();
        db.prepare(`INSERT INTO schedules (id, title, weekday, watch_time, duration, is_private, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, weekday=excluded.weekday, watch_time=excluded.watch_time, duration=excluded.duration, is_private=excluded.is_private, updated_at=excluded.updated_at`)
          .run(id, input.title.trim(), input.weekday, input.watchTime, input.duration, input.private ? 1 : 0, updatedAt);
        const result = map(db.prepare('SELECT * FROM schedules WHERE id = ?').get(id));
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }
  function deleteSchedule({ id, expectedUpdatedAt } = {}) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || typeof expectedUpdatedAt !== 'string') throw new Error('删除参数无效');
    return withDatabase(db => {
      const result = db.prepare('DELETE FROM schedules WHERE id = ? AND updated_at = ?').run(id, expectedUpdatedAt);
      if (!result.changes) throw new Error('时间表已更改或不存在，请刷新后重试');
      return { deleted: true };
    });
  }
  return { listSchedules, saveSchedule, deleteSchedule };
}
