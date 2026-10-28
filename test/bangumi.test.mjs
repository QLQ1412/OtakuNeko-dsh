import test from 'node:test';
import assert from 'node:assert/strict';
import { createBangumiService, createFetchRoute } from '../src/bangumi.js';

test('episode lookup uses main-episode filter and bounded pagination', async () => {
  let url;
  const service = createBangumiService({ fetchImpl: async value => { url = value; return Response.json({ total: 1, data: [{ id: 9, ep: 1, name: 'First', name_cn: '第一集', airdate: '2024-01-01' }] }); } });
  const result = await service.episodes(42, 20, 10);
  assert.equal(url, 'https://api.bgm.tv/v0/episodes?subject_id=42&type=0&limit=10&offset=20');
  assert.equal(result.items[0].number, 1);
  await assert.rejects(service.episodes(42, 0, 51), /分页/);
});

test('advanced search combines filters without silently dropping date constraints', async () => {
  let request;
  const service = createBangumiService({ fetchImpl: async (url, options) => { request = { url, options }; return Response.json({ total: 0, data: [] }); } });
  const result = await service.advancedSearch({ tags: '治愈,日常', minRating: 7, startDate: '2024-04-01', endDate: '2024-06-30' });
  assert.deepEqual(JSON.parse(request.options.body), { keyword: '', sort: 'rank', filter: { type: [2], tag: ['治愈', '日常'], rating: ['>=7'], air_date: ['>=2024-04-01', '<=2024-06-30'] } });
  assert.deepEqual(result.items, []);
  await assert.rejects(service.advancedSearch({ startDate: '2024-02-30' }), /日期/);
  await assert.rejects(service.advancedSearch({ minRating: 9, maxRating: 8 }), /最低评分/);
  await assert.rejects(service.advancedSearch({}), /筛选条件/);
});

test('staff and cast return bounded Bangumi relationships', async () => {
  const calls = [];
  const service = createBangumiService({ fetchImpl: async url => {
    calls.push(url);
    return Response.json(url.endsWith('/persons') ? [{ id: 2, name: 'Director', relation: '导演', type: 1 }] : [{ id: 3, name: 'Character', relation: '主角', actors: [{ id: 4, name: 'Actor' }] }]);
  } });
  assert.deepEqual((await service.staff(1)).items[0], { id: 2, name: 'Director', relation: '导演', type: 1 });
  assert.deepEqual((await service.cast(1)).items[0].actors, [{ id: 4, name: 'Actor' }]);
  assert.deepEqual(calls, ['https://api.bgm.tv/v0/subjects/1/persons', 'https://api.bgm.tv/v0/subjects/1/characters']);
  await assert.rejects(service.cast(0), /正整数/);
});

test('calendar uses the public legacy endpoint and normalizes weekday and subjects', async () => {
  let url;
  const service = createBangumiService({ fetchImpl: async value => {
    url = value;
    return Response.json([{ weekday: { id: 2 }, items: [{ id: 42, name: 'Example', air_date: '2024-01-02', eps: 12 }] }, { weekday: { id: 1 }, items: [] }]);
  } });
  const result = await service.calendar();
  assert.equal(url, 'https://api.bgm.tv/calendar');
  assert.deepEqual(result.map(day => day.weekday), [1, 2]);
  assert.equal(result[1].items[0].date, '2024-01-02');
  assert.equal(result[1].items[0].episodes, 12);
});

test('search calls Bangumi directly, filters anime and normalizes results', async () => {
  let request;
  const service = createBangumiService({ fetchImpl: async (url, options) => {
    request = { url, options };
    return Response.json({ total: 1, data: [{ id: 42, name: 'Example', name_cn: '示例', date: '2024-01-01', rating: { score: 8 } }] });
  } });
  const result = await service.search(' 示例 ', 50);
  assert.match(request.url, /^https:\/\/api\.bgm\.tv\/v0\/search\/subjects\?limit=20&offset=0$/);
  assert.deepEqual(JSON.parse(request.options.body).filter, { type: [2] });
  assert.equal(result.items[0].nameCn, '示例');
  assert.equal(result.items[0].url, 'https://bgm.tv/subject/42');
});

test('details validates IDs and handles upstream errors', async () => {
  const service = createBangumiService({ fetchImpl: async () => new Response('', { status: 404 }) });
  await assert.rejects(service.details(-1), /正整数/);
  await assert.rejects(service.details(42), /HTTP 404/);
});

test('details uses Bangumi ID and returns bounded normalized content', async () => {
  let url;
  const service = createBangumiService({ fetchImpl: async value => {
    url = value;
    return Response.json({ id: 42, name: 'Example', summary: 'a'.repeat(1500), rating: { score: 7.5 } });
  } });
  const result = await service.details(42);
  assert.equal(url, 'https://api.bgm.tv/v0/subjects/42');
  assert.equal(result.summary.length, 1200);
  assert.equal(result.score, 7.5);
});

test('cancelled caller receives a cancellation error', async () => {
  const controller = new AbortController();
  controller.abort();
  const service = createBangumiService({ fetchImpl: async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    throw new Error('aborted');
  } });
  await assert.rejects(service.search('动画', 3, controller.signal), /取消/);
});

test('cancellation while reading the response body is reported as cancellation', async () => {
  const controller = new AbortController();
  const service = createBangumiService({ fetchImpl: async () => ({
    ok: true,
    async json() { controller.abort(); throw new Error('aborted'); },
  }) });
  await assert.rejects(service.search('动画', 3, controller.signal), /取消/);
});

test('Connection route validates the envelope and returns the RPC result', async () => {
  const route = createFetchRoute({ details: async (id) => ({ id }) }, 'details');
  const request = body => new Request(`http://localhost${route.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await route.fetch(request({ type: 'client-request', rpcId: 'test', method: 'otakuneko-native/details', payload: { id: 12 } }));
  assert.deepEqual(await response.json(), { type: 'server-response', rpcId: 'test', result: { ok: true, value: { id: 12 } } });
  assert.equal((await route.fetch(request({ type: 'client-request', rpcId: 'test', method: 'other' }))).status, 400);
});
