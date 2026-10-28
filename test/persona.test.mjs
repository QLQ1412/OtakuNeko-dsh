import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPersonaStore } from '../src/persona.js';

test('persona is opt-in, persists custom and preset choices and can be disabled', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-persona-test-'));
  try {
    const databasePath = join(directory, 'persona.sqlite3');
    const workspaceForSession = id => id === 'session-a' ? 'workspace-a' : 'workspace-b';
    const store = createPersonaStore({ databasePath, workspaceForSession });
    assert.equal(store.prompt('session-a'), '');
    assert.equal(store.prompt(), '');
    assert.equal(existsSync(databasePath), false);
    const custom = { name: '角色', persona: '身份 {{literal}}', tone: '友好', rules: '简洁' };
    store.personaSave({ sessionId: 'session-a', selected: 'custom', custom });
    assert.match(store.prompt('session-a'), /身份 \{\{literal\}\}/);
    assert.equal(store.prompt('session-b'), '');
    assert.deepEqual(createPersonaStore({ databasePath, workspaceForSession }).personaState('session-a').custom, custom);
    store.personaSave({ sessionId: 'session-b', selected: 'preset-1', custom });
    assert.match(store.prompt('session-b'), /动画评论家/);
    assert.match(store.prompt('session-a'), /身份/);
    assert.throws(() => store.personaSave({ sessionId: 'session-a', selected: 'custom', custom: { ...custom, persona: '' } }), /核心身份/);
    store.personaSave({ sessionId: 'session-a', selected: 'none', custom });
    assert.equal(store.prompt('session-a'), '');
    assert.match(store.prompt('session-b'), /动画评论家/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('previous global settings stay untouched and never apply to a session', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-persona-old-'));
  try {
    const databasePath = join(directory, 'persona.sqlite3');
    const old = new DatabaseSync(databasePath);
    old.exec("CREATE TABLE persona_settings(id INTEGER PRIMARY KEY, selected TEXT, name TEXT, persona TEXT, tone TEXT, rules TEXT); INSERT INTO persona_settings VALUES(1,'custom','old','legacy','','')");
    old.close();
    const store = createPersonaStore({ databasePath, workspaceForSession: () => 'workspace-a' });
    assert.equal(store.prompt('session-a'), '');
    store.personaSave({ sessionId: 'session-a', selected: 'preset-1', custom: { name: '', persona: '', tone: '', rules: '' } });
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try { assert.equal(db.prepare('SELECT persona FROM persona_settings WHERE id=1').get().persona, 'legacy'); }
    finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('persona does not follow a session into a different or absent workspace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-persona-workspace-'));
  try {
    let workspace = 'workspace-a';
    const store = createPersonaStore({ databasePath: join(directory, 'persona.sqlite3'), workspaceForSession: () => workspace });
    store.personaSave({ sessionId: 'session-a', selected: 'preset-1', custom: { name: '', persona: '', tone: '', rules: '' } });
    assert.match(store.prompt('session-a'), /动画评论家/);
    workspace = 'workspace-b';
    assert.equal(store.prompt('session-a'), '');
    workspace = undefined;
    assert.equal(store.prompt('session-a'), '');
    assert.throws(() => store.personaState('session-a'), /不属于工作区/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
