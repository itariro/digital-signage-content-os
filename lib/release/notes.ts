import { ReleaseError } from './version'

const HEADING = /^##\s+release notes\s*$/i
const NEXT_HEADING = /^##\s+/
const FENCE = /^\s*(```|~~~)/

function finish(lines: string[]): string {
  const text = lines.join('\n').trim()
  if (!text) {
    throw new ReleaseError('release PR "## Release notes" section is empty')
  }
  return text
}

export function extractReleaseNotes(prBody: string): string {
  if (typeof prBody !== 'string') {
    throw new ReleaseError('release PR body is empty')
  }

  const lines = prBody.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  let start = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (start < 0) {
      if (HEADING.test(line)) start = i + 1
      continue
    }

    if (NEXT_HEADING.test(line)) {
      return finish(lines.slice(start, i))
    }
  }

  if (start < 0) {
    throw new ReleaseError('release PR body is missing a "## Release notes" section')
  }
  return finish(lines.slice(start))
}