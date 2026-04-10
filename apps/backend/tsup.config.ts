import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/functions/**/*.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  platform: 'node',
  target: 'node20',
  // Bundle everything into the Lambda zip. Node runtime in Lambda only ships
  // @aws-sdk/* preinstalled, so we leave those external to keep the bundle small.
  noExternal: [/^(?!@aws-sdk\/).*/],
  // Some CommonJS deps (notably `mongodb`) use `require()` for Node built-ins
  // at runtime. When we output ESM, esbuild can't resolve those dynamic requires
  // unless we provide a `require` shim via createRequire.
  banner: {
    js: "import { createRequire as _kaiposCreateRequire } from 'module'; const require = _kaiposCreateRequire(import.meta.url);",
  },
});
