import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectProjectSecretMatches } from './scan-project-secrets.ts'

describe('project secret scanner', () => {
  const temporaryRoots: string[] = []

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true })
  })

  it('scans hidden environment files without returning their contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-secret-scan-'))
    temporaryRoots.push(root)
    writeFileSync(join(root, '.env'), 'FASTAI_API_KEY=do-not-print\n')

    expect(collectProjectSecretMatches(root, ['fastai'])).toEqual([
      { file: '.env', line: 1, source: 'content' },
    ])
  })

  it('skips generated directories and explicit intentional references', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-secret-scan-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'generated.txt'), 'fastaitoken\n')
    writeFileSync(join(root, 'docs', 'usage.md'), 'fastaitoken\n')
    writeFileSync(join(root, 'source.ts'), 'fastaitoken\n')

    expect(collectProjectSecretMatches(root, ['fastai'], false, ['docs'])).toEqual([
      { file: 'source.ts', line: 1, source: 'content' },
    ])
  })
})
