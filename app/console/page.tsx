import { auth } from '@clerk/nextjs/server'
import { listAudit } from '@/lib/audit'
import { listInstanceCards } from '@/lib/console/service'

export const dynamic = 'force-dynamic'

export default async function ConsolePage() {
  // Defense in depth: proxy.ts already redirects; this holds even if the matcher changes.
  await auth.protect()
  const instances = await listInstanceCards().catch(() => [])
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Frame Console</h1>
      <p className="text-sm text-muted-foreground">Multi-instance management. Register instances via POST /api/instances.</p>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">Instance</th>
              <th className="p-2 text-left">Frame</th>
              <th className="p-2 text-left">Revision</th>
              <th className="p-2 text-left">Updated</th>
              <th className="p-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((i) => {
              const f = i.frame
              return (
                <tr key={i.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{i.id}</td>
                  <td className="p-2">{f?.name ?? '—'}</td>
                  <td className="p-2">{f?.revision ?? '—'}</td>
                  <td className="p-2 text-xs">{f?.updatedAt ? new Date(f.updatedAt).toLocaleString() : '—'}</td>
                  <td className="p-2 text-xs">{i.createdAt ? new Date(i.createdAt).toLocaleString() : '—'}</td>
                </tr>
              )
            })}
            {instances.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No instances registered.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sync conflicts</h2>
        <ConflictList />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Audit log</h2>
        <AuditList />
      </section>
    </main>
  )
}

async function ConflictList() {
  const { listConflicts } = await import('@/lib/sync/conflicts')
  const rows = (await listConflicts().catch(() => [])).filter((c) => c.status === 'open' || c.status === 'rejected')
  if (!rows.length) return <p className="text-xs text-muted-foreground">No open conflicts.</p>
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="rounded border p-2 text-xs space-y-1">
          <div>
            <span className="font-mono">{c.entityType}/{c.entityId}</span> — instance <span className="font-mono">{c.instanceId}</span>:
            {c.status === 'rejected'
              ? <span className="ml-1 rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">write rejected (not this instance&apos;s frame)</span>
              : <> local rev {c.localRevision} vs remote rev {c.remoteRevision}</>}
          </div>
          <div className="flex gap-2">
            {c.status === 'open' && (
              <>
                <form method="post" action={`/api/sync/conflicts/${c.id}/resolve`}>
                  <button name="resolution" value="remote" className="rounded border px-2 py-1 hover:bg-muted">Accept console version</button>
                </form>
                <form method="post" action={`/api/sync/conflicts/${c.id}/resolve`}>
                  <button name="resolution" value="local" className="rounded border px-2 py-1 hover:bg-muted">Apply instance version</button>
                </form>
              </>
            )}
            {c.status === 'rejected' && (
              <form method="post" action={`/api/sync/conflicts/${c.id}/resolve`}>
                <button name="resolution" value="discard" className="rounded border px-2 py-1 hover:bg-muted">Discard stray write</button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}


async function AuditList() {
  const rows = await listAudit(20).catch(() => [])
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((r) => (
        <li key={r.id} className="rounded border p-2">
          <span className="font-mono">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span> — <strong>{r.actor}</strong> {r.action} {r.targetType}/{r.targetId}
        </li>
      ))}
      {rows.length === 0 && <li className="text-muted-foreground">No audit entries.</li>}
    </ul>
  )
}
