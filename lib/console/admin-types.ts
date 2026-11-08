export type AdminConflict = {
  id: string
  instanceId: string
  entityType: string
  entityId: string
  localRevision: number
  remoteRevision: number
  status: 'open' | 'rejected'
  createdAt: string | null
}

export type AdminAuditEntry = {
  id: string
  actor: string
  action: string
  targetType: string
  targetId: string
  createdAt: string | null
}
