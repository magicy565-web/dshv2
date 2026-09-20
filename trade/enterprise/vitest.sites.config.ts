/** Source-mode hosting tests use the repository's decorator and import-resolution rules. */
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

// The standalone plugin install and the workspace renderer must share one React instance.
const resolveTestDependency = createRequire(createRequire(import.meta.url).resolve('@testing-library/react/package.json'))

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: { alias: { react: dirname(resolveTestDependency.resolve('react/package.json')), 'react-dom': dirname(resolveTestDependency.resolve('react-dom/package.json')) } },
  plugins: [standardDecoratorPlugin(), tsconfigPaths({ projects: [fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url))] })],
  test: { include: ['trade/enterprise/test/*.spec.ts'], environment: 'node', execArgv: vitestExecArgv },
})
