import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceNetwork } from '../src/network.js';
import { createBangumiService } from '../src/bangumi.js';

const directory = mkdtempSync(join(tmpdir(), 'otakuneko-live-proxy-'));
process.env.DSH_HOME = directory;
const network = createWorkspaceNetwork('test-only');
try {
  network.networkSave({ proxy: process.argv[2] });
  const result = await createBangumiService({ fetchImpl: network.fetch }).details(1);
  if (result.id !== 1) throw new Error('Unexpected subject ID');
  console.log('Bangumi proxy request succeeded.');
} finally { network.dispose(); rmSync(directory, { recursive: true, force: true }); }
