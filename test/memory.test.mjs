import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryStore } from '../src/memory.js';

test('memory is persisted per session and cannot be read or deleted from another session or workspace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-memory-'));
  try {
    const path = join(directory, 'workspace-a', 'memory.sqlite3');
    const a = createMemoryStore({ databasePath: path });
    const b = createMemoryStore({ databasePath: join(directory, 'workspace-b', 'memory.sqlite3') });
    const item = a.saveMemory('session-a', '不喜欢剧透');
    assert.equal(createMemoryStore({ databasePath: path }).listMemories('session-a')[0].content, '不喜欢剧透');
    assert.deepEqual(a.listMemories('session-b'), []);
    assert.deepEqual(b.listMemories('session-a'), []);
    assert.throws(() => a.deleteMemory('session-b', item.id), /不属于/);
    assert.throws(() => a.saveMemory('session-a', ' '), /记忆内容/);
    assert.deepEqual(a.deleteMemory('session-a', item.id), { deleted: true });
    assert.deepEqual(a.listMemories('session-a'), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
