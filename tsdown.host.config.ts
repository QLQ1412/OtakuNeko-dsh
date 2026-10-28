import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.js'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  deps: { neverBundle: ['@deepseek-ai/dsh-tools'], alwaysBundle: ['undici'] },
  clean: false,
  sourcemap: true,
});
