import { jsonb, text, timestamp, pgTable } from 'drizzle-orm/pg-core'

export const frameDocuments = pgTable('frame_documents', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
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

export const databaseSchema = { frameDocuments, frameTemplates, contentSources }
