/** Live generation acceptance verifies saved projects after the owning dsh process has exited. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { runLoaderSmoke } from '../../../packages/test-support/loader-smoke/lib/index.js'
import { verifySiteBrowser } from './site-model-browser.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
try { process.loadEnvFile(join(root, '.env')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const briefs = [
  { name: 'Fieldwork Studio', style: 'warm botanical minimalism, cream background, forest green accents, generous space, serif typography and an asymmetric hero' },
  { name: 'Orbit Systems', style: 'dark technology, midnight blue background, mint accents, sans-serif typography, a centered hero and a three-column feature grid' },
  { name: 'Form and Matter', style: 'an editorial magazine, ivory background, vermilion accents, large serif headlines, strong rules and a split-column layout' },
]

const apiKeyEnv = process.env.DSH_SITES_API_KEY_ENV ?? 'DEEPSEEK_API_KEY'
const extraPatch = process.env.DSH_SITES_MODEL_PATCH

for (const brief of briefs) test(`live Sites generation: ${brief.name}`, { skip: !process.env[apiKeyEnv], timeout: 210000 }, async t => {
  await mkdir(join(root, '.trade-runtime'), { recursive: true })
  const evidence = await mkdtemp(join(root, '.trade-runtime/sites-live-'))
  t.diagnostic(`Generated-site evidence: ${evidence}`)
  const config = join(root, 'trade/enterprise/test/fixtures/sites-model.patch.yml')
  let saved
  await runLoaderSmoke({
    label: `Sites generation: ${brief.name}`, tempDirPrefix: 'dsh-sites-model-',
    binScript: join(root, 'apps/cli/src/bin.ts'), configPath: config, tsconfigPath: join(root, 'tsconfig.json'), mode: 'lib',
    binArgs: ['--profile', 'headless', '--patch', config, ...(extraPatch ? ['--patch', extraPatch] : []), `Use the Sites tools to create one independent static website named "${brief.name}". Design direction: ${brief.style}. Use original responsive HTML, CSS and browser JavaScript, with a viewport meta tag, an h1 containing the site name, and a working button with id="demo-action" that changes the visible text of an element with id="demo-result" to "Ready". Save all dependencies as project files, use CSS or inline SVG artwork, and use no CDNs, frameworks, external fonts or network requests. This is a fictional design exercise; no company documents or commerce connection are needed. Call site_preview on the exact saved revision and fix any reported build errors before finishing. Do not publish.`],
    processTimeoutMs: 180000,
    inspect: cwd => {
      const database = new DatabaseSync(join(cwd, '.dsh/enterprise/sites.sqlite'), { readOnly: true })
      try { saved = JSON.parse(database.prepare('SELECT document FROM site_state WHERE id = 1').get().document) }
      finally { database.close() }
    },
  })
  assert.equal(saved.sites.length, 1)
  const site = saved.sites[0]
  assert.equal(site.name, brief.name)
  assert.equal(site.connectionId, undefined)
  assert.equal(site.publishedRevisionId, undefined)
  assert.deepEqual(saved.jobs, [])
  const revision = saved.revisions.find(item => item.id === site.currentRevisionId)
  assert.ok(revision?.changeSet.project)
  await writeFile(join(evidence, 'project.json'), JSON.stringify(revision.changeSet.project, null, 2) + '\n')
  await verifySiteBrowser(revision.changeSet.project, brief.name, evidence, revision.id)
})
