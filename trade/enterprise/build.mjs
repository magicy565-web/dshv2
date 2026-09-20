/** Build the deployment plugin for the dsh Host and browser module loader. */
import { build } from 'tsdown'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('.', import.meta.url)))
await build({ config: false, entry: { index: 'src/host.ts' }, format: 'esm', platform: 'node', outDir: 'lib', dts: false, clean: true, outputOptions: { entryFileNames: 'index.js' }, deps: { alwaysBundle: ['zod', 'file-type', 'range-parser'], neverBundle: ['officeparser', 'esbuild'] } })
await build({
  config: false, entry: { client: 'src/client.tsx' }, format: 'cjs', platform: 'browser', outDir: 'lib', dts: false, clean: false,
  deps: { alwaysBundle: ['zod'], neverBundle: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'] },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-trade-enterprise", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
