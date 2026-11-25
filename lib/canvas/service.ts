import { eq } from 'drizzle-orm'
import { audit } from '@/lib/audit'
import { getDb } from '@/lib/db'
import { getDatabaseMode } from '@/lib/db/mode'
import { getTables } from '@/lib/db/tables'
import type {
  Album,
  CanvasConfig,
  CanvasDeployment,
  CanvasIdentify,
  CanvasState,
  FrameStore,
  Layout,
} from '@/lib/types'
import { deploymentAlbumFromLibrary } from '@/lib/canvas/deployment-album'
import { canvasSceneSchema } from '@/lib/canvas/schema'
import { resolveGeometry, validateGeometry } from '@/lib/canvas/geometry'
import { ensureCanvasLibrary } from '@/lib/canvas/library'
import { leadMs } from '@/lib/canvas/lead'
import {
  canvasDeploymentFloor,
  listCanvasStates,
  pruneCanvasState,
  putCanvasState,
  rememberDeploymentRevision,
} from '@/lib/canvas/state-store'
import type { CanvasStateRow } from '@/lib/canvas/state-store'

export { getCanvasStatus } from './status'
export type { CanvasStatus, CanvasStatusRowWithState, CanvasStatusState } from './status'

export type CanvasErrorCode =
  | 'E_NO_SLOTS'
  | 'E_UNASSIGNED_SLOT'
  | 'E_UNKNOWN_FRAME'
  | 'E_FRAME_IN_USE'
  | 'E_NO_ALBUM'
  | 'E_NO_SCENES'
  | 'E_OVERLAP'
  | 'E_TOO_LARGE'
  | 'E_SCENE_INVALID'
  | 'E_NOT_FOUND'
  | 'E_RELEASE_AT'
  | 'E_IDENTIFY_SECONDS'

export type CanvasFailure = {
  ok: false
  code: CanvasErrorCode
  error: string
  details?: Record<string, unknown>
}

function fail(code: CanvasErrorCode, error: string, details?: Record<string, unknown>): CanvasFailure {
  return details ? { ok: false, code, error, details } : { ok: false, code, error }
}

export type DeployMember = { slotId: string; frameId: string; marker: number }
export type SkippedMember = { frameId: string | null; slotId?: string; reason: string }
export type DeployResult = CanvasFailure | {
  ok: true
  revision: number
  effectiveAt: number
  leadMs: number
  members: DeployMember[]
  skipped: SkippedMember[]
}

export type ReleaseResult = CanvasFailure | {
  ok: true
  revision: number
  releaseAt: number
  leadMs: number
  members: DeployMember[]
  skipped: SkippedMember[]
}

export type IdentifyResult = CanvasFailure | {
  ok: true
  until: number | null
  members: DeployMember[]
  skipped: SkippedMember[]
}

type Loaded = {
  store: FrameStore
  layout: Layout
  config: CanvasConfig
}

function isFailure(value: Loaded | CanvasFailure): value is CanvasFailure {
  return 'ok' in value && value.ok === false
}

async function loadLayout(layoutId: string): Promise<Loaded | CanvasFailure> {
  const store = await ensureCanvasLibrary()
  const layout = store.layouts.find((entry) => entry.id === layoutId && entry.kind === 'canvas')
  if (!layout?.canvas) return fail('E_NOT_FOUND', 'Canvas layout not found')
  return { store, layout, config: layout.canvas }
}

async function enrolledIds(): Promise<Set<string>> {
  const tables = getTables()
  const rows = await getDb().select({ id: tables.instances.id }).from(tables.instances)
  return new Set(rows.map((row) => row.id))
}

async function writeStates(updates: { instanceId: string; state: CanvasState }[]): Promise<void> {
  if (updates.length === 0) return
  if (getDatabaseMode() === 'postgres') {
    await getDb().transaction(async (tx) => {
      const table = getTables().canvasState
      for (const update of updates) {
        const [existing] = await tx.select({ revision: table.revision }).from(table)
          .where(eq(table.instanceId, update.instanceId)).limit(1)
        const rowRevision = Number(existing?.revision ?? 0) + 1
        const updatedAt = new Date()
        await tx.insert(table).values({
          instanceId: update.instanceId,
          revision: rowRevision,
          data: update.state,
          updatedAt,
        }).onConflictDoUpdate({
          target: table.instanceId,
          set: { revision: rowRevision, data: update.state, updatedAt },
        })
      }
    })
    return
  }
  // better-sqlite3 transactions are synchronous only; each write commits on its
  // own in the dev console, in the same order as the postgres loop above.
  for (const update of updates) await putCanvasState(update.instanceId, update.state)
}

async function deploymentRevisionOf(rows: CanvasStateRow[], layoutId: string): Promise<number> {
  let max = await canvasDeploymentFloor(layoutId)
  for (const row of rows) {
    if (row.data.active?.canvasId === layoutId) max = Math.max(max, row.data.active.revision)
    if (row.data.pending?.canvasId === layoutId) max = Math.max(max, row.data.pending.revision)
  }
  return max
}

function isActiveOwnership(deployment: CanvasDeployment | null, nowMs: number): boolean {
  if (!deployment) return false
  return deployment.releaseAt === null || deployment.releaseAt > nowMs
}

function stateForRow(row: CanvasStateRow | undefined): CanvasState {
  return row?.data ?? { v: 1, active: null, pending: null, identify: null }
}

// Console deploys are rare and short; a single in-process queue keeps two
// concurrent operators from reading the same revision and overwriting each
// other's state writes. Postgres writes are also wrapped in a transaction.
let canvasWriteQueue: Promise<unknown> = Promise.resolve()

function serialiseCanvasWrite<T>(run: () => Promise<T>): Promise<T> {
  const result = canvasWriteQueue.then(run, run)
  canvasWriteQueue = result.then(() => undefined, () => undefined)
  return result
}

async function deployCanvasNow(input: {
  layoutId: string
  leadMs?: number
  releaseAt?: number | null
  actor: string
}): Promise<DeployResult> {
  const loaded = await loadLayout(input.layoutId)
  if (isFailure(loaded)) return loaded
  const { store, layout, config } = loaded
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()

  if (config.slots.length === 0) return fail('E_NO_SLOTS', 'Add at least one frame to the canvas')
  if (config.slots.some((slot) => slot.frameId === null)) {
    return fail('E_UNASSIGNED_SLOT', 'Every slot needs a frame before going live')
  }
  const enrolled = await enrolledIds()
  for (const slot of config.slots) {
    if (slot.frameId && !enrolled.has(slot.frameId)) {
      return fail('E_UNKNOWN_FRAME', 'A slot names a frame that is not enrolled', { frameId: slot.frameId })
    }
  }

  const canvasNames = new Map(store.layouts.map((entry) => [entry.id, entry.name]))
  for (const row of rows) {
    const other = row.data.pending ?? (isActiveOwnership(row.data.active, now) ? row.data.active : null)
    if (!other || other.canvasId === input.layoutId) continue
    for (const slot of config.slots) {
      if (slot.frameId !== row.instanceId) continue
      return fail('E_FRAME_IN_USE', 'That frame is on another scheduled or live canvas', {
        frameId: row.instanceId,
        canvasId: other.canvasId,
        canvasName: canvasNames.get(other.canvasId) ?? other.canvasId,
      })
    }
  }

  const geometry = resolveGeometry(config)
  const issues = validateGeometry(geometry)
  const blocking = issues.find((issue) => issue.code === 'E_OVERLAP' || issue.code === 'E_TOO_LARGE' || issue.code === 'E_NO_SLOTS')
  if (blocking) return fail(blocking.code, blocking.message, { slotIds: blocking.slotIds })

  const albumId = layout.settings.albumId
  const album: Album | undefined = albumId ? store.albums.find((entry) => entry.id === albumId && entry.theme === 'canvas') : undefined
  if (!album) return fail('E_NO_ALBUM', 'Choose a canvas album before going live')
  const scenes = (album.scenes ?? []).filter((scene) => scene.enabled)
  if (scenes.length === 0) return fail('E_NO_SCENES', 'Enable at least one scene in the canvas album')
  for (const scene of scenes) {
    const parsed = canvasSceneSchema.safeParse(scene)
    if (!parsed.success) {
      return fail('E_SCENE_INVALID', 'A scene is invalid', {
        sceneId: scene.id,
        message: parsed.error.issues[0]?.message ?? 'Invalid scene',
      })
    }
  }

  const hasCanvasState = config.slots.map((slot) => rows.some((row) => row.instanceId === slot.frameId && Boolean(row.data.active || row.data.pending || row.data.identify)))
  const chosenLead = leadMs(input.leadMs, hasCanvasState)
  const effectiveAt = now + chosenLead
  const releaseAt = input.releaseAt ?? null
  if (releaseAt !== null && releaseAt <= effectiveAt) {
    return fail('E_RELEASE_AT', 'Release time must be after the canvas goes live')
  }
  const deploymentRevision = await deploymentRevisionOf(rows, input.layoutId) + 1
  await rememberDeploymentRevision(input.layoutId, deploymentRevision)
  const deploymentAlbum = deploymentAlbumFromLibrary(album)

  const members: DeployMember[] = []
  const updates: { instanceId: string; state: CanvasState }[] = []
  for (const slot of config.slots) {
    if (!slot.frameId) continue
    const marker = geometry.slots.find((resolved) => resolved.slotId === slot.id)?.marker ?? members.length + 1
    const deployment: CanvasDeployment = {
      canvasId: layout.id,
      name: layout.name,
      revision: deploymentRevision,
      effectiveAt,
      releaseAt,
      slotId: slot.id,
      config,
      album: deploymentAlbum,
    }
    const state = stateForRow(rows.find((row) => row.instanceId === slot.frameId))
    updates.push({ instanceId: slot.frameId, state: { ...state, pending: deployment } })
    members.push({ slotId: slot.id, frameId: slot.frameId, marker })
  }

  const present = new Set(config.slots.map((slot) => slot.frameId))
  const skipped: SkippedMember[] = []
  for (const row of rows) {
    const owner = row.data.pending ?? row.data.active
    if (!owner || owner.canvasId !== input.layoutId || present.has(row.instanceId)) continue
    if (!enrolled.has(row.instanceId)) {
      skipped.push({ frameId: row.instanceId, reason: 'revoked' })
      continue
    }
    const state = stateForRow(row)
    const active = state.active && state.active.canvasId === input.layoutId
      ? { ...state.active, releaseAt: effectiveAt }
      : state.active
    updates.push({
      instanceId: row.instanceId,
      state: { ...state, active, pending: null },
    })
  }

  await writeStates(updates)
  await audit(input.actor, 'canvas_deploy', 'canvas', layout.id, {
    revision: deploymentRevision,
    effectiveAt,
    members: members.map((member) => member.frameId),
  })
  return {
    ok: true,
    revision: deploymentRevision,
    effectiveAt,
    leadMs: chosenLead,
    members,
    skipped,
  }
}

export async function deployCanvas(input: Parameters<typeof deployCanvasNow>[0]): Promise<DeployResult> {
  return serialiseCanvasWrite(() => deployCanvasNow(input))
}

async function releaseCanvasNow(input: {
  layoutId: string
  leadMs?: number
  actor: string
}): Promise<ReleaseResult> {
  const loaded = await loadLayout(input.layoutId)
  if (isFailure(loaded)) return loaded
  const { layout } = loaded
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()
  const enrolled = await enrolledIds()
  const affected = rows.filter((row) =>
    row.data.active?.canvasId === layout.id || row.data.pending?.canvasId === layout.id,
  )
  const chosenLead = leadMs(input.leadMs, affected.map(() => true))
  const releaseAt = now + chosenLead
  const revision = await deploymentRevisionOf(rows, layout.id)
  const updates: { instanceId: string; state: CanvasState }[] = []
  const members: DeployMember[] = []
  const skipped: SkippedMember[] = []

  for (const row of affected) {
    if (!enrolled.has(row.instanceId)) {
      skipped.push({ frameId: row.instanceId, reason: 'revoked' })
      continue
    }
    const state = stateForRow(row)
    const active = state.active && state.active.canvasId === layout.id
      ? { ...state.active, releaseAt }
      : state.active
    updates.push({ instanceId: row.instanceId, state: { ...state, active, pending: null } })
    const slot = loaded.config.slots.find((entry) => entry.frameId === row.instanceId)
    members.push({
      slotId: slot?.id ?? state.active?.slotId ?? '',
      frameId: row.instanceId,
      marker: 0,
    })
  }

  await writeStates(updates)
  await audit(input.actor, 'canvas_release', 'canvas', layout.id, {
    revision,
    releaseAt,
    members: members.map((member) => member.frameId),
  })
  return { ok: true, revision, releaseAt, leadMs: chosenLead, members, skipped }
}

export async function releaseCanvas(input: Parameters<typeof releaseCanvasNow>[0]): Promise<ReleaseResult> {
  return serialiseCanvasWrite(() => releaseCanvasNow(input))
}

export async function identifyCanvas(input: {
  layoutId: string
  seconds: number
  actor: string
}): Promise<IdentifyResult> {
  if (!Number.isInteger(input.seconds) || input.seconds < 0 || input.seconds > 120) {
    return fail('E_IDENTIFY_SECONDS', 'Identify seconds must be 0 or between 1 and 120')
  }
  const loaded = await loadLayout(input.layoutId)
  if (isFailure(loaded)) return loaded
  const { layout, config } = loaded
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()
  const enrolled = await enrolledIds()
  const geometry = resolveGeometry(config)
  const until = input.seconds === 0 ? null : now + input.seconds * 1000
  const updates: { instanceId: string; state: CanvasState }[] = []
  const members: DeployMember[] = []
  const skipped: SkippedMember[] = []

  for (const slot of config.slots) {
    if (!slot.frameId) {
      skipped.push({ frameId: slot.frameId, slotId: slot.id, reason: 'unassigned' })
      continue
    }
    if (!enrolled.has(slot.frameId)) {
      skipped.push({ frameId: slot.frameId, reason: 'revoked' })
      continue
    }
    const row = rows.find((entry) => entry.instanceId === slot.frameId)
    const state = stateForRow(row)
    const marker = geometry.slots.find((resolved) => resolved.slotId === slot.id)?.marker ?? members.length + 1
    const identify: CanvasIdentify | null = until === null ? null : {
      until,
      canvasName: layout.name,
      frameId: slot.frameId,
      label: slot.label ?? null,
      marker,
      count: config.slots.filter((entry) => entry.frameId !== null).length,
    }
    updates.push({ instanceId: slot.frameId, state: { ...state, identify } })
    members.push({ slotId: slot.id, frameId: slot.frameId, marker })
  }

  await writeStates(updates)
  await audit(input.actor, 'canvas_identify', 'canvas', layout.id, {
    seconds: input.seconds,
    members: members.map((member) => member.frameId),
  })
  return { ok: true, until, members, skipped }
}
