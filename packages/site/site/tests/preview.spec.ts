/** Private previews compile actual browser assets without reading files outside the saved project. */
import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { buildStaticSite } from '../src/project.ts'
import { renderStaticPreview } from '../src/preview.ts'
import { SiteRevisionId, type SiteProjectFile } from '../src/types.ts'

function artifact(files: Record<string, string>) {
  return buildStaticSite(SiteRevisionId('reviewed'), { framework: 'static', files: Object.entries(files).map(([path, content]): SiteProjectFile => ({ path, content, encoding: 'utf8' })) })
}

describe('static project preview', () => {
  it('compiles saved entry files even when the Host working directory contains the same paths', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.site-preview-'))
    try {
      await writeFile(join(directory, 'style.css'), 'body { color: red }')
      await writeFile(join(directory, 'script.js'), 'document.title = "Host-only content"')
      const prefix = basename(directory)
      const output = artifact({
        'index.html': `<link rel="stylesheet" href="${prefix}/style.css"><script src="${prefix}/script.js"></script>`,
        [`${prefix}/style.css`]: 'body { color: #123456 }',
        [`${prefix}/script.js`]: 'document.title = "Saved project content"',
      })
      const html = await (await renderStaticPreview(output, '/', String, 100000)).text()
      expect(html).toContain('#123456')
      expect(html).toContain('Saved project content')
      expect(html).not.toContain('Host-only content')
      expect(html).not.toContain('color: red')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('embeds modules, CSS dependencies and local images while retaining private page navigation', async () => {
    const output = artifact({
      'index.html': '<!doctype html><link rel="stylesheet" href="/theme.css"><button id="counter">0</button><img src="/logo.svg"><script type="module" src="/app.js"></script><a href="/about/">About</a>',
      'theme.css': '@import "./colors.css";body { background-image: url("/logo.svg") }',
      'colors.css': 'body { color: #123456 }',
      'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'app.js': 'import { amount } from "./counter.js";document.querySelector("button").onclick = () => { document.querySelector("button").textContent = amount }',
      'counter.js': 'export const amount = 42',
      'about/index.html': '<h1>About</h1>',
    })
    const response = await renderStaticPreview(output, '/', path => `/private?path=${encodeURIComponent(path)}`, 100000)
    const html = await response.text()
    expect(html).toContain('amount = 42')
    expect(html).toContain('#123456')
    expect(html).toContain('data:image/svg+xml')
    expect(html).not.toContain('src="/app.js"')
    expect(html).not.toContain('href="/theme.css"')
    expect(html).toContain('/private?path=%2Fabout%2F')
    expect(response.headers.get('content-security-policy')).toContain('sandbox allow-scripts;')
    expect((await renderStaticPreview(output, '/absent', String, 100000)).status).toBe(404)
    await expect(renderStaticPreview(output, '/', String, 1)).rejects.toThrow('byte limit')
  })

  it.each(['node:fs', 'file:///etc/passwd', 'https://example.com/app.js', '../../outside.js'])('rejects imports unavailable in the project: %s', (reference) => {
    const output = artifact({ 'index.html': '<script type="module" src="app.js"></script>', 'app.js': `import value from ${JSON.stringify(reference)}; document.title = value` })
    return expect(renderStaticPreview(output, '/', String, 100000)).rejects.toThrow()
  })

  it('resolves inline module imports and inline styles relative to their saved page', async () => {
    const output = artifact({
      'index.html': '<h1>Home</h1>',
      'pages/about.html': '<style>body{background:url(./mark.svg)}aside{background:url(https://images.example/photo.jpg)}</style><script type="module">import { title } from "./title.js"; document.title = title</script>',
      'pages/title.js': 'export const title = "About this site"',
      'pages/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'pages/__dsh_inline_0.css': 'body{color:red}',
    })
    const html = await (await renderStaticPreview(output, '/pages/about.html', String, 100000)).text()
    expect(html).toContain('About this site')
    expect(html).toContain('data:image/svg+xml')
    expect(html).toContain('https://images.example/photo.jpg')
    expect(html).not.toContain('from "./title.js"')
    expect(html).not.toContain('color: red')
  })

  it('retains conditional styles and embeds inline backgrounds and responsive image candidates', async () => {
    const output = artifact({
      'index.html': '<link rel="stylesheet" media="(max-width: 600px)" href="mobile.css"><div style="background-image:url(./mark.svg);color:red!important"></div><picture><source media="(max-width: 600px)" srcset="mark.svg 1x, mark.svg 2x"><img src="mark.svg" srcset="mark.svg 320w, mark.svg 640w"></picture>',
      'mobile.css': 'body { background: red }',
      'mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    })
    const html = await (await renderStaticPreview(output, '/', String, 100000)).text()
    expect(html).toContain('<style media="(max-width: 600px)">')
    expect(html).toMatch(/style="[^\"]*background-image:[^\"]*data:image\/svg\+xml/)
    expect(html).toContain('!important')
    expect(html).toMatch(/srcset="data:image\/svg\+xml;base64,[^ ]+ 1x, data:image\/svg\+xml;base64,[^ ]+ 2x"/)
    expect(html).toMatch(/srcset="data:image\/svg\+xml;base64,[^ ]+ 320w, data:image\/svg\+xml;base64,[^ ]+ 640w"/)
  })

  it('keeps deferred classic scripts external so they can observe the parsed document', async () => {
    const output = artifact({
      'index.html': '<head><script defer src="app.js"></script></head><body><button>Open</button></body>',
      'app.js': 'document.querySelector("button").textContent = "Ready"',
    })
    const response = await renderStaticPreview(output, '/', String, 100000)
    expect(await response.text()).toMatch(/<script defer="" src="data:text\/javascript;base64,[^\"]+"><\/script>/)
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self' 'unsafe-inline' blob: data:")
  })

  it('preserves SVG fragment references in CSS and image sources', async () => {
    const output = artifact({
      'index.html': '<style>body{background:url(mark.svg#logo)}</style><img src="mark.svg#logo">',
      'mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"><view id="logo"/></svg>',
    })
    const html = await (await renderStaticPreview(output, '/', String, 100000)).text()
    expect(html.match(/#logo/g)).toHaveLength(2)
  })

  it('delegates only local page links to the editor when parent navigation is requested', async () => {
    const output = artifact({ 'index.html': '<a href="/about/#team">Team</a><a href="https://example.com">External</a><a href="#top">Top</a>' })
    const embedded = await (await renderStaticPreview(output, '/', path => `/private?path=${encodeURIComponent(path)}`, 100000, true)).text()
    expect(embedded).toContain('data-dsh-site-path="/about/#team"')
    expect(embedded).toContain('dsh-site-preview-navigation')
    expect(embedded).toContain('<a href="https://example.com">')
    expect(embedded).toContain('<a href="#top">')
    const standalone = await (await renderStaticPreview(output, '/', String, 100000)).text()
    expect(standalone).not.toContain('postMessage')
    expect(standalone).not.toContain('data-dsh-site-path')
  })

  it('reports missing inline background assets without revealing Host source paths', async () => {
    const output = artifact({ 'index.html': '<div style="background:url(missing.svg)"></div>' })
    await expect(renderStaticPreview(output, '/', String, 100000)).rejects.toThrow('Preview project file is missing: missing.svg')
    await expect(renderStaticPreview(output, '/', String, 100000)).rejects.not.toThrow('preview.ts')
  })
})
