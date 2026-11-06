import fs from 'node:fs'
import { createReleaseArchive } from '../lib/release/archive'
import { extractReleaseNotes } from '../lib/release/notes'
import { checkRelease } from '../lib/release/version'

function usage(): never {
  console.error('usage: release.ts check <version> | notes | package <version> --out <dir>')
  process.exit(2)
}

function main(argv: string[]): number {
  const [command, ...rest] = argv

  switch (command) {
    case 'check': {
      const input = rest[0]
      if (!input) usage()
      const release = checkRelease(process.cwd(), input)
      console.log(`version=${release.version}`)
      console.log(`tag=${release.tag}`)
      console.log(`prerelease=${release.prerelease}`)
      return 0
    }
    case 'notes': {
      const body = fs.readFileSync(0, 'utf8')
      process.stdout.write(`${extractReleaseNotes(body)}\n`)
      return 0
    }
    case 'package': {
      const input = rest[0]
      if (!input) usage()
      const outIndex = rest.indexOf('--out')
      const outDir = outIndex >= 0 ? rest[outIndex + 1] : 'dist'
      if (!outDir) usage()
      const release = checkRelease(process.cwd(), input)
      const archive = createReleaseArchive({
        root: process.cwd(),
        version: release.version,
        outDir,
      })
      console.log(`asset=${archive.path}`)
      console.log(`sha256=${archive.sha256}`)
      return 0
    }
    default:
      usage()
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}