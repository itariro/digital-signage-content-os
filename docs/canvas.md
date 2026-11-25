# Multi-frame canvas

A canvas drives several frames from one deployment. Each frame keeps its own
layout and schedule but becomes a window onto one shared scene while a
deployment is live. Releasing the deployment returns the frame to its layout
without restoring anything.

## What phase 1 ships

- Canvas types, schema and album normalization (`kind: 'canvas'`, theme
  `canvas`, presentation `canvas`).
- A `canvas_state` row per instance, with a revision and the last display
  report.
- Deterministic scene state: `marquee`, `bounce`, `pong` and `sync-test`.
  Every scene is a pure function of scene time and seed, so no frame needs to
  know which slot it is.
- Canvas geometry: row, column and grid arrangements with gaps, offsets,
  scales, markers and per-pair gap rectangles.
- Clock estimation from sync pulls, takeover resolution, and a scheduled
  album with sequence or shuffle order.
- A canvas pull on the instance: 5 s while a deployment or identify is present,
  30 s when idle, both with ±10% jitter and backoff on error. It runs the normal
  sync cycle, separate from the 15 minute sync worker.
- Display takeover: `/api/canvas/state` serves the row, the stage clips it to
  the frame's slot, and `/api/canvas/report` records what the display drew.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CANVAS_POLL_ACTIVE_SECONDS` | `5` | Fast poll while a deployment or identify is present. `0` falls back to `SYNC_INTERVAL_MINUTES`. |
| `CANVAS_POLL_IDLE_SECONDS` | `30` | Fast poll when the canvas row is idle. `0` falls back to `SYNC_INTERVAL_MINUTES`. |
| `SYNC_INTERVAL_MINUTES` | `15` | Regular sync interval, used when a fast-poll override is `0`. |
| `CANVAS_DEMO` | unset | Set to `1` to allow the demo route in production. |
| `SYNC_ENDPOINT`, `SYNC_TOKEN`, `INSTANCE_ID` | unset | Required for canvas delivery. Without them the display has no canvas row. |

## Local walkthrough

1. Run the app with a SQLite database:
   `FRAME_DB_PATH=.data/canvas-demo.db pnpm dev`
2. Create a demo wall for the local frame:
   `curl -X POST 'http://localhost:3000/api/canvas/demo?frame=home&slot=a&identify=1'`
3. Open `http://localhost:3000`. The page shows the marquee, then bounce,
   then pong, then the sync test. The identify overlay counts down for 60
   seconds.
4. Point a second display at slot `b` by making it read the same state row, or
   repeat the request with `slot=b` on a second instance database.
5. Clear it:
   `curl -X DELETE 'http://localhost:3000/api/canvas/demo?frame=home'`

The demo row is local. It does not call the console and it does not survive a
different `FRAME_DB_PATH`.

## Checks

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

## Known limits in phase 1

- There is no canvas editor. The console writes deployments and the demo route
  writes one locally; authoring lands in phase 2.
- The display reports applied revision, viewport and fps, but the console does
  not surface them yet. Reporting lands in phase 3.
- Scenes share one timeline per deployment. Per-scene overrides and the
  catalog land in phase 4.
