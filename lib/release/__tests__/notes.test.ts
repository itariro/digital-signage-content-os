import { describe, it, expect } from 'vitest'
import { extractReleaseNotes } from '../notes'

describe('release notes', () => {
  it('extracts the section until the next level-two heading', () => {
    const body = [
      '## Summary',
      'Some text',
      '',
      '## Release notes',
      '',
      '### Highlights',
      '- One',
      '',
      '## Test plan',
      '- Tests',
    ].join('\n')
    expect(extractReleaseNotes(body)).toBe('### Highlights\n- One')
  })

  it('matches the heading case-insensitively and trims it', () => {
    expect(extractReleaseNotes('##   RELEASE NOTES   \n\nHello\n')).toBe('Hello')
  })

  it('keeps heading-like lines inside fenced code blocks', () => {
    const body = [
      '## Release notes',
      '```md',
      '## not a heading',
      '```',
      'After',
      '## Next',
    ].join('\n')
    expect(extractReleaseNotes(body)).toBe('```md\n## not a heading\n```\nAfter')
  })

  it('handles CRLF line endings', () => {
    expect(extractReleaseNotes('## Release notes\r\n\r\nHello\r\n')).toBe('Hello')
  })

  it('throws when the section is missing', () => {
    expect(() => extractReleaseNotes('## Summary\nHello')).toThrow(/missing/)
  })

  it('throws when the section is empty', () => {
    expect(() => extractReleaseNotes('## Release notes\n\n## Test plan\n')).toThrow(/empty/)
  })
})
