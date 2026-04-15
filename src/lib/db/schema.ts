/**
 * Noema Research - Database Schema
 *
 * Three-table design optimized for citation-grade transcript storage:
 *   - studies: canonical study configuration + aggregate synthesis
 *   - interviews: one row per participant session, with synthesis JSONB
 *   - turns: normalized transcript (every message is a row)
 *
 * Design decisions:
 * - `turns` is normalized so every synthesis claim can cite a specific turn id
 * - JSONB for flexible config/profile/synthesis without over-normalizing
 * - ON DELETE CASCADE on all FKs for clean study deletion
 * - CHECK constraints on enum-like columns prevent invalid data at the DB level
 * - config_version enables forward migration of the JSONB config shape over time
 */

import { pgTable, text, integer, bigserial, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  StudyConfig,
  ParticipantProfile,
  SynthesisResult,
  BehaviorData,
  AggregateSynthesisResult,
} from '@/types';

// ============================================
// studies
// ============================================

export const studies = pgTable(
  'studies',
  {
    // Text PK (not UUID) because the codebase generates study ids via crypto.randomUUID
    // AND demo fixtures use human-readable ids like `demo-study-adaptive-self`.
    // Using text preserves both paths without a migration layer.
    id: text('id').primaryKey(),
    // Full StudyConfig as typed JSONB. config.id mirrors studies.id for convenience.
    config: jsonb('config').$type<StudyConfig>().notNull(),
    configVersion: integer('config_version').notNull().default(1),
    isLocked: boolean('is_locked').notNull().default(false),
    interviewCount: integer('interview_count').notNull().default(0),
    // Aggregate synthesis result (null until first run). Stored here instead of a
    // separate table — runs ~once per study and avoids a FK lookup on dashboard loads.
    aggregateSynthesis: jsonb('aggregate_synthesis').$type<AggregateSynthesisResult>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_studies_created_at').on(table.createdAt.desc()),
  ]
);

export type StudyRow = typeof studies.$inferSelect;
export type NewStudyRow = typeof studies.$inferInsert;

// ============================================
// interviews
// ============================================

export const interviews = pgTable(
  'interviews',
  {
    // Text PK (not UUID) because existing code generates ids like `interview-${Date.now()}`
    // and demo fixtures use `interview-demo-sarah`. Preserve that shape.
    id: text('id').primaryKey(),
    studyId: text('study_id')
      .notNull()
      .references(() => studies.id, { onDelete: 'cascade' }),
    // Denormalized study name for easy display without a join on list views.
    studyName: text('study_name').notNull(),

    // Participant identity (anonymized by default — email only if from email channel)
    participantProfile: jsonb('participant_profile').$type<ParticipantProfile>().notNull(),

    // Per-interview synthesis. Written once after transcript save completes.
    synthesis: jsonb('synthesis').$type<SynthesisResult>(),

    // Client-computed behavior metrics (time per topic, message counts, etc.)
    behaviorData: jsonb('behavior_data').$type<BehaviorData>(),

    status: text('status').notNull().default('in_progress'),
    // SHA-256 hash of the participant JWT. Raw token never stored.
    // Nullable because admin previews and legacy interviews may not have one.
    tokenHash: text('token_hash'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // LGPD: timestamp when participant clicked "Begin" on consent screen
    consentRecordedAt: timestamp('consent_recorded_at', { withTimezone: true }),
  },
  (table) => [
    // status CHECK: enforced via raw SQL below in migration; Drizzle does not emit
    // CHECK constraints from the schema builder yet for enum-style text columns.
    index('idx_interviews_study').on(table.studyId),
    index('idx_interviews_study_status').on(table.studyId, table.status),
    index('idx_interviews_created_at').on(table.createdAt.desc()),
    uniqueIndex('idx_interviews_token_hash')
      .on(table.tokenHash)
      .where(sql`${table.tokenHash} IS NOT NULL`),
  ]
);

export type InterviewRow = typeof interviews.$inferSelect;
export type NewInterviewRow = typeof interviews.$inferInsert;

// ============================================
// turns
// ============================================

/**
 * Every message in every interview, stored as its own row.
 *
 * This is the citation-grade storage layer. Synthesis claims reference
 * turns by id (BIGSERIAL) so every theme/insight can trace back to the
 * exact words a participant said.
 *
 * Write pattern: buffered during the interview, batch-INSERTed on save.
 */
export const turns = pgTable(
  'turns',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    interviewId: text('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    // Position within the interview (0-indexed). UNIQUE per interview.
    turnNumber: integer('turn_number').notNull(),
    // 'user' | 'ai' | 'system' — matches existing InterviewMessage.role
    role: text('role').notNull(),
    content: text('content').notNull(),
    // Original message id from the client (for correlation with existing code paths)
    messageId: text('message_id'),
    // Client-reported message timestamp (ms since epoch). Server-side createdAt below.
    messageTimestamp: timestamp('message_timestamp', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_turns_unique_order').on(table.interviewId, table.turnNumber),
    index('idx_turns_interview').on(table.interviewId),
  ]
);

export type TurnRow = typeof turns.$inferSelect;
export type NewTurnRow = typeof turns.$inferInsert;
