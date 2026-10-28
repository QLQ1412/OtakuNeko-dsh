import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibraryStore } from '../src/library.js';

test('collection persists updates and preserves fields not supplied by the caller', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-test-'));
  try {
    const databasePath = join(directory, 'library.sqlite3');
    const store = createLibraryStore({ databasePath });
    const first = store.saveCollection({ sourceId: 42, name: 'Example', status: 1, progress: 3, rating: 8, private: true, comment: 'note', tags: ['动画'] });
    assert.equal(first.sourceId, '42');
    assert.deepEqual(store.listCollections(), []);
    const updated = store.saveCollection({ sourceId: 42, nameCn: '示例', status: 3 });
    assert.equal(updated.progress, 3);
    assert.equal(updated.rating, 8);
    assert.equal(updated.private, true);
    assert.equal(updated.comment, 'note');
    assert.deepEqual(updated.tags, ['动画']);
    assert.deepEqual(createLibraryStore({ databasePath }).listCollections({ includePrivate: true }), [updated]);
    assert.notEqual(first.updatedAt, updated.updatedAt);
    assert.throws(() => store.saveCollection({ sourceId: 42, expectedUpdatedAt: first.updatedAt, progress: 99 }), /其他窗口/);
    assert.throws(() => store.saveCollection({ sourceId: 42, progress: -1 }), /观看进度/);
    assert.deepEqual(store.listCollections({ includePrivate: true }), [updated]);
    assert.equal(store.saveCollection({ sourceId: 42, private: false, rating: null }).rating, null);
    assert.equal(store.listCollections().length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
