# Multi-frame canvas operator guide

A canvas makes several frames show one shared surface. Each frame keeps its own
layout and schedule. While a deployment is live, the frame shows its window of
the canvas instead. Releasing ends the deployment and returns the frame to its
own content. Nothing needs restoring.

## Setup

1. Enroll each screen as an instance from the Frame Directory. Follow the steps
   in `docs/operations.md`. Wait until each instance appears in the frame list.
2. Open the editor and choose Canvas from the rail. The drawer opens on Layouts.
3. Open the Albums tab and create an album. A new canvas album starts with one
   sync-test scene. Keep that scene first for calibration, then add a marquee
   scene with the text you want on the wall.
4. Open the Layouts tab and create a canvas layout. Choose Row, Column or Grid,
   set the bezel gap, then assign each enrolled frame to a slot. Marker numbers
   follow slot order.
5. Select the album in the layout. Check Problems before deploying.
6. Click "Identify". Confirm that the screens show markers 1, 2 and 3 in the
   order you expect.
7. Click "Deploy". The console waits about 15 seconds so every frame can pull
   the deployment. Frames switch at the same instant.
8. Open the Status tab. Confirm that each slot has a recent report, the same
   delivered and rendering revision, a clock quality of good or fair, and no
   problem labels.
9. When the sweep bar lines up across the bezels, disable the sync-test scene or
   set its duration short, then deploy again. Confirm that the marquee crosses
   both bezels on the live wall.

Use enrolled instances only. A slot with no frame stays unassigned until you
pick one. A frame can join one scheduled or live canvas at a time.

## Clock setup

Every frame measures its offset to the console on each sync pull. Playback uses
that offset so scenes line up across bezels. The operating system clock still
needs network time, especially after a power cut.

On a Debian kiosk, check network time with:

```bash
timedatectl status
sudo timedatectl set-ntp true
```

Wait a few minutes after boot before a deploy. Aim for clock skew at or below
20 ms on a LAN and at or below 50 ms through a WAN console. The sync-test scene
and the Status tab are the practical checks. A kiosk with a flat battery needs a
board battery replacement if its clock resets on every power loss.

The app drops clock samples with a round trip above 3 seconds. A frame that has
never reached the console falls back to its system clock and reports poor clock
quality until it gets a sample.

## Calibration

1. Open the canvas layout during setup.
2. Add or keep a sync-test scene at the start of the album. The sweep bar
   crosses the whole canvas. Each slot shows its marker and rectangle.
3. Deploy and watch the bar cross each bezel.
4. If the bar jumps at a bezel, open the Status tab. Check Clock drift risk and
   the clock offset for the two frames on either side of that bezel.
5. Use "Identify" to match physical screens to slot numbers. Change slot order
   in the layout if the markers do not match the room.
6. Adjust the bezel gap in the layout when the visual gap differs from the
   physical gap. The sweep bar passes behind bezels by design.

For a fast local check without enrolled frames, use the demo route in the local
walkthrough below. It uses the same renderer as a kiosk and never runs the
console status route.

## Deploy, update and release

- "Deploy" creates a new deployment revision. The console sets `effectiveAt` in
  the future. Frames keep their old content until that time.
- Deploying again writes a pending deployment. Frames that stay on the canvas
  keep playing the active deployment until the new time. Frames that leave the
  canvas get a release time, so there is no blank gap.
- "Release" ends the deployment at a shared time. Frames return to their own
  layouts and schedules.
- "Identify" shows markers for a chosen number of seconds on draft, scheduled
  and live canvases.
- Editing a layout or album does not change the wall. The Problems column shows
  Unpublished changes until you deploy again.

After each deploy, refresh the Status tab. Check that delivered and rendering
revisions match once `effectiveAt` has passed.

## Status columns

| Column | Meaning |
| --- | --- |
| Marker | Slot number from layout order. |
| Frame | Frame name and instance id. |
| Last seen | Age of the last display report. |
| Delivered | `canvas_state.revision` written by the console. |
| Rendering | Revision the display last applied. |
| Clock | Offset, uncertainty and quality from the frame report. |
| Viewport | Reported logical width and height. |
| FPS | Reported average frames per second. |
| Problems | Labels from the health checks below. |

## Troubleshooting

### Frame missing

The instance was revoked or is no longer enrolled. Revoke cleanup removes its
canvas state row. Add a new enrolled frame to the slot, or remove the slot, then
deploy again.

### No report yet

The frame has never sent a canvas report. Check that it is enrolled, that sync
is enabled, and that its display page is open. Run `kiosk sync now` on the
frame. If the Status tab still shows no report, check `kiosk app logs`.

### Offline

The frame has not reported for more than three poll intervals, 15 seconds with
the default poll. Check network reachability and the app service with `kiosk
app health`. Playback continues from the last clock offset, so a temporary
network loss does not stop the show. The frame joins the current scene when it
returns.

### Out of date

The delivered revision is ahead of the rendering revision after `effectiveAt`.
Check that the frame can reach the console and that its local poll is running.
Deploying again repairs a partial write. Frames that joined late start mid
scene. That is expected.

### Clock drift risk

Clock uncertainty is above 50 ms or the derived quality is poor. Check network
time on the frame, round trip time to the console and WAN latency. Enable NTP
with `sudo timedatectl set-ntp true`, wait for a fresh sample, then check the
sync-test bar again.

### Wrong aspect ratio

The reported viewport is more than 1 percent away from 9 by 16. Check kiosk
rotation, screen mode and browser window size. `kiosk config set rotate right`
or `left` restores portrait. Restart the browser with `sudo kiosk-ctl restart`
after a rotation change.

### Unpublished changes

The library layout or album differs from the deployed snapshot. Deploy again
for a draft or live canvas. No change reaches a frame until you deploy.

## Environment

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `CANVAS_POLL_ACTIVE_SECONDS` | frame service | `5` | Poll interval while the frame has a deployment or identify request. `0` disables the fast active poll and falls back to the regular sync interval. |
| `CANVAS_POLL_IDLE_SECONDS` | frame service | `30` | Poll interval while the frame has no canvas work. `0` disables the idle fast poll. |
| `SYNC_INTERVAL_MINUTES` | frame service | `15` | Regular sync fallback used when an active or idle override is `0`. |
| `CANVAS_DEMO` | local app | unset | Set to `1` to allow the demo route in production. |
| `SYNC_ENDPOINT`, `SYNC_TOKEN`, `INSTANCE_ID` | frame service | unset | Required for canvas delivery. Without them the display has no canvas row. |
| `CONSOLE_ADMIN_TOKEN` | console | unset | Operator token for `GET /api/canvas/status` and other console APIs. |

The Status tab polls every 5 seconds while it is open. Offline means 15
seconds without a report unless you change the active poll interval. The
console does not know each frame's environment, so the status view uses the
default 5 second interval for this label.

## Local walkthrough

1. Run the app with a SQLite database:
   `FRAME_DB_PATH=.data/canvas-demo.db pnpm dev`.
2. Create a demo wall:
   `curl -X POST 'http://localhost:3000/api/canvas/demo?frame=home&slot=a&identify=1'`.
3. Open `http://localhost:3000` and watch the marquee, bounce and sync test.
4. Clear the demo row:
   `curl -X DELETE 'http://localhost:3000/api/canvas/demo?frame=home'`.

The demo row is local and does not use the console status route.

## Checks

```bash
pnpm test
npx tsc --noEmit
pnpm build
```
