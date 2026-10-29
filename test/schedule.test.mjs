import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createScheduleStore } from '../src/schedule.js';

test('weekly schedule persists, filters private entries, and protects concurrent edits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-schedule-'));
  try {
    const path = join(directory, 'a', 'schedule.sqlite3');
    const a = createScheduleStore({ databasePath: path });
    const b = createScheduleStore({ databasePath: join(directory, 'b', 'schedule.sqlite3') });
    const entry = a.saveSchedule({ title: '动画', weekday: 1, watchTime: '20:00', duration: 24, private: false });
    a.saveSchedule({ title: '私密', weekday: 2, watchTime: '21:15', duration: 25, private: true });
    assert.equal(createScheduleStore({ databasePath: path }).listSchedules({ includePrivate: true }).length, 2);
    assert.deepEqual(b.listSchedules({ includePrivate: true }), []);
    assert.equal(a.listSchedules().length, 1);
    assert.equal(a.listSchedules({ weekday: 2 }).length, 0);
    assert.equal(a.listSchedules({ weekday: 2, includePrivate: true })[0].title, '私密');
    const changed = a.saveSchedule({ ...entry, expectedUpdatedAt: entry.updatedAt, title: '更新' });
    assert.throws(() => a.saveSchedule({ ...entry, expectedUpdatedAt: entry.updatedAt }), /已更改/);
    assert.throws(() => a.deleteSchedule({ id: entry.id, expectedUpdatedAt: entry.updatedAt }), /已更改/);
    assert.deepEqual(a.deleteSchedule({ id: entry.id, expectedUpdatedAt: changed.updatedAt }), { deleted: true });
    assert.equal(a.listSchedules().length, 0);
    assert.throws(() => a.saveSchedule({ title: 'A', weekday: 1, watchTime: '24:00', duration: 24, private: false }), /观看时间/);
    assert.throws(() => a.listSchedules({ weekday: 0 }), /星期/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
