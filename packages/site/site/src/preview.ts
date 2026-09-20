/** Compile private static previews from virtual files; project code cannot load host files or execute on the server. */
import { posix } from 'node:path'
import { build, type Loader } from 'esbuild'
import { parse, serialize, defaultTreeAdapter, type DefaultTreeAdapterMap } from 'parse5'
import { parseSrcset, stringifySrcset } from 'srcset'
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
 * @param parentNavigation - Delegate saved-page links to the embedding editor; its listener must verify the sending frame.
 * @returns A private sandboxed response, with a 404 for missing pages.
 * @throws For missing imports, host-module imports, or oversized expanded output.
 */
export async function renderStaticPreview(
  artifact: SiteArtifact, path: string, navigationUrl: (path: string) => string, maxBytes: number, parentNavigation = false,
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
    return `data:${file.contentType.split(';')[0]};base64,${file.base64}${new URL(reference, 'https://site.invalid').hash}`
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
            try {
              if (args.kind === 'url-token') return { path: dataUrl(args.path, args.importer), external: true }
              // esbuild may prepend ./ when an entry also exists in the Host working directory.
              const resolved = args.kind === 'entry-point' ? entry : resolve(args.path, args.importer)
              if (!files.has(resolved) && !inlineSources.has(resolved)) return { errors: [{ text: `Preview project file is missing: ${resolved}` }] }
              return { path: resolved, namespace: 'saved-site' }
            } catch (error) {
              // Throwing from an esbuild plugin exposes the Host stack in model-visible diagnostics.
              return { errors: [{ text: error instanceof Error ? error.message : String(error) }] }
            }
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
  const inlineEntry = (content: string, extension: 'js' | 'css'): string => {
    let ordinal = inlineSources.size
    let path: string
    do { path = posix.join(posix.dirname(page), `__dsh_inline_${ordinal++}.${extension}`) } while (files.has(path) || inlineSources.has(path))
    inlineSources.set(path, content)
    return path
  }
  for (const node of nodes) {
    const attr = (name: string) => node.attrs.find(item => item.name === name)
    const content = () => node.childNodes.map(child => 'value' in child ? child.value : '').join('')
    const inlineStyle = attr('style')
    if (inlineStyle) {
      const output = await compile(inlineEntry(`:root{${inlineStyle.value}}`, 'css'))
      inlineStyle.value = output.css.slice(output.css.indexOf('{') + 1, output.css.lastIndexOf('}')).trim()
    }
    if (node.tagName === 'base') { defaultTreeAdapter.detachNode(node); continue }
    if (node.tagName === 'script') {
      const src = attr('src')
      if (src || attr('type')?.value === 'module') {
        const output = await compile(src ? resolve(src.value, page) : inlineEntry(content(), 'js'))
        const deferred = src && attr('type')?.value !== 'module' && (attr('defer') || attr('async'))
        node.attrs = node.attrs.filter(item => !['src', 'integrity', 'crossorigin'].includes(item.name))
        if (deferred) {
          node.attrs.push({ name: 'src', value: `data:text/javascript;base64,${Buffer.from(output.script).toString('base64')}` })
          text(node, '')
        } else text(node, output.script.replace(/<\/script/gi, '<\\/script'))
        if (output.css) style(output.css)
      }
    } else if (node.tagName === 'style') {
      const output = await compile(inlineEntry(content(), 'css'))
      text(node, output.css.replace(/<\/style/gi, '<\\/style'))
    } else if (node.tagName === 'link' && attr('rel')?.value === 'stylesheet') {
      const href = attr('href')
      if (!href) continue
      const output = await compile(resolve(href.value, page))
      node.tagName = node.nodeName = 'style'
      node.attrs = node.attrs.filter(item => ['media', 'title', 'nonce'].includes(item.name))
      text(node, output.css.replace(/<\/style/gi, '<\\/style'))
    } else {
      for (const attribute of node.attrs) {
        if (attribute.name === 'srcset' && ['img', 'source'].includes(node.tagName)) attribute.value = stringifySrcset(parseSrcset(attribute.value).map(candidate => ({ ...candidate, url: dataUrl(candidate.url, page) })))
        if (attribute.name === 'src' || attribute.name === 'poster' || (node.tagName === 'link' && attribute.name === 'href' && attr('rel')?.value === 'icon')) attribute.value = dataUrl(attribute.value, page)
        if (node.tagName === 'a' && attribute.name === 'href' && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(attribute.value)) {
          const target = new URL(attribute.value, `https://site.invalid/${page}`)
          const path = decodeURIComponent(target.pathname)
          attribute.value = navigationUrl(path) + target.hash
          if (parentNavigation) {
            node.attrs = node.attrs.filter(item => item.name !== 'data-dsh-site-path')
            node.attrs.push({ name: 'data-dsh-site-path', value: path + target.hash })
          }
        }
      }
    }
  }
  if (parentNavigation) {
    const script = defaultTreeAdapter.createElement('script', head.namespaceURI, [])
    text(script, `document.addEventListener('click', event => {
      const link = event.target instanceof Element && event.target.closest('a[data-dsh-site-path]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      parent.postMessage({ type: 'dsh-site-preview-navigation', path: link.getAttribute('data-dsh-site-path') }, '*');
    });`)
    defaultTreeAdapter.appendChild(head, script)
  }
  const html = serialize(document)
  if (Buffer.byteLength(html, 'utf8') > maxBytes) throw new Error('Expanded preview exceeds the configured byte limit')
  return new Response(html, { headers: response.headers })
}
