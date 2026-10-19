import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'

export const dynamic = 'force-dynamic'

export default async function ConsolePage() {
  const db = getDb() as any
  const tables = getTables() as any
  const instances = await db.select().from(tables.instances).catch(() => [])
  const frames = await db.select().from(tables.frameDocuments).catch(() => [])
  const frameMap = new Map(frames.map((f: any) => [f.identifier, f]))
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
            {instances.map((i: any) => {
              const f = frameMap.get(i.id) as any
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
        <h2 className="text-lg font-semibold">Audit log</h2>
        <AuditList />
      </section>
    </main>
  )
}

import { listAudit } from '@/lib/audit'

async function AuditList() {
  const rows = await listAudit(20).catch(() => [])
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((r: any) => (
        <li key={r.id} className="rounded border p-2">
          <span className="font-mono">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span> — <strong>{r.actor}</strong> {r.action} {r.targetType}/{r.targetId}
        </li>
      ))}
      {rows.length === 0 && <li className="text-muted-foreground">No audit entries.</li>}
    </ul>
  )
}
