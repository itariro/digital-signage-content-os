# Kiosk CLI and frame management reference

A digital frame is a small Debian machine that shows one page of this
application full screen. This document covers the whole lifecycle: installing
a frame, configuring it, managing its services, and recovering from problems.

The tooling has two layers:

| Layer | Entry point | Role |
|---|---|---|
| Bootstrap | `install.sh` (runs `install-kiosk.sh`) | One-time provisioning of a fresh Debian 12/13 machine |
| Runtime | `kiosk` CLI | Day-2 management on an installed frame |

The `kiosk` CLI is a TypeScript program (`lib/kiosk/cli.ts`) installed to
`/usr/local/bin/kiosk`. It runs through `tsx` against the deployed source in
`/opt/dscos`, so it is always the version that matches the installed app.

## Install a frame

On a fresh Debian 12/13 machine (x86 thin clients such as the Dell Wyse 3040
are the target; needs at least 1 GB RAM and 1.5 GB free disk):

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
```

`install.sh` downloads the repository tarball, unpacks it to `/opt/dscos`,
verifies the tree, and runs `install-kiosk.sh`. It needs `curl` and `tar` and
must run as root.

From an existing checkout, run the installer directly:

```bash
sudo bash install-kiosk.sh
```

### Installer options

Pass installer options after `-s --` (or run them directly against
`install-kiosk.sh`). Example:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash -s -- --rotate right --tz Australia/Melbourne --yes
```

| Option | Meaning | Default |
|---|---|---|
| `URL` (positional) | Page the frame displays | `http://localhost:3000/frame/home` |
| `-r, --rotate DIR` | Screen rotation: `normal`, `left`, `right`, `inverted`. `left` and `right` give portrait | `left` |
| `-o, --output NAME` | xrandr output, e.g. `DP-1` | first connected output |
| `-m, --mode WxH` | Force a resolution, e.g. `1440x2560` | monitor's preferred mode |
| `--scale FACTOR` | Chromium device scale factor, e.g. `1.5` | 1.0 |
| `--touch` | Rotate touchscreen input to match the display | off |
| `--tz ZONE` | System timezone (IANA name) | unchanged |
| `--restart-hours N` | Restart the browser every N hours to contain memory growth; `0` = never | 24 |
| `--no-zram` | Skip compressed-RAM swap setup | zram on |
| `-y, --yes` | No confirmations, no reboot prompt | interactive |
| `--reboot` | Reboot automatically when finished | prompt |
| `-n, --dry-run` | Preview the plan; changes nothing | off |
| `--plain` / `--fast` | Plain output / no pacing delays | animated |
| `-h, --help` | Show usage | |

Re-running the installer is safe. It overwrites `/etc/kiosk/kiosk.conf`, so
edit settings with `kiosk config set` instead of re-running.

`--dry-run` on `install-kiosk.sh` itself needs no root. Through the wrapper it
still does, because the wrapper places files in `/opt/dscos` before handing
off; for a root-free preview, download `install-kiosk.sh` and run
`bash install-kiosk.sh -n` directly.

### Choosing the installed version

`install.sh` reads two environment variables:

| Variable | Effect |
|---|---|
| `KIOSK_REF` | Branch or tag to download. Applies only when the source is downloaded fresh |
| `KIOSK_APP_DIR` | Where the source is placed (default `/opt/dscos`) |

Set them between `sudo` and `bash`, not before `sudo`. Sudo's default
`env_reset` strips variables set on the `sudo` command itself.

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo KIOSK_REF=v0.8 bash
```

To refresh an installed frame's source, delete `/opt/dscos` and re-run the
one-liner (or point it at a new `KIOSK_REF` after deleting). Re-runs with an
existing `/opt/dscos` reuse that tree and never download.

### Versioning policy

The product is in beta until a polished release earns `v1.0`. Until then:

- Releases are tagged `v0.x` (for example `v0.8`). The `v1.0` tag is
  reserved for the first primetime release.
- `package.json` `version` moves with the tag: tag `v0.8` ships version
  `0.8.0`. Wire updates read the bundled `package.json` version and compare
  it against tags (`lib/kiosk/updates.ts`), so the two must not drift apart.
- Pins follow the same rule: `KIOSK_REF=v0.8`, never a `v1.0` example,
  until `v1.0` actually exists.

The installer's own `INSTALLER_VERSION` (in `install-kiosk.sh`) and the sync
wire protocol's `apiVersion` are separate version spaces and do not track
product tags.

### What the installer sets up

| Component | Location | Notes |
|---|---|---|
| Kiosk user | `kiosk` | No password, no sudo; owns the browser session |
| Application service | `dscos.service` | Next.js app on port 3000, restarts always, data in `/var/lib/dscos` |
| Display session | `lightdm` + `/usr/local/lib/kiosk/session.sh` | Auto-login, Chromium in `--kiosk` mode, rotation applied and re-checked, browser supervised and restarted on exit |
| Browser lockdown | `/etc/chromium/policies/managed/kiosk.json` | No sign-in, extensions, downloads, printing, devtools, or `chrome://` pages |
| Config file | `/etc/kiosk/kiosk.conf` | Root-owned, mode 0644 (the kiosk user's browser session reads it at runtime); secrets stored as `KIOSK_SECRET_*` and redacted in CLI output |
| Management CLI | `/usr/local/bin/kiosk` | This document |
| Session helper | `/usr/local/bin/kiosk-ctl` | Low-level browser/session control (see below) |
| Standby timers | `kiosk-standby-on/off.timer` | systemd, persistent across reboots |
| Storage wear | journald to RAM (30 MB cap), Chromium cache on tmpfs, zram swap | Sized for eMMC devices |

After install, reboot. The machine logs in automatically and shows the frame.

## The `kiosk` CLI

```text
kiosk help              Show usage
kiosk status            Service state plus full config (secrets redacted)
kiosk doctor            Diagnostics: config validity, process, port, HTTP
kiosk enroll            Pair the frame with the console (see "Pair the frame")
kiosk password          Set the frame-local admin password (management-port mutations)
kiosk uninstall --yes   Recorded but not implemented yet (see below)
```

Global options: `--json` for machine-readable output (most commands already
print JSON), `--yes` to skip confirmations on destructive actions.

Exit codes: `0` success, `1` validation failure, unhealthy health report, or
command failure, `2` usage error (missing arguments, unknown subcommand,
confirmation required).

### Application service

```text
kiosk app start | stop | restart    Manage dscos.service
kiosk app health                    Process, port, HTTP, and config checks
kiosk app logs [--lines N]          Journal for the app service (default 100 lines)
```

`app health` returns a report with state `healthy`, `degraded`, or `failed`.
The four core checks (process, port, HTTP, config) are critical: any one
failing makes the whole report `failed`. It exits non-zero when unhealthy, so
it works as a monitoring hook.

### Pair the frame

```text
kiosk enroll <console-url> <CODE>   Redeem a one-time code, write /etc/dscos/frame.env, restart the app
kiosk password <secret>             Set the frame-local admin password (management-port mutations)
```

A freshly installed frame shows its own page but stays unpaired; sync stays off
until you enroll. In the console web UI, open "Add a frame" and click "Issue
enrollment code". The code expires after 15 minutes and works exactly once.
Run the printed command on the frame as root:

```bash
sudo kiosk-ctl enroll https://console.example.com A1B2C3D4E5F6
```

`enroll` sends the code to `POST /api/enroll` on the console and writes the
returned keys to `/etc/dscos/frame.env` (mode 0640, root:kiosk): `FRAME_MODE=instance`,
`SYNC_ENABLED=true`, `SYNC_ENDPOINT`, `INSTANCE_ID`, `SYNC_TOKEN` (the device
token), `FRAME_ADMIN_SECRET`, and the Clerk publishable key when the console
sends one. The app service sources the file before it builds, so publishable
keys inline correctly. After it writes, `enroll` restarts the app.

Enrollment requires an https console URL. Plain http is accepted only for
loopback development addresses (`localhost`, `127.0.0.1`, `::1`). The response
is schema-checked before anything is written, so a malformed bundle leaves
`frame.env` untouched.

Failures never leave a half-written file. If the console is unreachable or the
code is dead (invalid, expired, or already used), `enroll` exits non-zero and
leaves `frame.env` untouched, with a message that says which it was and how to
issue a fresh one. For an existing instance, click "Reissue code (rotate)" on
the console card and enroll with the new code. Rotating invalidates every older
code for that instance, so use the newest one.

If root cannot resolve or set the kiosk group after a successful write, `enroll`
prints a warning with the `chown` command and exits 0. The bundle is already in
place; fix ownership without issuing another code.

`kiosk password <secret>` sets the frame-local admin password used for
management-port mutations (see "Two ports on a frame"). It writes
`FRAME_ADMIN_SECRET` and the scrypt `FRAME_ADMIN_HASH` together in one atomic
file update. It keeps a valid secret already in `frame.env`, otherwise writes a
valid `FRAME_ADMIN_SECRET` from the environment, otherwise generates one. An
invalid stored secret is replaced with a warning. Passwords shorter than 8
characters are rejected and nothing is written. The app restarts on Linux.

### Two ports on a frame

A frame exposes two HTTP entry points served by the same Next.js process:

| Port | Who reaches it | What it serves |
|---|---|---|
| `localhost:3000` | The frame's own Chromium | Display pages, Clerk-protected as today |
| LAN address `:<mgmtPort>` (default 8808) | Anyone on the frame's network | Display pages, the editor, and frame-local admin APIs |

The app binds `localhost:3000` only. A TCP forwarder (`lib/mgmt-port.ts`)
listens on `KIOSK_MGMT_PORT`, pipes each connection into the local app, and
preserves the TCP source address. Rate limiting treats every management-port
client as one local bucket unless `TRUST_PROXY` is enabled (see the operations
guide). The proxy gates routes by the `Host` header port:

- Requests without the management port in `Host` behave exactly as they did
  before this feature existed.
- On the management port, reads work, but every mutation returns `401` until
  you set a frame-local admin password with `kiosk password`. After that, the
  cookie from `POST /api/admin/login` on that port authorizes mutations.
- The console web UI (`/console`) and console-only APIs (`/api/instances`)
  answer on neither port of a frame. They live on the console deployment.

A request to the frame's own loopback address cannot pass the management-port
gate, so plugging a keyboard into the frame does not grant write access.

The gate is active only when `KIOSK_MGMT_PORT` is set. Console deployments
leave it unset and run Clerk-protected on one port as before.

Invalid `KIOSK_MGMT_PORT` or `PORT` values are logged and start no forwarder;
the display keeps running. If `FRAME_ADMIN_HASH` is set but
`FRAME_ADMIN_SECRET` is missing or invalid, the management surface stays
read-only and login returns 401. Changing mgmtPort requires restarting the app service; the forwarder reads KIOSK_MGMT_PORT at startup.

### Configuration

```text
kiosk config show                 Redacted config as JSON
kiosk config validate             Check values without writing
kiosk config set <key> <value>    Validate before write
kiosk config export               JSON snapshot with secrets redacted
kiosk config restore <file>       Replace config from a JSON file
```

`config set` rejects invalid values before touching the file. Booleans accept
`true`, `1`, or `yes`. Unknown keys are refused, not created.

`config export` replaces every `secrets.*` value with a placeholder, so it is
a snapshot for inspection, not a backup. Restoring an exported file writes
those placeholders over the real secrets. To back up configuration with
secrets, copy `/etc/kiosk/kiosk.conf` itself and store it as you would any
credential.

Keys (dot notation, CLI key = file variable):

| Key | Variable | Type | Default |
|---|---|---|---|
| `frameUrl` | `KIOSK_URL` | http(s)/file URL | `http://localhost:3000/frame/home` |
| `appPort` | `KIOSK_PORT` | integer 1-65535 | `3000` |
| `rotate` | `KIOSK_ROTATE` | `normal` / `left` / `right` / `inverted` | `left` |
| `output` | `KIOSK_OUTPUT` | xrandr name or empty (auto) | empty |
| `mode` | `KIOSK_MODE` | `WxH` or empty | empty |
| `scale` | `KIOSK_SCALE` | number or empty | empty |
| `touch` | `KIOSK_TOUCH` | boolean | `false` |
| `restartHours` | `KIOSK_RESTART_HOURS` | non-negative integer, 0 = never | `24` |
| `timezone` | `KIOSK_TIMEZONE` | IANA name or empty | empty |
| `logLevel` | `KIOSK_LOG_LEVEL` | `error` / `warn` / `info` / `debug` | `info` |
| `netWait` | `KIOSK_NET_WAIT` | seconds to wait for the URL at boot | `60` |
| `displayWait` | `KIOSK_DISPLAY_WAIT` | seconds to wait for the monitor | `30` |
| `extraFlags` | `KIOSK_EXTRA_FLAGS` | extra Chromium flags | empty |
| `updateChannel` | `KIOSK_UPDATE_CHANNEL` | `stable` (reserved) | `stable` |
| `cloudEndpoint` | `KIOSK_CLOUD_ENDPOINT` | sync endpoint URL | empty |
| `syncEnabled` | `KIOSK_SYNC_ENABLED` | boolean | `false` |
| `syncIntervalMinutes` | `KIOSK_SYNC_INTERVAL` | positive integer | `15` |
| `mgmtPort` | `KIOSK_MGMT_PORT` | integer 1-65535 | `8808` |
| `standby.enabled` | `KIOSK_STANDBY_ENABLED` | boolean | `true` |
| `standby.start` | `KIOSK_STANDBY_START` | `HH:MM` (24h) | `22:00` |
| `standby.end` | `KIOSK_STANDBY_END` | `HH:MM` (24h) | `06:00` |
| `standby.mode` | `KIOSK_STANDBY_MODE` | `display` (see below) | `display` |
| `secrets.<name>` | `KIOSK_SECRET_<NAME>` | string, redacted in output | |

The display session re-reads `kiosk.conf` each time the browser restarts.
Browser-side keys (`frameUrl`, `rotate`, `output`, `mode`, `scale`, `touch`)
take effect on the next browser cycle, which happens after `restartHours` or
immediately with `sudo kiosk-ctl restart`. `kiosk app restart` manages the
application service, not the browser. Note that the service's listening port
comes from the systemd unit (`Environment=PORT=3000`), not from
`kiosk.conf`: `appPort` sets which port `kiosk app health` probes. To move
the application itself, edit the unit (`sudo systemctl edit dscos`, set
`Environment=PORT=...`), run `sudo systemctl daemon-reload` and
`kiosk app restart`, then set `appPort` to the same value so health checks
agree. Finally update `frameUrl` to the new address and restart the browser
(`sudo kiosk-ctl restart`), or the frame keeps opening the old port and
shows a connection error while the service runs fine.

### Overnight standby

```text
kiosk standby status                    In-window? Next transition time
kiosk standby enable | disable
kiosk standby schedule                  Current window
kiosk standby schedule set <a> <b>      HH:MM HH:MM, may cross midnight
```

Standby is implemented with two systemd timers that turn the display off
(DPMS) at the start time and on at the end time. Timers are persistent, so a
frame that was off across the scheduled time catches up on boot, and the
schedule survives reboots. The device itself stays running and reachable for
recovery. `standby.mode` defaults to `display`; the other modes
(`app`, `shutdown`) are config-level reservations and are not wired to
behavior yet.

### Cloud sync

```text
kiosk sync status                              Enabled, endpoint (redacted), interval
kiosk sync configure --endpoint URL [--interval N] [--enable|--disable]
kiosk sync now                                 Reachability probe against the endpoint
```

`sync configure` validates the endpoint URL and interval before writing to
`kiosk.conf`. `sync now` is a reachability probe (HTTP request, 10 s timeout;
2xx/3xx counts as OK). The running sync engine lives in the application
(`lib/sync/worker.ts`) and is configured through environment variables
instead: `SYNC_ENABLED`, `SYNC_ENDPOINT`, `SYNC_TOKEN`, `INSTANCE_ID`, and
`SYNC_INTERVAL_MINUTES`. It starts when the frame boots in instance mode with
those values set. The CLI's sync settings are the device-side record plus the
probe; they are not yet wired to the service's environment.

### Updates

```text
kiosk update check                       Channel and version report
kiosk update apply [--version V]         Not yet supported
kiosk update rollback                    Not yet supported
```

Version comparison logic exists (`lib/kiosk/updates.ts`), but no update
server is wired up, so `apply` and `rollback` exit with an explicit
"not supported" error. Today's upgrade path is the source refresh described
in "Choosing the installed version". The design intent is that a failed
update never destroys the last known good version.

### Device

```text
kiosk device info                       OS, arch, hostname
kiosk device restart                    Requires --yes
kiosk device shutdown                   Requires --yes
```

The `--yes` guard prevents accidental shutdown/restart from a stray terminal
command on a machine that may have no keyboard attached.

## Low-level session helper: `kiosk-ctl`

`kiosk uninstall` currently acknowledges the request and exits; it does not
yet remove services. To take a frame back manually: stop and disable
`dscos.service`, the two standby timer units, `lightdm`, delete
`/etc/kiosk`, `/usr/local/bin/kiosk`, `/usr/local/bin/kiosk-ctl`,
`/usr/local/lib/kiosk`, `/etc/chromium/policies/managed/kiosk.json`,
`/opt/dscos`, and the `kiosk` user.

For browser-session problems that the `kiosk` CLI does not cover:

```text
sudo kiosk-ctl status             lightdm + chromium state, connected displays
sudo kiosk-ctl logs               Session journal + Chromium log tails
sudo kiosk-ctl restart            Kill the browser; the session restarts it and re-reads config
sudo kiosk-ctl restart-session    Restart lightdm (full session cycle)
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Picture is upside down | Portrait rotation picked the wrong direction. `kiosk config set rotate right` (or `left`) and let the browser restart |
| Screen stays black at boot | Monitor reports late over DisplayPort. The session waits up to `displayWait` seconds and re-checks; raise `kiosk config set displayWait 60` if needed |
| Frame shows "site can't be reached" | The app URL did not answer within `netWait`. Check `kiosk app health`, then `kiosk app logs`; raise `netWait` for slow boots |
| HTTPS pages fail with certificate errors | Clock drift (dead RTC battery). `systemd-timesyncd` is enabled; the session waits for NTP before launching. Check `timedatectl` |
| Browser flapping after a power cut | The session clears Chromium's "restore pages" state; if it persists, `sudo kiosk-ctl restart-session` |
| One-liner prints HTML or bash syntax errors | The URL served GitHub's page, not the file. Use the `raw.githubusercontent.com` form |
| One-liner download 404s | Bad `KIOSK_REF`, or the change is not on `main` yet |
| Re-run did not update the app | Existing `/opt/dscos` is reused by design. `sudo rm -rf /opt/dscos` and re-run with the desired `KIOSK_REF` |
| `KIOSK_REF=v0.8 sudo bash` had no effect | env_reset stripped it. Use `sudo KIOSK_REF=v0.8 bash` |
| Wrapper says target "has no package.json or install-kiosk.sh" | A previous partial tree. Remove `/opt/dscos` and re-run |
| Need to preview without touching a machine | `bash install-kiosk.sh -n` from a checkout (no root needed) |
| `doctor` reports config invalid | Fix the named field; `config validate` prints `field: message` pairs without writing |

Where to look for logs: `kiosk app logs` (application), `sudo kiosk-ctl logs`
(browser session), `journalctl -u dscos -f` (service), `/var/log/kiosk-install.log`
(installer).

## Security notes

- The browser runs as `kiosk` (no sudo, no password). A compromised page
  cannot reconfigure the system, and the Chromium policy blocks extensions,
  downloads, devtools, and internal pages.
- `/etc/kiosk/kiosk.conf` is root-owned at mode 0644 because the kiosk
  user's browser session reads it at runtime. That means `KIOSK_SECRET_*`
  values in the file are readable by any local user ID on the device; the
  kiosk user has no sudo, and physical and LAN access are the real
  perimeter. CLI output and logs redact secrets.
- The install one-liner trusts the HTTPS/TLS channel to GitHub. Pin
  `KIOSK_REF` to a tag for reproducible deployments.
- The device stays reachable over the network during standby so operators can
  recover it; plan LAN exposure accordingly.
