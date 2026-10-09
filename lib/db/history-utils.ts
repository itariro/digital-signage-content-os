export function truncateToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000)
}

export function retentionCutoff(now: Date, retentionMs: number): Date {
  return new Date(now.getTime() - retentionMs)
}
