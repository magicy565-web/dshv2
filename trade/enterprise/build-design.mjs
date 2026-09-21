/** Build a self-contained preview artifact without launching a Node application. */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('.', import.meta.url))
const output = fileURLToPath(new URL('../../.trade-runtime/design-system/', import.meta.url))
const dependencies = createRequire(import.meta.url)
const result = await build({
  absWorkingDir: directory, entryPoints: ['src/design/showcase.tsx'], bundle: true, write: false,
  outfile: 'showcase.js', format: 'iife', platform: 'browser', target: ['es2022'], jsx: 'automatic',
  alias: { react: dirname(dependencies.resolve('react/package.json')), 'react-dom': dirname(dependencies.resolve('react-dom/package.json')) },
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true,
})
const script = result.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script')
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text
await mkdir(output, { recursive: true })
await writeFile(join(output, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>序 · FORM — 企业工作台组件</title><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>\n`)
console.log(join(output, 'index.html'))
