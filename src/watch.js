import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const SOURCE = 'https://cdn.jsdelivr.net/npm/bangumi-data@0.3/dist/data.json';
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_AGE = 24 * 60 * 60 * 1000;
const HOSTS = {
  acfun: ['www.acfun.cn'], bilibili: ['www.bilibili.com'], bilibili_hk_mo_tw: ['www.bilibili.com'], bilibili_hk_mo: ['www.bilibili.com'], bilibili_tw: ['www.bilibili.com'],
  youku: ['list.youku.com'], qq: ['v.qq.com'], iqiyi: ['www.iqiyi.com'], letv: ['www.le.com'], mgtv: ['www.mgtv.com'], nicovideo: ['ch.nicovideo.jp'],
  netflix: ['www.netflix.com'], gamer: ['acg.gamer.com.tw'], gamer_hk: ['acg.gamer.com.tw'], muse_hk: ['www.youtube.com'], muse_tw: ['www.youtube.com'],
  ani_one: ['www.youtube.com'], ani_one_asia: ['www.youtube.com'], viu: ['www.viu.com'], mytv: ['www.mytvsuper.com'], disneyplus: ['www.disneyplus.com'],
  abema: ['abema.tv'], unext: ['video.unext.jp'], crunchyroll: ['www.crunchyroll.com'], danime: ['animestore.docomo.ne.jp'], tropics: ['www.youtube.com'],
  prime: ['www.amazon.co.jp'], youtube: ['www.youtube.com'], mighty: ['www.youtube.com'],
};

function validData(data) {
  return data && typeof data === 'object' && !Array.isArray(data) && data.siteMeta && typeof data.siteMeta === 'object' && Array.isArray(data.items);
}

async function readLimited(response, signal) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('平台数据过大');
  if (!response.body) throw new Error('平台数据为空');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('请求已取消');
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('平台数据过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
}

function platformUrl(site, meta) {
  if (!site || typeof site !== 'object') return null;
  const allowed = HOSTS[site.site];
  if (!allowed || !meta || meta.type !== 'onair') return null;
  let raw;
  if (typeof site.url === 'string' && site.url) raw = site.url;
  else {
    if (typeof site.id !== 'string' || !/^[A-Za-z0-9_/-]{1,200}$/.test(site.id) || typeof meta.urlTemplate !== 'string' || !meta.urlTemplate.includes('{{id}}')) return null;
    raw = meta.urlTemplate.replaceAll('{{id}}', site.id.split('/').map(encodeURIComponent).join('/'));
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}

export function createWatchService({ fetchImpl = globalThis.fetch, details, cachePath, now = () => Date.now() }) {
  let memory;
  function loadCache() {
    if (memory) return memory;
    try {
      if (!cachePath || !existsSync(cachePath) || statSync(cachePath).size > MAX_BYTES + 1024) return null;
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (!Number.isFinite(parsed?.fetchedAt) || !validData(parsed.data)) return null;
      memory = parsed;
      return memory;
    } catch { return null; }
  }
  function storeCache(entry) {
    memory = entry;
    if (!cachePath) return;
    let temp;
    try {
      mkdirSync(dirname(cachePath), { recursive: true });
      temp = `${cachePath}.${randomUUID()}.tmp`;
      writeFileSync(temp, JSON.stringify(entry), { flag: 'wx' });
      renameSync(temp, cachePath);
    } catch { /* Cache writes are optional; keep the in-memory copy. */ }
    finally { if (temp) try { rmSync(temp, { force: true }); } catch {} }
  }
  async function dataset(signal) {
    if (signal?.aborted) throw new Error('请求已取消');
    const cached = loadCache();
    if (cached && now() >= cached.fetchedAt && now() - cached.fetchedAt < MAX_AGE) return { state: 'cached', data: cached.data, fetchedAt: cached.fetchedAt };
    const timeout = AbortSignal.timeout(30000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetchImpl(SOURCE, { headers: { Accept: 'application/json', 'User-Agent': 'OtakuNeko/1.0 (showayhacci@qq.com)' }, signal: combined, redirect: 'error' });
      if (!response.ok) throw new Error('平台数据请求失败');
      const data = JSON.parse(await readLimited(response, combined));
      if (!validData(data)) throw new Error('平台数据格式无效');
      const entry = { fetchedAt: now(), data };
      storeCache(entry);
      return { state: 'fresh', data, fetchedAt: entry.fetchedAt };
    } catch {
      if (signal?.aborted) throw new Error('请求已取消');
      if (cached) return { state: 'stale', data: cached.data, fetchedAt: cached.fetchedAt };
      return { state: 'unavailable', data: null, fetchedAt: null };
    }
  }
  async function watchLinks(subjectId, signal) {
    if (!Number.isSafeInteger(subjectId) || subjectId < 1) throw new Error('Bangumi 条目 ID 必须是正整数');
    const subject = await details(subjectId, signal);
    const title = subject.nameCn || subject.name;
    const source = await dataset(signal);
    const platforms = [];
    const seen = new Set();
    if (source.data) for (const item of source.data.items) {
      if (!Array.isArray(item?.sites) || !item.sites.some(site => site?.site === 'bangumi' && String(site.id) === String(subjectId))) continue;
      for (const site of item.sites) {
        const meta = source.data.siteMeta[site?.site];
        const url = platformUrl(site, meta);
        if (!url || seen.has(url)) continue;
        const rawRegions = Array.isArray(site.regions) ? site.regions : meta.regions;
        const regions = Array.isArray(rawRegions) ? rawRegions.filter(region => typeof region === 'string' && region.length <= 30).slice(0, 20) : [];
        seen.add(url);
        platforms.push({ site: site.site, name: typeof meta.title === 'string' ? meta.title.slice(0, 100) : site.site, url, regions });
        if (platforms.length >= 30) break;
      }
      if (platforms.length >= 30) break;
    }
    return {
      subjectId, title, platforms,
      search: title ? [{ site: 'bilibili', name: 'B 站搜索', url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}` }] : [],
      dataset: { state: source.state, fetchedAt: source.fetchedAt, attribution: 'bangumi-data', url: 'https://github.com/bangumi-data/bangumi-data', license: 'CC-BY-4.0' },
      notice: '作品页基于社区数据，不保证当前地区可播放或无需会员；搜索结果未确认匹配。',
    };
  }
  return { watchLinks };
}
