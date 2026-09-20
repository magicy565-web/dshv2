/** Source-mode hosting tests use the repository's decorator and import-resolution rules. */
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [standardDecoratorPlugin(), tsconfigPaths({ projects: [fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url))] })],
  test: { include: ['trade/enterprise/test/*.spec.ts'], environment: 'node', execArgv: vitestExecArgv },
})
