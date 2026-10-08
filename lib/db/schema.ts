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
})

export const frameTemplates = pgTable('frame_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
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
