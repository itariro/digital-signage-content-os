import { describe, it, expect } from 'vitest'
import { parseLatestRelease, isUpdateAvailableFor } from '../updates'

describe('updates', () => {
  it('parses latest release', () => {
    const info = parseLatestRelease({ tag_name: 'v1.2.3', assets: [{ name: 'dscos-1.2.3.tar.gz', browser_download_url: 'https://x/y' }] })
    expect(info.version).toBe('1.2.3')
    expect(info.assetUrl).toBe('https://x/y')
  })
  it('detects update available', () => {
    expect(isUpdateAvailableFor('0.8.0', '2.0', '1.0.0')).toBe(true)
    expect(isUpdateAvailableFor('1.0.0', '2.0', '1.0.0')).toBe(false)
  })
})