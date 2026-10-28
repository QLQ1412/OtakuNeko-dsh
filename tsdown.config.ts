import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/client.js'],
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  deps: { neverBundle: ['react'] },
  outExtensions: ({ format }) => (format === 'cjs' ? { js: '.js' } : undefined),
  banner: { js: `window.__ModuleLoader__.load({ id: 'otakuneko-harness-native-plugin', factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: `return module.exports; } });` },
  clean: false,
  sourcemap: true,
});
