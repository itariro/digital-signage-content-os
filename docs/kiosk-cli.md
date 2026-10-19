# Kiosk CLI Management System

The digital frame is managed through the `kiosk` CLI. `install-kiosk.sh` remains the bootstrap entry point.

## Default frame URL

The frame uses the locally hosted application:

```
http://localhost:3000/frame/home
```

## Installation

```bash
sudo bash install-kiosk.sh
```

Optional overrides:

```bash
sudo bash install-kiosk.sh --rotate right --tz Australia/Melbourne --yes
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
