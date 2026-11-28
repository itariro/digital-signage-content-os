import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return tsxFiles(full)
    return entry.name.endsWith('.tsx') ? [full] : []
  })
}

describe('Base UI button usage', () => {
  it('styles links directly instead of rendering them through Button', () => {
    const offenders = ['components', 'app']
      .flatMap((dir) => tsxFiles(path.join(root, dir)))
      .filter((file) => /render=\{<a[\s>]/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file))

    expect(offenders).toEqual([])
  })
})
