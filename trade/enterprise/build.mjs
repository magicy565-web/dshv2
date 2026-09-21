/** Build the deployment plugin for the dsh Host and browser module loader. */
import { build } from 'tsdown'
import { fileURLToPath } from 'node:url'
import { copyFile } from 'node:fs/promises'
process.chdir(fileURLToPath(new URL('.', import.meta.url)))
await build({ config: false, failOnWarn: true, entry: { index: 'src/host.ts' }, format: 'esm', platform: 'node', outDir: 'lib', dts: false, clean: true, outputOptions: { entryFileNames: 'index.js' }, deps: { alwaysBundle: ['zod', 'file-type', 'range-parser'], neverBundle: ['officeparser', 'esbuild'] } })
await build({
  config: false, failOnWarn: true, entry: { client: 'src/client.tsx' }, format: 'cjs', platform: 'browser', outDir: 'lib', dts: false, clean: false,
  deps: { alwaysBundle: ['zod'], neverBundle: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'] },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-trade-enterprise", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
await copyFile('connector/computer_connector.py', 'lib/computer_connector.py')
await copyFile('computers.md', 'lib/computers.md')
await copyFile('computers.zh.md', 'lib/computers.zh.md')
