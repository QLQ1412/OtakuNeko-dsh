import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibraryStore } from '../src/library.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('legacy workspace collection migration previews, skips conflicts and preserves source', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-legacy-'));
  try {
    const legacyPath = join(directory, 'old', 'library.sqlite3');
    const sharedPath = join(directory, 'shared.sqlite3');
    const legacy = createLibraryStore({ databasePath: legacyPath });
    legacy.saveCollection({ sourceId: 1, name: '旧收藏', comment: '保留旧笔记', private: true, tags: ['标签'] });
    legacy.saveCollection({ sourceId: 2, name: '旧的重复项', progress: 1 });
    const shared = createLibraryStore({ databasePath: sharedPath, legacyDatabasePath: legacyPath });
    shared.saveCollection({ sourceId: 2, name: '已有共享收藏', progress: 9 });
    const hash = () => createHash('sha256').update(readFileSync(legacyPath)).digest('hex');
    const before = hash();
    assert.deepEqual(shared.previewLegacyCollections(), { available: true, total: 2, added: 1, skipped: 1 });
    assert.equal(shared.listCollections({ includePrivate: true }).length, 1);
    assert.deepEqual(shared.importLegacyCollections(), { total: 2, added: 1, skipped: 1 });
    assert.equal(hash(), before);
    const all = shared.listCollections({ includePrivate: true });
    assert.equal(all.find(item => item.sourceId === '1').private, true);
    assert.equal(all.find(item => item.sourceId === '1').comment, '保留旧笔记');
    assert.deepEqual(all.find(item => item.sourceId === '1').tags, ['标签']);
    assert.equal(all.find(item => item.sourceId === '2').progress, 9);
    assert.deepEqual(shared.importLegacyCollections(), { total: 2, added: 0, skipped: 2 });
    const other = createLibraryStore({ databasePath: sharedPath, legacyDatabasePath: join(directory, 'absent.sqlite3') });
    assert.deepEqual(other.previewLegacyCollections(), { available: false, total: 0, added: 0, skipped: 0 });
    assert.throws(() => other.importLegacyCollections(), /没有旧版/);
    assert.equal(other.listCollections().length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('collection filters, safe agent updates and version-checked deletion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-filter-'));
  try {
    const store = createLibraryStore({ databasePath: join(directory, 'library.sqlite3') });
    const first = store.saveCollection({ sourceId: 1, name: '100% Anime', nameCn: '动画', status: 3, progress: 1, comment: 'private note' });
    store.saveCollection({ sourceId: 2, name: 'Hidden', status: 3, private: true });
    store.saveCollection({ sourceId: 3, name: 'Anime', status: 1 });
    assert.deepEqual(store.listCollections({ keyword: '%', status: 3 }).map(item => item.sourceId), ['1']);
    assert.deepEqual(store.listCollections({ keyword: '动画' }).map(item => item.sourceId), ['1']);
    assert.equal(store.listCollections({ status: 3 }).length, 1);
    assert.throws(() => store.updatePublicCollection({ sourceId: 2, progress: 2 }), /未找到/);
    assert.throws(() => store.updatePublicCollection({ sourceId: 1 }), /请指定/);
    const updated = store.updatePublicCollection({ sourceId: 1, progress: 5 });
    assert.equal(updated.progress, 5);
    assert.equal('comment' in updated, false);
    assert.equal(store.listCollections({ keyword: '动画' })[0].comment, 'private note');
    assert.throws(() => store.deleteCollection({ source: 'bangumi', sourceId: 1, expectedUpdatedAt: first.updatedAt }), /已更改/);
    assert.deepEqual(store.deleteCollection({ source: 'bangumi', sourceId: 1, expectedUpdatedAt: updated.updatedAt }), { deleted: true });
    assert.equal(store.listCollections({ keyword: '动画' }).length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('selected Bangumi imports are transactional, skip existing records and retain privacy', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-import-'));
  try {
    const store = createLibraryStore({ databasePath: join(directory, 'library.sqlite3') });
    store.saveCollection({ sourceId: 1, name: 'Local', progress: 9, comment: 'keep' });
    const item = { id: 1, name: 'Remote', nameCn: '', status: 2, rating: 8, progress: 1, private: false };
    const other = { ...item, id: 2, name: 'Private', private: true, status: 1 };
    assert.throws(() => store.importRemoteCollections([item, { ...other, status: 8 }]), /收藏状态/);
    assert.equal(store.listCollections({ includePrivate: true }).length, 1);
    assert.deepEqual(store.importRemoteCollections([item, other]), { selected: 2, imported: 1, skipped: 1 });
    assert.deepEqual(store.importRemoteCollections([other]), { selected: 1, imported: 0, skipped: 1 });
    const all = store.listCollections({ includePrivate: true });
    assert.equal(all.find(entry => entry.sourceId === '1').comment, 'keep');
    assert.equal(all.find(entry => entry.sourceId === '1').progress, 9);
    assert.equal(all.find(entry => entry.sourceId === '2').private, true);
    assert.deepEqual(store.collectionStats({ includePrivate: true }), { total: 2, wish: 1, completed: 0, watching: 1, onHold: 0, dropped: 0 });
    assert.equal(store.collectionStats().total, 1);
    assert.throws(() => store.importRemoteCollections([other, other]), /重复/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

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
