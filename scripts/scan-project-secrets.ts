import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_TERMS = ['fastaitoken', 'fastai'] as const
const GENERATED_DIRECTORY_NAMES = new Set([
  '.dsh-build',
  '.git',
  '.pnpm-store',
  'coverage',
  'dist',
  'lib',
  'node_modules',
])

/** Return regular repository files, including hidden files, without following links. */
function repositoryFiles(root: string, directory = ''): string[] {
  const files: string[] = []
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const relativePath = directory === '' ? entry.name : `${directory}/${entry.name}`
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (GENERATED_DIRECTORY_NAMES.has(entry.name)) continue
      files.push(...repositoryFiles(root, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files
}

/** A redacted location where a requested secret-related term was found. */
export interface SecretMatch {
  /** Repository-relative file path. */
  readonly file: string
  /** One-based content line, or zero when the file path matched. */
  readonly line: number
  /** Whether the match came from the path or file contents. */
  readonly source: 'content' | 'path'
}

/** Find requested terms without returning matching lines or secret values. */
export function collectProjectSecretMatches(
  root: string = ROOT,
  terms: readonly string[] = DEFAULT_TERMS,
  includeGenerated = false,
  excludedPaths: readonly string[] = [],
): SecretMatch[] {
  const normalizedTerms = [...new Set(terms.map(term => term.trim().toLowerCase()).filter(Boolean))]
  const normalizedExcludedPaths = excludedPaths
    .map(path => path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase())
    .filter(Boolean)
  if (normalizedTerms.length === 0) throw new Error('security:scan requires at least one non-empty --term')

  const matches: SecretMatch[] = []
  for (const file of repositoryFiles(root)) {
    const stat = lstatSync(resolve(root, file))
    if (!stat.isFile() || stat.isSymbolicLink()) continue
    const relativePath = file.split(sep).join('/')
    if (!includeGenerated && relativePath.split('/').some(part => GENERATED_DIRECTORY_NAMES.has(part))) continue
    if (normalizedExcludedPaths.some(path => relativePath.toLowerCase() === path || relativePath.toLowerCase().startsWith(`${path}/`))) continue

    if (normalizedTerms.some(term => relativePath.toLowerCase().includes(term))) {
      matches.push({ file: relativePath, line: 0, source: 'path' })
    }

    const content = readFileSync(resolve(root, file))
    if (content.includes(0)) continue
    const lines = content.toString('utf8').split('\n')
    lines.forEach((line, index) => {
      if (normalizedTerms.some(term => line.toLowerCase().includes(term))) {
        matches.push({ file: relativePath, line: index + 1, source: 'content' })
      }
    })
  }
  return matches
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      term: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      'include-generated': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })
  const terms = values.term ?? [...DEFAULT_TERMS]
  const matches = collectProjectSecretMatches(
    ROOT,
    terms,
    values['include-generated'],
    values.exclude ?? [],
  )
  if (matches.length > 0) {
    process.stderr.write('security:scan found requested terms (values intentionally omitted):\n')
    for (const match of matches) {
      process.stderr.write(`  ${match.file}:${match.line === 0 ? 'path' : String(match.line)}\n`)
    }
    process.exitCode = 1
  } else {
    process.stdout.write(`security:scan found no requested terms in ${ROOT}\n`)
  }
}
