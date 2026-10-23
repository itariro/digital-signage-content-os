import pkg from '@/package.json'

/** Product version, single-sourced from `package.json` so the UI badge can
 *  never drift from the released tag (see the versioning policy in
 *  `docs/kiosk-cli.md`). */
export const APP_VERSION: string = pkg.version
