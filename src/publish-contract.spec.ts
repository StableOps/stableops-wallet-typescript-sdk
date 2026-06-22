import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const packageRoot = process.cwd()

describe('publish contract', () => {
  it('is publishable without private workspace dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: { access?: string }
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(pkg.private).not.toBe(true)
    expect(pkg.publishConfig?.access).toBe('public')

    const dependencyEntries = Object.entries({
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
      ...pkg.devDependencies,
    })
    expect(dependencyEntries).not.toContainEqual(
      expect.arrayContaining([
        expect.stringMatching(/^@stableops\//u),
        expect.stringMatching(/^workspace:/u),
      ]),
    )
  })

  it('does not import internal stableops workspace packages', () => {
    const source = readSourceFiles(join(packageRoot, 'src')).join('\n')

    expect(source).not.toMatch(/from ['"]@stableops\/shared['"]/u)
  })
})

function readSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return readSourceFiles(path)
    if (!path.endsWith('.ts')) return []
    return readFileSync(path, 'utf8')
  })
}
