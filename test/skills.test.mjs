import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { createScope } from '@deepseek-ai/dsh-scope';
import { registerSessionSkills } from '../src/skills.js';
import { apply } from '../lib/index.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('real Harness skill registry isolates bundled skills and removes them when disposed', async () => {
  const root = new Context();
  await root.plugin(SkillRegistry);
  const a = { id: 'a' }, b = { id: 'b' };
  const scopeA = createScope(root, a);
  const scopeB = createScope(root, b);
  try {
    const fiber = registerSessionSkills({ ctx: scopeA.ctx }, () => true);
    await fiber;
    const registry = root.get('skills');
    const skillsA = await registry.list({ scope: a });
    assert.deepEqual(skillsA.map(skill => skill.name), ['otakuneko-discover', 'otakuneko-watch']);
    assert.deepEqual(await registry.list({ scope: b }), []);
    assert.deepEqual(await registry.list(), []);
    const content = await registry.get('otakuneko-watch', { scope: a });
    assert.match(content.content, /otakuneko_native_list_collection/);
    assert.equal(content.source, 'runtime');
    await fiber.dispose();
    assert.deepEqual(await registry.list({ scope: a }), []);
  } finally { await scopeA.dispose(); await scopeB.dispose(); await root.fiber.dispose(); }
});

test('skill registration waits for an optional service and does not outlive its scope', async () => {
  const root = new Context();
  const agent = { id: 'late' };
  const scope = createScope(root, agent);
  try {
    const fiber = registerSessionSkills({ ctx: scope.ctx }, () => true);
    assert.equal(root.get('skills'), undefined);
    await root.plugin(SkillRegistry);
    await fiber;
    assert.equal((await root.get('skills').list({ scope: agent })).length, 2);
    await fiber.dispose();
    assert.deepEqual(await root.get('skills').list({ scope: agent }), []);
  } finally { await scope.dispose(); await root.fiber.dispose(); }
});

test('plugin activates scoped skills only for enabled workspace and removes them after session moves', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'otakuneko-skills-'));
  const oldHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  const root = new Context();
  await root.plugin(SkillRegistry);
  const agent = { id: 'session-a' };
  const other = { id: 'session-b' };
  const a = createScope(root, agent), b = createScope(root, other);
  agent.ctx = { inject: a.ctx.inject.bind(a.ctx), tools: { register: () => () => {} } };
  other.ctx = { inject: b.ctx.inject.bind(b.ctx), tools: { register: () => () => {} } };
  const events = new Map(), routes = [], cleanups = [];
  let workspaces = [{ id: 'workspace-a', sessionIds: ['session-a'] }, { id: 'workspace-b', sessionIds: ['session-b'] }];
  const registry = root.get('skills');
  const names = async scope => (await registry.list({ scope })).map(skill => skill.name);
  try {
    apply({ agents: { list: () => [agent, other] }, on: (name, callback) => events.set(name, callback), logger: { warn() {} }, effect: callback => { const dispose = callback(); if (typeof dispose === 'function') cleanups.push(dispose); }, systemPrompt: { section: () => () => {} }, workspaceRegistry: { list: () => workspaces }, connection: { fetch: { register: route => routes.push(route) } } });
    const route = routes.find(entry => entry.path.endsWith('/workspace-activate'));
    const response = await route.fetch(new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: 'otakuneko-native/workspace-activate', payload: { sessionId: 'session-a' } }) }));
    assert.equal((await response.json()).result.ok, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await names(agent), ['otakuneko-discover', 'otakuneko-watch']);
    assert.deepEqual(await names(other), []);
    workspaces = [{ id: 'workspace-a', sessionIds: [] }, { id: 'workspace-b', sessionIds: ['session-a', 'session-b'] }];
    await events.get('agent/pre-step')({ agent }, async () => ({ kind: 'continue' }));
    assert.deepEqual(await names(agent), []);
    const activateB = await route.fetch(new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '2', method: 'otakuneko-native/workspace-activate', payload: { sessionId: 'session-b' } }) }));
    assert.equal((await activateB.json()).result.ok, true);
    await events.get('agent/pre-step')({ agent }, async () => ({ kind: 'continue' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(await names(agent), ['otakuneko-discover', 'otakuneko-watch']);
  } finally {
    for (const dispose of cleanups.reverse()) dispose();
    await a.dispose(); await b.dispose(); await root.fiber.dispose();
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome;
    rmSync(dir, { recursive: true, force: true });
  }
});
