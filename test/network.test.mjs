import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceNetwork } from '../src/network.js';

test('proxy settings are per workspace and only attach dispatcher to selected requests', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-network-test-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  const requests = [];
  const fakeAgent = { close: async () => {} };
  try {
    const options = { fetchImpl: async (url, init) => { requests.push({ url, init }); return Response.json({}); }, agentFactory: () => fakeAgent };
    const first = createWorkspaceNetwork('a', options);
    const second = createWorkspaceNetwork('b', options);
    assert.deepEqual(first.networkState(), { proxy: '' });
    first.networkSave({ proxy: 'http://127.0.0.1:7890' });
    assert.equal(first.networkState().proxy, 'http://127.0.0.1:7890');
    assert.equal(second.networkState().proxy, '');
    await first.fetch('https://api.bgm.tv/test');
    await second.fetch('https://api.bgm.tv/test');
    assert.equal(requests[0].init.dispatcher, fakeAgent);
    assert.equal(requests[1].init.dispatcher, undefined);
    assert.throws(() => first.networkSave({ proxy: 'http://user:password@127.0.0.1:7890' }), /账号密码/);
    assert.throws(() => first.networkSave({ proxy: 'http://external.example:7890' }), /本机/);
    assert.equal(first.networkState().proxy, 'http://127.0.0.1:7890');
    first.dispose();
  } finally { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; rmSync(directory, { recursive: true, force: true }); }
});
