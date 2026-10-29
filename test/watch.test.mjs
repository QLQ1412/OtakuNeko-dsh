import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWatchService } from '../src/watch.js';

test('watch links use exact Bangumi ID, validate platforms, cache data and fall back offline', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'otakuneko-watch-'));
  try {
    const cachePath = join(directory, 'cache.json');
    let time = 100000, calls = 0, offline = false;
    const data = { siteMeta: {
      bilibili: { title: 'B站', type: 'onair', urlTemplate: 'https://www.bilibili.com/bangumi/media/md{{id}}/', regions: ['CN'] },
      gamer: { title: '动画疯', type: 'onair', urlTemplate: 'https://acg.gamer.com.tw/acgDetail.php?s={{id}}', regions: ['TW'] },
      dmhy: { title: '资源', type: 'resource', urlTemplate: 'https://example.org/{{id}}' },
      netflix: { title: 'Netflix', type: 'onair', urlTemplate: 'https://www.netflix.com/title/{{id}}' },
    }, items: [
      { sites: [{ site: 'bangumi', id: '42' }, null, { site: 'bilibili', id: '123' }, { site: 'gamer', id: '99', regions: ['HK'] }, { site: 'dmhy', id: 'xx' }, { site: 'netflix', url: 'https://evil.example/watch', id: '123' }] },
      { sites: [{ site: 'bangumi', id: '43' }, { site: 'bilibili', id: '888' }] },
    ] };
    const fetchImpl = async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); if (offline) throw new Error('offline'); return Response.json(data); };
    const details = async id => ({ id, name: 'Title', nameCn: '测试 动画' });
    const service = createWatchService({ fetchImpl, details, cachePath, now: () => time });
    const first = await service.watchLinks(42);
    assert.equal(first.dataset.state, 'fresh');
    assert.deepEqual(first.platforms.map(item => item.url), ['https://www.bilibili.com/bangumi/media/md123/', 'https://acg.gamer.com.tw/acgDetail.php?s=99']);
    assert.deepEqual(first.platforms[1].regions, ['HK']);
    assert.match(first.search[0].url, /%E6%B5%8B%E8%AF%95/);
    assert.equal(first.dataset.license, 'CC-BY-4.0');
    assert.equal((await service.watchLinks(42)).dataset.state, 'cached');
    assert.equal(calls, 1);
    offline = true; time += 25 * 60 * 60 * 1000;
    const restarted = createWatchService({ fetchImpl, details, cachePath, now: () => time });
    assert.equal((await restarted.watchLinks(42)).dataset.state, 'stale');
    assert.equal((await restarted.watchLinks(44)).platforms.length, 0);
    const noCache = createWatchService({ fetchImpl, details, now: () => time });
    assert.equal((await noCache.watchLinks(42)).dataset.state, 'unavailable');
    await assert.rejects(service.watchLinks(0), /正整数/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(restarted.watchLinks(42, controller.signal), /取消/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
