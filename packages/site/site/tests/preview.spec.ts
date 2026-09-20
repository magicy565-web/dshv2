/** Private previews compile actual browser assets without reading files outside the saved project. */
import { describe, expect, it } from 'vitest'
import { buildStaticSite } from '../src/project.ts'
import { renderStaticPreview } from '../src/preview.ts'
import { SiteRevisionId, type SiteProjectFile } from '../src/types.ts'

function artifact(files: Record<string, string>) {
  return buildStaticSite(SiteRevisionId('reviewed'), { framework: 'static', files: Object.entries(files).map(([path, content]): SiteProjectFile => ({ path, content, encoding: 'utf8' })) })
}

describe('static project preview', () => {
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

  it.each(['node:fs', 'file:///etc/passwd', 'https://example.com/app.js', '../../outside.js'])('rejects imports unavailable in the project: %s', reference => {
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
})
