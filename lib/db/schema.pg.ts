import { pgTable, text, bigserial, timestamp, doublePrecision, index, uniqueIndex, integer, jsonb } from 'drizzle-orm/pg-core'

export const frameDocuments = pgTable('frame_documents', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  resolutionWidth: integer('resolution_width').notNull().default(1920),
  resolutionHeight: integer('resolution_height').notNull().default(1080),
  screenWidthMm: integer('screen_width_mm'),
  screenHeightMm: integer('screen_height_mm'),
  revision: integer('revision').notNull().default(1),
  contentHash: text('content_hash'),
  updatedBy: text('updated_by'),
})

export const frameTemplates = pgTable('frame_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  revision: integer('revision').notNull().default(1),
  contentHash: text('content_hash'),
  updatedBy: text('updated_by'),
})

export const contentSources = pgTable('content_sources', {
  id: text('id').primaryKey(),
  frameId: text('frame_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export type FrameDocument = typeof frameDocuments.$inferSelect
export type NewFrameDocument = typeof frameDocuments.$inferInsert
export type ContentSource = typeof contentSources.$inferSelect
export type NewContentSource = typeof contentSources.$inferInsert
export type FrameTemplate = typeof frameTemplates.$inferSelect
export type NewFrameTemplate = typeof frameTemplates.$inferInsert

export const displayHistory = pgTable('display_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  frameId: text('frame_id').notNull(),
  decisionId: text('decision_id').notNull(),
  ruleId: text('rule_id'),
  layoutId: text('layout_id').notNull(),
  shownAt: timestamp('shown_at', { withTimezone: true }).notNull(),
  score: doublePrecision('score').notNull(),
}, (table) => ({
  uniqueConstraint: uniqueIndex('display_history_unique').on(table.frameId, table.decisionId, table.shownAt),
  frameTimeIndex: index('display_history_frame_time').on(table.frameId, table.shownAt),
}))

export type DisplayHistory = typeof displayHistory.$inferSelect
export type NewDisplayHistory = typeof displayHistory.$inferInsert

export const databaseSchema = {
  frameDocuments,
  frameTemplates,
  contentSources,
  displayHistory,
}

export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  hash: text('hash').notNull().unique(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  refCount: integer('ref_count').notNull().default(0),
  source: text('source').notNull().default('local'),
})

export const syncQueue = pgTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
})

export const syncCheckpoints = pgTable('sync_checkpoints', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  cursor: text('cursor').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})


export const syncConflicts = pgTable('sync_conflicts', {
  id: text('id').primaryKey(),
  instanceId: text('instance_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  localRevision: integer('local_revision').notNull(),
  remoteRevision: integer('remote_revision').notNull(),
  localPayload: jsonb('local_payload'),
  remotePayload: jsonb('remote_payload'),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const instances = pgTable('instances', {
  id: text('id').primaryKey(),
  deviceTokenHash: text('device_token_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
})

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
