import test from 'node:test';
import assert from 'node:assert/strict';
import { createBangumiAccount } from '../src/account.js';
import { createFetchRoute } from '../src/bangumi.js';

test('remote collections use workspace credentials and return only bounded safe fields', async () => {
  const records = new Map([['a', { kind: 'grant', payload: { token: 'secret-token', user: { username: 'alice' } } }]]);
  const credentials = { async readRecord(key) { return records.get(key); } };
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return Response.json({ total: 22, data: [{ subject_id: 42, type: 3, rate: 8, ep_status: 5, private: true, comment: 'private comment', subject: { name: 'Anime', name_cn: '动画' } }] });
  };
  const a = createBangumiAccount({ credentials, fetchImpl, key: 'a' });
  const b = createBangumiAccount({ credentials, fetchImpl, key: 'b' });
  await assert.rejects(b.remoteCollections(), /请先/);
  const result = await a.remoteCollections({ offset: 20, limit: 20 });
  assert.equal(request.url, 'https://api.bgm.tv/v0/users/alice/collections?subject_type=2&limit=20&offset=20');
  assert.equal(request.options.headers.Authorization, 'Bearer secret-token');
  assert.equal(request.options.redirect, 'error');
  assert.deepEqual(result, { total: 22, offset: 20, limit: 20, items: [{ id: 42, name: 'Anime', nameCn: '动画', status: 3, rating: 8, progress: 5, private: true }] });
  assert.ok(!JSON.stringify(result).includes('secret-token') && !JSON.stringify(result).includes('private comment'));
  await assert.rejects(a.remoteCollections({ limit: 51 }), /分页/);
  const invalid = createBangumiAccount({ credentials, key: 'a', fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(invalid.remoteCollections(), /令牌无效/);
});

test('account validates token before saving, redacts responses and deletes local credentials', async () => {
  let record;
  let status = 200;
  let options;
  const credentials = {
    async readRecord() { return record; },
    async modifyRecord(_key, update) { record = await update(record); },
    async deleteRecord() { record = undefined; },
  };
  const service = createBangumiAccount({ credentials, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.bgm.tv/v0/me'); options = init;
    return status === 200 ? Response.json({ id: 42, username: 'test', nickname: 'Test', email: 'private@example.test' }) : new Response('', { status });
  } });
  assert.deepEqual(await service.accountStatus(), { connected: false });
  const result = await service.accountConnect('private-token');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, 'Bearer private-token');
  assert.equal(record.payload.token, 'private-token');
  assert.equal(JSON.stringify(result).includes('private-token'), false);
  assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  assert.deepEqual(await service.accountStatus(), result);
  status = 401;
  await assert.rejects(service.accountConnect('bad-token'), /无效或已过期/);
  assert.equal(record.payload.token, 'private-token');
  const route = createFetchRoute(service, 'account-status');
  const response = await route.fetch(new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: '1', method: 'otakuneko-native/account-status', payload: {} }) }));
  assert.equal((await response.text()).includes('private-token'), false);
  await service.accountDisconnect();
  assert.deepEqual(await service.accountStatus(), { connected: false });
});

test('workspaces use separate credential records and local sign-out', async () => {
  const records = new Map();
  const credentials = {
    async readRecord(key) { return records.get(key); },
    async modifyRecord(key, update) { records.set(key, await update(records.get(key))); },
    async deleteRecord(key) { records.delete(key); },
  };
  const fetchImpl = async () => Response.json({ id: 1, username: 'user', nickname: 'User' });
  const a = createBangumiAccount({ credentials, fetchImpl, key: 'plugin/workspace-a' });
  const b = createBangumiAccount({ credentials, fetchImpl, key: 'plugin/workspace-b' });
  await a.accountConnect('token-a');
  assert.equal((await a.accountStatus()).connected, true);
  assert.equal((await b.accountStatus()).connected, false);
  await b.accountConnect('token-b');
  await a.accountDisconnect();
  assert.equal((await a.accountStatus()).connected, false);
  assert.equal((await b.accountStatus()).connected, true);
});
