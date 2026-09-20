/** File transfer tests prove exact asset bytes, bounded requests and explicit replacement. */
import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { importSiteFiles, siteRevisionBody, siteSourceZip } from '../src/client-site-files.ts'
import type { SiteProject } from '../../../packages/site/site/src/types.ts'

const project: SiteProject = { framework: 'static', files: [{ path: 'index.html', encoding: 'utf8', content: '<h1>网站</h1>' }] }
const options = { directory: 'assets', replace: false, baseRevisionId: 'observed-revision', maxBodyBytes: 10000 }
const signal = new AbortController().signal

describe('Sites source transfer', () => {
  it('preserves arbitrary file bytes and unrelated source through upload and ZIP export', async () => {
    const bytes = new Uint8Array([0, 255, 128, 1, 13, 10])
    const imported = await importSiteFiles(project, [new File([bytes], '图.png')], options, signal)
    expect(project.files).toHaveLength(1)
    expect(imported.files[0]).toEqual(project.files[0])
    const archive = unzipSync(siteSourceZip(imported))
    expect(Object.keys(archive)).toEqual(['index.html', 'assets/图.png'])
    expect(archive['assets/图.png']).toEqual(bytes)
    expect(new TextDecoder().decode(archive['index.html'])).toBe('<h1>网站</h1>')
  })

  it('requires explicit replacement and preserves the saved path spelling', async () => {
    const source: SiteProject = { ...project, files: [...project.files, { path: 'assets/Logo.png', encoding: 'base64', content: 'AA==' }] }
    const file = new File([new Uint8Array([255])], 'logo.png')
    await expect(importSiteFiles(source, [file], options, signal)).rejects.toThrow('duplicateFile')
    const replacement = await importSiteFiles(source, [file], { ...options, replace: true }, signal)
    expect(replacement.files).toHaveLength(2)
    expect(replacement.files[1]).toEqual({ path: 'assets/Logo.png', encoding: 'base64', content: '/w==' })
    await expect(importSiteFiles(source, [file, file], { ...options, replace: true }, signal)).rejects.toThrow('duplicateFile')
  })

  it('bounds the complete encoded revision request, including existing source and Unicode paths', async () => {
    const file = new File(['small'], '字.txt')
    const imported = await importSiteFiles(project, [file], options, signal)
    const bytes = new TextEncoder().encode(JSON.stringify(siteRevisionBody(imported, options.baseRevisionId))).byteLength
    await expect(importSiteFiles(project, [file], { ...options, maxBodyBytes: bytes - 1 }, signal)).rejects.toThrow('tooLarge')
    await expect(importSiteFiles(project, [file], { ...options, maxBodyBytes: bytes }, signal)).resolves.toEqual(imported)
    await expect(importSiteFiles(project, [file], { ...options, maxBodyBytes: 1 }, signal)).rejects.toThrow('tooLarge')
  })

  it('discards late file reads after the editor lifetime ends', async () => {
    let complete!: (bytes: ArrayBuffer) => void
    const controller = new AbortController()
    const file = new File(['data'], 'asset.bin')
    file.arrayBuffer = () => new Promise(resolve => { complete = resolve })
    const reading = importSiteFiles(project, [file], options, controller.signal)
    controller.abort()
    complete(new ArrayBuffer(4))
    await expect(reading).rejects.toThrow()
    expect(project.files).toHaveLength(1)
  })
})
