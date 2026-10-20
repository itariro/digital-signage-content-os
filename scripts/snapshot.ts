// Periodic instance snapshot for cron/systemd timers.
// Usage: FRAME_DATA_DIR=/var/lib/frame npx tsx scripts/snapshot.ts
// Rotation honors BACKUP_MAX (default 10).
import { snapshotIfPopulated, dbFilePath } from '../lib/backup'

const dst = snapshotIfPopulated(undefined, dbFilePath())
if (dst) {
  console.log(`snapshot written: ${dst}`)
} else {
  console.log('no snapshot taken (database missing or empty)')
}
