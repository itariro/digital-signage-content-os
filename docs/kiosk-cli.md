# Kiosk CLI Management System

The digital frame is managed through the `kiosk` CLI. `install-kiosk.sh` remains the bootstrap entry point.

## Default frame URL

The frame uses the locally hosted application:

```
http://localhost:3000/frame/home
```

## Installation

One command on a fresh Debian 12/13 machine:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
```

The raw URL serves `install.sh` from `main`, so the one-liner needs this change merged first.

`install.sh` downloads the app source into `/opt/dscos` and runs
`install-kiosk.sh`. Pass installer options after `-s --`:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash -s -- --rotate right --tz Australia/Melbourne --yes
```

A dry run through the wrapper still needs sudo because the wrapper places files before handing off. For a no-root preview, download `install-kiosk.sh` and run `bash install-kiosk.sh -n` directly.

Pin a branch or tag by setting `KIOSK_REF` on `sudo`, between `sudo` and `bash`.
Setting it before `sudo` does not work, because `sudo` strips the variable:

```bash
curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo KIOSK_REF=v1.0 bash
```

Re-running reuses `/opt/dscos`. To refresh the source, delete that directory and
re-run; `KIOSK_REF` selects the ref only when the source is downloaded fresh.

From an existing checkout, run the installer directly:

```bash
sudo bash install-kiosk.sh
```

## Commands

```text
kiosk help
kiosk status
kiosk doctor
kiosk config show
kiosk config validate
kiosk config set <key> <value>
kiosk app start|stop|restart|health|logs
kiosk device info|restart|shutdown
kiosk standby status|enable|disable
kiosk standby schedule
kiosk standby schedule set <start> <end>
kiosk update check|apply|rollback
kiosk sync status|now|configure
kiosk uninstall
```

## Overnight standby

Default schedule is 22:00-06:00 in the device local timezone. The schedule crosses midnight and is implemented with systemd timers, so it survives reboots and application restarts. Display standby turns off the display (DPMS) while keeping the device available for recovery.

## Configuration

Configuration is stored in `/etc/kiosk/kiosk.conf`. Secrets are redacted from `config show` and logs. Use `kiosk config validate` before applying changes.

## Recovery

- Failed updates preserve the last known good version.
- `kiosk doctor` reports configuration and health issues.
- `kiosk app health` checks process, port, HTTP, and config.
