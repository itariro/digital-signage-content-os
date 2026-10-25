import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const frameDocuments = sqliteTable('frame_documents', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  data: text('data', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  revision: integer('revision').notNull().default(1),
  contentHash: text('content_hash'),
  updatedBy: text('updated_by'),
  resolutionWidth: integer('resolution_width').notNull().default(1920),
  resolutionHeight: integer('resolution_height').notNull().default(1080),
  screenWidthMm: integer('screen_width_mm'),
  screenHeightMm: integer('screen_height_mm'),
})

export const frameTemplates = sqliteTable('frame_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const contentSources = sqliteTable('content_sources', {
  id: text('id').primaryKey(),
  frameId: text('frame_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  config: text('config', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const displayHistory = sqliteTable('display_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frameId: text('frame_id').notNull(),
  decisionId: text('decision_id').notNull(),
  ruleId: text('rule_id'),
  layoutId: text('layout_id').notNull(),
  shownAt: integer('shown_at', { mode: 'timestamp_ms' }).notNull(),
  score: real('score').notNull(),
}, (t) => ({
  uniqueConstraint: uniqueIndex('display_history_unique').on(t.frameId, t.decisionId, t.shownAt),
}))

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }).notNull(),
  status: text('status').notNull().default('pending'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  baseRevision: integer('base_revision'),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  hash: text('hash').notNull().unique(),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  refCount: integer('ref_count').notNull().default(0),
  source: text('source').notNull().default('local'),
})

export const syncCheckpoints = sqliteTable('sync_checkpoints', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  cursor: text('cursor').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})


export const syncConflicts = sqliteTable('sync_conflicts', {
  id: text('id').primaryKey(),
  instanceId: text('instance_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  localRevision: integer('local_revision').notNull(),
  remoteRevision: integer('remote_revision').notNull(),
  localPayload: text('local_payload', { mode: 'json' }),
  remotePayload: text('remote_payload', { mode: 'json' }),
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const instances = sqliteTable('instances', {
  id: text('id').primaryKey(),
  deviceTokenHash: text('device_token_hash'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
})

export const enrollmentCodes = sqliteTable('enrollment_codes', {
  codeHash: text('code_hash').primaryKey(),
  instanceId: text('instance_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
})

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  details: text('details', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
