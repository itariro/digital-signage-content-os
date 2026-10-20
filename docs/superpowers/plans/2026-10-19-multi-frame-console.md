# Multi-Frame Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve the dashboard into a multi-frame management console: instance registration, health, sync status, config push, audit log, decommission.

**Architecture:** Add `/console` route (server component) listing instances from `instances` + `frame_documents`. Instance registration endpoint issues device tokens. Audit log table. Config rollout reuses sync pull (central updates propagate). Auth via admin token env (`CONSOLE_ADMIN_TOKEN`) for mutating ops; document Clerk as production provider.

**Tech Stack:** Next.js 16, Drizzle, nanoid, Tailwind, shadcn table.

---

## Tasks

1. Add `audit_log` table to both schemas + DDL.
2. Instance registration/list/revoke API routes.
3. Audit logging helper.
4. Console page (instance table + detail).
5. Config push endpoint (update frame doc centrally + audit).
6. Documentation.

Execution will proceed task-by-task with TDD where applicable.
EOF
echo written