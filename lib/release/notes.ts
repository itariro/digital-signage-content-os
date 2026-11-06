import { ReleaseError } from './version'

const HEADING = /^##\s+release notes\s*$/i
const NEXT_HEADING = /^##\s+/
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/

function finish(lines: string[]): string {
  const text = lines.join('\n').trim()
  if (!text) {
    throw new ReleaseError('release PR "## Release notes" section is empty')
  }
  return text
}

function fenceMarker(line: string): { char: string; length: number } | null {
  const match = FENCE_OPEN.exec(line)
  if (!match) return null
  const marker = match[1]
  return { char: marker.charAt(0), length: marker.length }
}

export function extractReleaseNotes(prBody: string): string {
  if (typeof prBody !== 'string') {
    throw new ReleaseError('release PR body is empty')
  }

  const lines = prBody.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  let fenceChar = ''
  let fenceLength = 0
  let start = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (inFence) {
      const marker = fenceMarker(line)
      if (
        marker &&
        marker.char === fenceChar &&
        marker.length >= fenceLength &&
        /^ {0,3}(`{3,}|~{3,})\s*$/.test(line)
      ) {
        inFence = false
        fenceChar = ''
        fenceLength = 0
      }
      continue
    }

    const marker = fenceMarker(line)
    if (marker) {
      inFence = true
      fenceChar = marker.char
      fenceLength = marker.length
      continue
    }

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