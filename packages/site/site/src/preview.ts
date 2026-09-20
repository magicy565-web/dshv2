/** Compile private static previews from virtual files; project code cannot load host files or execute on the server. */
import { posix } from 'node:path'
import { build, type Loader } from 'esbuild'
import { parse, serialize, defaultTreeAdapter, type DefaultTreeAdapterMap } from 'parse5'
import { findSiteArtifactFile, sitePreviewResponse, type SiteArtifact } from './project.ts'

type Element = DefaultTreeAdapterMap['element']
type Node = DefaultTreeAdapterMap['node']

function elements(node: Node): Element[] {
  const children = 'childNodes' in node ? node.childNodes.flatMap(elements) : []
  return 'tagName' in node ? [node, ...children] : children
}

/** Bundle a page's scripts, styles, and local media into an isolated preview document.
 * @param artifact - Exact static build selected by an authorized caller.
 * @param path - Site-relative page or asset path.
 * @param navigationUrl - Host-owned URL builder for links to another page of the same revision.
 * @param maxBytes - Maximum response bytes after embedding dependent assets.
 * @returns A private sandboxed response, with a 404 for missing pages.
 * @throws For missing imports, host-module imports, or oversized expanded output.
 */
export async function renderStaticPreview(
  artifact: SiteArtifact, path: string, navigationUrl: (path: string) => string, maxBytes: number,
): Promise<Response> {
  const response = sitePreviewResponse(artifact, path)
  const pageFile = findSiteArtifactFile(artifact, path)
  if (!pageFile?.contentType.startsWith('text/html')) return response
  const files = new Map(artifact.files.map(file => [file.path, file]))
  const inlineSources = new Map<string, string>()
  const page = pageFile.path
  const read = (filePath: string) => {
    const file = files.get(filePath)
    if (!file) throw new Error(`Preview project file is missing: ${filePath}`)
    return file
  }
  const resolve = (reference: string, importer: string): string => {
    const url = new URL(reference, `https://site.invalid/${importer}`)
    if (url.origin !== 'https://site.invalid') throw new Error(`Preview import must be a saved project file: ${reference}`)
    const result = decodeURIComponent(url.pathname.slice(1))
    if (!files.has(result) && !inlineSources.has(result)) throw new Error(`Preview project file is missing: ${result}`)
    return result
  }
  const dataUrl = (reference: string, importer: string): string => {
    if (/^(https?:|data:|#)/i.test(reference)) return reference
    const file = read(resolve(reference, importer))
    return `data:${file.contentType.split(';')[0]};base64,${file.base64}`
  }
  const document = parse(await response.text())
  const nodes = elements(document)
  // parse5's document parser inserts the HTML head even when the source omits it.
  const head = nodes.find(node => node.tagName === 'head') as Element
  const text = (node: Element, content: string): void => {
    node.childNodes = []
    defaultTreeAdapter.insertText(node, content)
  }
  const style = (css: string): void => {
    const element = defaultTreeAdapter.createElement('style', head.namespaceURI, [])
    text(element, css.replace(/<\/style/gi, '<\\/style'))
    defaultTreeAdapter.appendChild(head, element)
  }
  const compile = async (entry: string): Promise<{ script: string; css: string }> => {
    const result = await build({
      entryPoints: [entry], bundle: true, write: false, outdir: 'preview-output', format: 'esm', platform: 'browser',
      logLevel: 'silent', sourcemap: false, plugins: [{
        name: 'saved-site-files',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'url-token' && /^(https?:|data:|#)/i.test(args.path)) return { path: args.path, external: true }
            const resolved = args.kind === 'entry-point' ? args.path : resolve(args.path, args.importer)
            if (!files.has(resolved) && !inlineSources.has(resolved)) return { errors: [{ text: `Preview project file is missing: ${resolved}` }] }
            return { path: resolved, namespace: 'saved-site' }
          })
          builder.onLoad({ filter: /.*/, namespace: 'saved-site' }, (args) => {
            const ext = posix.extname(args.path).slice(1)
            const loaders: Record<string, Loader> = { js: 'js', mjs: 'js', ts: 'ts', jsx: 'jsx', tsx: 'tsx', css: 'css', json: 'json' }
            return { contents: inlineSources.get(args.path) ?? Buffer.from(read(args.path).base64, 'base64'), loader: loaders[ext] ?? 'dataurl' }
          })
        },
      }],
    })
    return { script: result.outputFiles.filter(file => file.path.endsWith('.js')).map(file => file.text).join('\n'), css: result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n') }
  }
  const inlineEntry = (node: Element, extension: 'js' | 'css'): string => {
    let ordinal = inlineSources.size
    let path: string
    do { path = posix.join(posix.dirname(page), `__dsh_inline_${ordinal++}.${extension}`) } while (files.has(path) || inlineSources.has(path))
    inlineSources.set(path, node.childNodes.map(child => 'value' in child ? child.value : '').join(''))
    return path
  }
  for (const node of nodes) {
    const attr = (name: string) => node.attrs.find(item => item.name === name)
    if (node.tagName === 'base') { defaultTreeAdapter.detachNode(node); continue }
    if (node.tagName === 'script') {
      const src = attr('src')
      if (src || attr('type')?.value === 'module') {
        const output = await compile(src ? resolve(src.value, page) : inlineEntry(node, 'js'))
        node.attrs = node.attrs.filter(item => !['src', 'integrity', 'crossorigin'].includes(item.name))
        text(node, output.script.replace(/<\/script/gi, '<\\/script'))
        if (output.css) style(output.css)
      }
    } else if (node.tagName === 'style') {
      const output = await compile(inlineEntry(node, 'css'))
      text(node, output.css.replace(/<\/style/gi, '<\\/style'))
    } else if (node.tagName === 'link' && attr('rel')?.value === 'stylesheet') {
      const href = attr('href')
      if (!href) continue
      const output = await compile(resolve(href.value, page))
      node.tagName = node.nodeName = 'style'
      node.attrs = []
      text(node, output.css.replace(/<\/style/gi, '<\\/style'))
    } else {
      for (const attribute of node.attrs) {
        if (attribute.name === 'src' || attribute.name === 'poster' || (node.tagName === 'link' && attribute.name === 'href' && attr('rel')?.value === 'icon')) attribute.value = dataUrl(attribute.value, page)
        if (node.tagName === 'a' && attribute.name === 'href' && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(attribute.value)) {
          const target = new URL(attribute.value, `https://site.invalid/${page}`)
          attribute.value = navigationUrl(target.pathname) + target.hash
        }
      }
    }
  }
  const html = serialize(document)
  if (Buffer.byteLength(html, 'utf8') > maxBytes) throw new Error('Expanded preview exceeds the configured byte limit')
  return new Response(html, { headers: response.headers })
}
