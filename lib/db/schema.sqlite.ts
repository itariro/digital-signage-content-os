import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const frameDocuments = sqliteTable('frame_documents', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolutionWidth: integer('resolution_width').notNull().default(1920),
  resolutionHeight: integer('resolution_height').notNull().default(1080),
  screenWidthMm: integer('screen_width_mm'),
  screenHeightMm: integer('screen_height_mm'),
})

export const frameTemplates = sqliteTable('frame_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const contentSources = sqliteTable('content_sources', {
  id: text('id').primaryKey(),
  frameId: text('frame_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  config: text('config').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const displayHistory = sqliteTable('display_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frameId: text('frame_id').notNull(),
  decisionId: text('decision_id').notNull(),
  ruleId: text('rule_id'),
  layoutId: text('layout_id').notNull(),
  shownAt: text('shown_at').notNull(),
  score: real('score').notNull(),
})

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: text('next_attempt_at').notNull(),
  status: text('status').notNull().default('pending'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  hash: text('hash').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  source: text('source').notNull().default('local'),
})

export const syncCheckpoints = sqliteTable('sync_checkpoints', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  cursor: text('cursor').notNull(),
  updatedAt: text('updated_at').notNull(),
})
