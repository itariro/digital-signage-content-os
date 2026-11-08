#!/usr/bin/env bash
#
# install-kiosk.sh - Digital Signage Kiosk Installer for Debian
#
# Target : Debian 12/13 on small x86 thin clients (e.g. Dell Wyse 3040:
#          2 GB RAM, 8 GB eMMC). Portrait displays are first-class.
# Usage  : sudo bash install-kiosk.sh [options] https://dashboard.example.com
#            or without a checkout:
#            curl -fsSL https://raw.githubusercontent.com/itariro/digital-signage-content-os/main/install.sh | sudo bash
#
# Display options:
#   -r, --rotate DIR       normal | left | right | inverted  (default: left)
#                          'left' = portrait, top of the screen towards the left.
#                          If the picture is upside down, use 'right'.
#   -o, --output NAME      xrandr output, e.g. DP-1 (default: first connected)
#   -m, --mode WxH         force a resolution (default: monitor's preferred mode)
#       --scale FACTOR     Surf has no scale factor (kept for compatibility; ignored)
#       --touch            rotate touchscreen input to match the display
#       --console-url URL  console base URL for frame enrollment
#       --enroll-code CODE one-time enrollment code (pulls per-frame keys)
#
# System options:
#       --tz ZONE          set the system timezone, e.g. Australia/Melbourne
#       --restart-hours N  restart the browser every N hours (default 24, 0 = never)
#       --no-zram          do not configure compressed-RAM swap
#
# Installer options:
#   -y, --yes              do not ask for confirmation, do not offer a reboot
#       --reboot           reboot automatically when finished
#   -n, --dry-run          preview the installer UI; changes nothing, needs no root
#       --plain            no colours, spinners or screen clearing (auto in pipes)
#       --fast             no pacing delays between steps
#       --update-runtime   ensure Node >=24, refresh installed helpers and unit files only
#       --runtime-files    print the files that --update-runtime replaces
#       --build-cli        rebuild only the compiled management CLI
#   -h, --help             show this help
#
# After installation, settings live in /etc/kiosk/kiosk.conf; change them and
# run `sudo kiosk-ctl restart` (no reboot needed). Re-running this installer
# overwrites that file.
#
set -Eeuo pipefail
umask 022

readonly INSTALLER_VERSION="2.3"
readonly KIOSK_USER="kiosk"
readonly KIOSK_GROUP="kiosk"
readonly KIOSK_HOME="/home/${KIOSK_USER}"
readonly CONF_DIR="/etc/kiosk"
readonly CONFIG_FILE="${CONF_DIR}/kiosk.conf"
readonly LIB_DIR="/usr/local/lib/kiosk"
readonly DEFAULT_LOG="/var/log/kiosk-install.log"
readonly MIN_FREE_KB=1500000
readonly MIN_RAM_KB=1000000

# Files replaced by --update-runtime. Keep in sync with t_install_cli,
# t_write_session, t_write_ctl, t_xinit, t_getty, t_write_app_service,
# t_write_update_timer and t_write_standby_scripts.
RUNTIME_FILES=(
    /usr/local/bin/kiosk
    "${LIB_DIR}/session.sh"
    /usr/local/bin/kiosk-ctl
    /usr/local/bin/kiosk-xinit
    /etc/systemd/system/getty@tty1.service.d/override.conf
    /etc/systemd/system/dscos.service
    /etc/systemd/system/kiosk-update.service
    /etc/systemd/system/kiosk-update.timer
    /usr/local/bin/kiosk-standby-on
    /usr/local/bin/kiosk-standby-off
)

# UI state (defaults keep die()/usage() usable before the UI is initialised)
UI_LIVE=0; USE_COLOR=0; C_MODE=none; UTF8=0; FANCY=0
COLS=80; WRAP=70; BAR_W=26
RST=""; BOLD=""; ACCENT=""; OKC=""; WARNC=""; ERRC=""; MUTED=""
G_FULL="#"; G_EMPTY="-"; G_OK="+"; G_FAIL="x"; G_DOT="*"; G_VBAR="|"; G_HR="-"; G_SEP="-"
SPIN=('|' '/' '-' "\\")
BAR_COL=()
SPIN_PID=""; STATE_DIR=""; LOG=""
STEP_IDX=0; STEP_TOTAL=11; TASK_DONE=0; TASK_TOTAL=1
PACE_MS=300

readonly STEP_TITLES=(
    "Checking this system"
    "Refreshing package lists"
    "Installing software"
    "Creating the kiosk account"
    "Installing the kiosk runtime"
    "Configuring display and auto-login"
    "Locking down the browser"
    "Tuning the system"
    "Installing management CLI and application"
    "Configuring overnight standby"
    "Finishing up"
)

die() {
    if (( UI_LIVE )); then printf '\r\033[K' >&2; fi
    printf '%sERROR:%s %s\n' "$ERRC" "$RST" "$*" >&2
    exit 1
}
on_err() { die "unexpected failure at line $1: $2 (log: ${LOG:-none})"; }
arm_err_trap() { trap 'on_err "$LINENO" "$BASH_COMMAND"' ERR; }
arm_err_trap

usage() {
    sed -n '2,/^set -E/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

# ==========================================================================
# Arguments
# ==========================================================================
URL=""
CONSOLE_URL=""
ENROLL_CODE=""
ROTATE="left"
OUTPUT=""
MODE=""
SCALE=""
TOUCH=0
TZ_NAME=""
RESTART_HOURS=24
ZRAM=1
YES=0
REBOOT=0
DRY=0
PLAIN=0
UPDATE_RUNTIME=0
PRINT_RUNTIME_FILES=0
BUILD_CLI=0

while (($#)); do
    case "$1" in
        -r|--rotate)        [[ $# -ge 2 ]] || die "$1 requires a value"; ROTATE=$2; shift 2 ;;
        -o|--output)        [[ $# -ge 2 ]] || die "$1 requires a value"; OUTPUT=$2; shift 2 ;;
        -m|--mode)          [[ $# -ge 2 ]] || die "$1 requires a value"; MODE=$2; shift 2 ;;
        --scale)            [[ $# -ge 2 ]] || die "$1 requires a value"; SCALE=$2; shift 2 ;;
        --console-url)      [[ $# -ge 2 ]] || die "$1 requires a value"; CONSOLE_URL=$2; shift 2 ;;
        --enroll-code)      [[ $# -ge 2 ]] || die "$1 requires a value"; ENROLL_CODE=$2; shift 2 ;;
        --tz)               [[ $# -ge 2 ]] || die "$1 requires a value"; TZ_NAME=$2; shift 2 ;;
        --restart-hours)    [[ $# -ge 2 ]] || die "$1 requires a value"; RESTART_HOURS=$2; shift 2 ;;
        --touch)            TOUCH=1; shift ;;
        --no-zram)          ZRAM=0; shift ;;
        -y|--yes)           YES=1; shift ;;
        --reboot)           REBOOT=1; shift ;;
        -n|--dry-run)       DRY=1; shift ;;
        --plain)            PLAIN=1; shift ;;
        --fast)             PACE_MS=0; shift ;;
        --update-runtime)   UPDATE_RUNTIME=1; shift ;;
        --runtime-files)    PRINT_RUNTIME_FILES=1; shift ;;
        --build-cli)        BUILD_CLI=1; shift ;;
        -h|--help)          usage; exit 0 ;;
        -*)                 die "unknown option: $1 (see --help)" ;;
        *)                  [[ -z $URL ]] || die "unexpected extra argument: $1"; URL=$1; shift ;;
    esac
done

if (( PRINT_RUNTIME_FILES )); then
    printf '%s\n' "${RUNTIME_FILES[@]}"
    exit 0
fi

url_re='^(https?://|file:///)[^[:space:]]+$'
if [[ -z $URL ]]; then URL='http://127.0.0.1:3000/frame/home'; fi
[[ $URL =~ $url_re ]] || die "URL must start with http://, https:// or file:/// and contain no whitespace"
[[ $URL != *"'"* ]]   || die "URL must not contain a single quote (percent-encode it as %27)"
if [[ -n $CONSOLE_URL ]]; then
    [[ $CONSOLE_URL =~ $url_re ]] || die "console URL must start with http://, https:// or file:/// and contain no whitespace"
    [[ $CONSOLE_URL != *"'"* ]]   || die "console URL must not contain a single quote (percent-encode it as %27)"
fi
[[ $ROTATE =~ ^(normal|left|right|inverted)$ ]] || die "--rotate must be normal, left, right or inverted"
[[ -z $OUTPUT ]] || [[ $OUTPUT =~ ^[A-Za-z0-9._-]+$ ]] || die "--output has an invalid name"
[[ -z $MODE ]]   || [[ $MODE =~ ^[0-9]+x[0-9]+$ ]]      || die "--mode must look like 1440x2560"
[[ -z $SCALE ]]  || [[ $SCALE =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "--scale must be a number"
[[ $RESTART_HOURS =~ ^[0-9]+$ ]] || die "--restart-hours must be a whole number"
[[ -z $TZ_NAME ]] || [[ $TZ_NAME =~ ^[A-Za-z0-9_+/-]+$ ]] || die "--tz has an invalid name"

if (( ! DRY )); then
    [[ $EUID -eq 0 ]] || die "run as root: sudo bash $0 ${URL}"
    [[ -z $TZ_NAME ]] || [[ -f /usr/share/zoneinfo/$TZ_NAME ]] || die "unknown timezone: $TZ_NAME"
fi
if (( UPDATE_RUNTIME && DRY )); then
    die "--update-runtime cannot be combined with --dry-run"
fi
if (( BUILD_CLI && DRY )); then
    die "--build-cli cannot be combined with --dry-run"
fi

# ==========================================================================
# UI layer: colours, glyphs, logo, bars
# ==========================================================================
ui_init() {
    local nc

    COLS=$(tput cols 2>/dev/null || echo 80)
    [[ $COLS =~ ^[0-9]+$ ]] || COLS=80
    if (( COLS < 40 )); then COLS=40; fi
    WRAP=$((COLS - 8))
    if (( WRAP > 72 )); then WRAP=72; fi
    BAR_W=$((COLS - 34))
    if (( BAR_W > 28 )); then BAR_W=28; fi
    if (( BAR_W < 10 )); then BAR_W=10; fi

    if [[ -t 1 && ${TERM:-dumb} != dumb ]] && (( ! PLAIN )); then
        UI_LIVE=1
        if [[ -z ${NO_COLOR:-} ]]; then
            USE_COLOR=1
            nc=$(tput colors 2>/dev/null || echo 8)
            if [[ ${COLORTERM:-} == *truecolor* || ${COLORTERM:-} == *24bit* ]]; then
                C_MODE=true
            elif (( nc >= 256 )); then
                C_MODE=256
            else
                C_MODE=16
            fi
        fi
    fi

    case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
        *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) UTF8=1 ;;
    esac
    if (( UTF8 )) && [[ ${TERM:-} != linux ]]; then FANCY=1; fi

    # Glyph sets: fancy terminals get braille/check marks; the Linux console and
    # non-UTF-8 sessions get glyphs that exist in the basic console fonts.
    if (( FANCY )); then
        G_FULL='█'; G_EMPTY='░'; G_OK='✓'; G_FAIL='✗'; G_DOT='•'; G_VBAR='│'; G_HR='─'; G_SEP='·'
        SPIN=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    elif (( UTF8 )); then
        G_FULL='█'; G_EMPTY='░'; G_OK='+'; G_FAIL='x'; G_DOT='*'; G_VBAR='│'; G_HR='─'; G_SEP='-'
        SPIN=('|' '/' '-' "\\")
    fi

    if (( USE_COLOR )); then
        RST=$'\e[0m'; BOLD=$'\e[1m'
        if [[ $C_MODE == 16 ]]; then
            ACCENT=$'\e[36m'; OKC=$'\e[32m'
            WARNC=$'\e[33m';  ERRC=$'\e[31m';    MUTED=$'\e[2m'
        else
            ACCENT=$'\e[38;5;80m'; OKC=$'\e[38;5;78m'
            WARNC=$'\e[38;5;215m';  ERRC=$'\e[38;5;203m';    MUTED=$'\e[38;5;245m'
        fi
    fi

    # Pre-compute the gradient used by progress bars.
    local i
    for ((i = 0; i < BAR_W; i++)); do
        grad_esc $((i * 1000 / (BAR_W - 1)))
        BAR_COL[i]=$REPLY
    done
}

# grad_esc T  (T = 0..1000)  ->  REPLY = colour escape on a teal > blue > violet ramp
grad_esc() {
    local t=$1 r g b
    case $C_MODE in
        true|256)
            if (( t < 500 )); then
                r=$((60 * t / 500)); g=$((229 - 89 * t / 500)); b=$((200 + 55 * t / 500))
            else
                t=$((t - 500))
                r=$((60 + 120 * t / 500)); g=$((140 - 50 * t / 500)); b=255
            fi
            if [[ $C_MODE == true ]]; then
                REPLY=$'\e[38;2;'"${r};${g};${b}m"
            else
                REPLY=$'\e[38;5;'"$((16 + 36 * ((r * 5 + 127) / 255) + 6 * ((g * 5 + 127) / 255) + (b * 5 + 127) / 255))m"
            fi
            ;;
        16)
            if (( t < 340 )); then REPLY=$'\e[36m'
            elif (( t < 670 )); then REPLY=$'\e[34m'
            else REPLY=$'\e[35m'; fi
            ;;
        *) REPLY="" ;;
    esac
}

# render_bar PCT -> REPLY (a BAR_W-wide gradient bar)
render_bar() {
    local pct=$1 filled i s=""
    if (( pct < 0 )); then pct=0; fi
    if (( pct > 100 )); then pct=100; fi
    filled=$((pct * BAR_W / 100))
    for ((i = 0; i < BAR_W; i++)); do
        if (( i < filled )); then
            s+="${BAR_COL[i]:-}${G_FULL}"
        else
            s+="${MUTED}${G_EMPTY}"
        fi
    done
    REPLY="${s}${RST}"
}

# rule N -> REPLY (N horizontal-rule glyphs)
rule() {
    local s
    printf -v s '%*s' "$1" ''
    REPLY=${s// /$G_HR}
}

gradient_rule() {   # gradient_rule WIDTH -> REPLY
    local w=$1 i s=""
    for ((i = 0; i < w; i++)); do
        grad_esc $((i * 1000 / (w - 1)))
        s+="${REPLY}${G_HR}"
    done
    REPLY="${s}${RST}"
}

pause() {   # brief pacing so animated output is readable
    if (( UI_LIVE && PACE_MS > 0 )); then sleep "0.$(printf '%03d' "$1")"; fi
}

LOGO=(
"██╗  ██╗██╗ ██████╗ ███████╗██╗  ██╗"
"██║ ██╔╝██║██╔═══██╗██╔════╝██║ ██╔╝"
"█████╔╝ ██║██║   ██║███████╗█████╔╝ "
"██╔═██╗ ██║██║   ██║╚════██║██╔═██╗ "
"██║  ██╗██║╚██████╔╝███████║██║  ██╗"
"╚═╝  ╚═╝╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝"
)

print_logo() {
    local row line i w ch
    for row in "${LOGO[@]}"; do
        line=""
        w=${#row}
        for ((i = 0; i < w; i++)); do
            ch=${row:i:1}
            if [[ $ch == " " ]]; then
                line+=" "
            else
                grad_esc $((i * 1000 / (w - 1)))
                line+="${REPLY}${ch}"
            fi
        done
        printf '  %s%s\n' "$line" "$RST"
        pause 60
    done
}

splash() {
    if (( UI_LIVE )); then printf '\033[2J\033[H'; fi
    printf '\n'
    if (( UTF8 )); then
        print_logo
    else
        printf '  %s%sK I O S K%s\n' "$BOLD" "$ACCENT" "$RST"
    fi
    printf '\n'
    gradient_rule 36
    printf '  %s\n' "$REPLY"
    printf '  %s%sDigital Signage Kiosk Installer%s  %sv%s%s\n' "$BOLD" "$ACCENT" "$RST" "$MUTED" "$INSTALLER_VERSION" "$RST"
    printf '  %sSurf %s Openbox %s Getty %s portrait-ready%s\n\n' "$MUTED" "$G_SEP" "$G_SEP" "$G_SEP" "$RST"
}

info()  { printf '    %s%s%s\n' "$MUTED" "$*" "$RST"; }
warn()  { printf '  %s!%s %s\n' "$WARNC" "$RST" "$*" >&2; }

kv() {   # kv LABEL VALUE  (long values wrap with a hanging indent)
    local line first=1
    while IFS= read -r line; do
        if (( first )); then
            printf '  %s%-10s%s %s\n' "$MUTED" "$1" "$RST" "$line"; first=0
        else
            printf '  %-10s %s\n' "" "$line"
        fi
    done < <(printf '%s\n' "$2" | fold -s -w $((COLS - 14)))
}

next_step() {   # next_step N TEXT
    local line first=1
    while IFS= read -r line; do
        if (( first )); then
            printf '   %s%s%s  %s\n' "$ACCENT" "$1" "$RST" "$line"; first=0
        else
            printf '      %s\n' "$line"
        fi
    done < <(printf '%s\n' "$2" | fold -s -w $((COLS - 8)))
}

explain() {   # explain LINE...  (each argument is wrapped independently)
    local para line
    for para in "$@"; do
        while IFS= read -r line; do
            printf '  %s%s%s %s%s%s\n' "$ACCENT" "$G_VBAR" "$RST" "$MUTED" "$line" "$RST"
        done < <(printf '%s\n' "$para" | fold -s -w "$WRAP")
    done
}

# ==========================================================================
# Step / task engine
# ==========================================================================
cleanup_ui() {
    trap - EXIT
    if [[ -n $SPIN_PID ]]; then kill "$SPIN_PID" 2>/dev/null || true; fi
    if (( UI_LIVE )); then printf '\033[?25h'; fi
    if [[ -n $STATE_DIR ]]; then rm -rf "$STATE_DIR"; fi
}

step() {   # step N_TASKS explainer-paragraph...   (title comes from STEP_TITLES)
    local n=$1 title head fill
    shift
    STEP_IDX=$((STEP_IDX + 1)); TASK_DONE=0; TASK_TOTAL=$n
    title=${STEP_TITLES[STEP_IDX - 1]}
    head="${STEP_IDX}/${STEP_TOTAL}"
    fill=$((COLS - 14 - ${#head} - ${#title}))
    if (( fill < 3 )); then fill=3; fi
    if (( fill > 40 )); then fill=40; fi
    rule "$fill"
    printf '\n  %s%s%s%s %s%s%s %s%s%s %s%s%s%s %s%s%s\n' \
        "$ACCENT" "$G_HR" "$G_HR" "$RST" "$BOLD" "$head" "$RST" "$MUTED" "$G_HR" "$RST" \
        "$BOLD" "$ACCENT" "$title" "$RST" "$MUTED" "$REPLY" "$RST"
    explain "$@"
    printf '\n'
}

step_end() {
    local op=$((STEP_IDX * 100 / STEP_TOTAL)) sb ob
    render_bar 100; sb=$REPLY
    render_bar "$op"; ob=$REPLY
    printf '  %sStep   %s %s100%%%s\n' "$MUTED" "$sb" "$OKC" "$RST"
    printf '  %sOverall%s %s %3d%%\n' "$MUTED" "$RST" "$ob" "$op"
}

spinner_loop() {   # runs in the background while a task executes
    trap - ERR
    set +e
    local f=0 label detail frac pct avail lw rest
    printf '\033[?25l'
    while :; do
        label=""; detail=""; frac=0
        read -r label  <"$STATE_DIR/label"  2>/dev/null
        read -r detail <"$STATE_DIR/detail" 2>/dev/null
        read -r frac   <"$STATE_DIR/frac"   2>/dev/null
        [[ $frac =~ ^[0-9]+$ ]] || frac=0
        pct=$(((TASK_DONE * 100 + frac) / TASK_TOTAL))
        render_bar "$pct"
        avail=$((COLS - BAR_W - 12))
        lw=${#label}
        if (( lw > avail )); then label=${label:0:avail}; lw=$avail; fi
        rest=$((avail - lw - 3))
        if [[ -n $detail ]] && (( rest > 3 )); then detail="${G_SEP} ${detail:0:rest}"; else detail=""; fi
        printf '\r\033[K  %s%s%s %s %3d%%  %s %s%s%s' \
            "$ACCENT" "${SPIN[f % ${#SPIN[@]}]}" "$RST" "$REPLY" "$pct" "$label" "$MUTED" "$detail" "$RST"
        f=$((f + 1))
        sleep 0.1
    done
}

ui_fail() {   # ui_fail LABEL
    printf '  %s%s%s %s\n\n' "$ERRC" "$G_FAIL" "$RST" "$1"
    printf '  %sThe installer stopped. Last lines of %s:%s\n' "$ERRC" "$LOG" "$RST"
    tail -n 15 "$LOG" 2>/dev/null | sed "s/^/    /"
    printf '\n  Fix the problem and run the installer again; it is safe to re-run.\n'
    exit 1
}

# task LABEL CMD [ARGS...]  - run CMD (a command or function) with a live bar.
# CMD runs in a subshell with errexit on; its output goes to the log.
task() {
    local label=$1 rc=0 t0 t1 ms
    shift
    printf '%s' "$label" >"$STATE_DIR/label"
    printf '0' >"$STATE_DIR/frac"
    : >"$STATE_DIR/detail"

    if (( UI_LIVE )); then
        spinner_loop &
        SPIN_PID=$!
    else
        printf '  [%d/%d] %s ... ' "$STEP_IDX" "$STEP_TOTAL" "$label"
    fi

    t0=${EPOCHREALTIME/[.,]/}
    # The ERR trap fires even with errexit off, so disarm it while the task runs;
    # the task's exit status is handled explicitly below.
    trap - ERR
    set +e
    if (( DRY )) && [[ $1 != t_apt_update && $1 != t_apt_install && $1 != t_apt_zram ]]; then
        ( sleep 0.35 ) >>"$LOG" 2>&1     # dry run: simulate; apt tasks simulate their own progress
    else
        ( trap - ERR; set -e; "$@" ) >>"$LOG" 2>&1
    fi
    rc=$?
    set -e
    arm_err_trap

    if (( UI_LIVE )); then
        t1=${EPOCHREALTIME/[.,]/}
        ms=$(((t1 - t0) / 1000))
        if (( rc == 0 && ms < PACE_MS )); then sleep "0.$(printf '%03d' $((PACE_MS - ms)))"; fi
        kill "$SPIN_PID" 2>/dev/null || true
        wait "$SPIN_PID" 2>/dev/null || true
        SPIN_PID=""
        printf '\r\033[K'
    fi

    if (( rc != 0 )); then
        if (( ! UI_LIVE )); then printf 'FAILED\n'; fi
        ui_fail "$label"
    fi
    TASK_DONE=$((TASK_DONE + 1))
    if (( UI_LIVE )); then
        printf '  %s%s%s %s\n' "$OKC" "$G_OK" "$RST" "$label"
    else
        printf 'ok\n'
    fi
}

# apt_run update|install ARGS...  - apt-get with real progress from apt's status fd.
apt_run() {
    local mode=$1 sf="$STATE_DIR/apt.status" pid rc=0 line kind pkg pct frac detail
    : >"$sf"
    if (( DRY )); then
        local i names=(xserver-xorg-core openbox surf curl fonts-dejavu-core systemd-timesyncd)
        for i in $(seq 0 4 100); do
            printf '%s' "$i" >"$STATE_DIR/frac"
            if [[ $mode == update ]]; then detail=""; elif (( i < 40 )); then detail="downloading"; else detail="${names[i * ${#names[@]} / 101]}"; fi
            printf '%s' "$detail" >"$STATE_DIR/detail"
            sleep 0.06
        done
        return 0
    fi

    apt-get -o Acquire::Retries=3 -o APT::Status-Fd=3 "$@" 3>"$sf" &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        line=$(tail -n 1 "$sf" 2>/dev/null || true)
        if [[ -n $line ]]; then
            kind=""; pkg=""; pct=""
            IFS=: read -r kind pkg pct _ <<<"$line"
            pct=${pct%%.*}
            if [[ $pct =~ ^[0-9]+$ ]]; then
                case $kind in
                    dlstatus)
                        if [[ $mode == update ]]; then detail=""; frac=$pct
                        else detail="downloading"; frac=$((pct * 40 / 100)); fi ;;
                    pmstatus)
                        detail=$pkg
                        frac=$((40 + pct * 60 / 100)) ;;
                    *)  detail=""; frac=-1 ;;
                esac
                if (( frac >= 0 )); then
                    printf '%s' "$frac"   >"$STATE_DIR/frac"
                    printf '%s' "$detail" >"$STATE_DIR/detail"
                fi
            fi
        fi
        sleep 0.25
    done
    wait "$pid" || rc=$?
    return "$rc"
}

# ==========================================================================
# Task implementations (each runs in its own subshell with errexit on)
# ==========================================================================
write_file() {   # write_file PATH MODE [OWNER:GROUP] < content   (atomic replace)
    local path=$1 mode=$2 owner=${3:-root:root} tmp
    tmp=$(mktemp "${path}.XXXXXX")
    cat >"$tmp"
    chown "$owner" "$tmp"
    chmod "$mode" "$tmp"
    mv -f "$tmp" "$path"
}

t_check_os() {
    [[ -r /etc/os-release ]] || { echo "cannot identify the operating system" >&2; return 1; }
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "OS: ${PRETTY_NAME:-unknown} (ID=${ID:-?}, VERSION_ID=${VERSION_ID:-?})"
    [[ ${ID:-} == "debian" ]] || { echo "this installer targets Debian (found: ${ID:-unknown})" >&2; return 1; }
    case "${VERSION_ID:-}" in
        12|13) ;;
        *) echo "WARNING: tested on Debian 12/13; found ${VERSION_ID:-unknown}" ;;
    esac
}

t_check_disk() {
    local avail_kb
    avail_kb=$(df --output=avail -k / | tail -n 1 | tr -d ' ')
    echo "free on /: ${avail_kb} kB"
    (( avail_kb >= MIN_FREE_KB )) || {
        echo "need at least $((MIN_FREE_KB / 1000)) MB free on / (have $((avail_kb / 1000)) MB)" >&2
        return 1
    }
}

t_check_hw() {
    local ram_kb
    ram_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    echo "RAM: ${ram_kb} kB"
    (( ram_kb >= MIN_RAM_KB )) || { echo "need at least 1 GB of RAM to run a browser" >&2; return 1; }
}

t_preseed() {
    # Getty autologin replaces any display manager: do not preseed a default
    # display-manager selection. No-op kept so existing task lines don't break.
    true
}

t_apt_update()  { apt_run update; }
t_apt_install() {
    apt_run install -y --no-install-recommends "${PACKAGES[@]}"
    # Purge stale kernels; never touch the running one (uname -r).
    local current
    current=$(uname -r)
    dpkg -l 'linux-image-*' | awk '/^ii/{print $2}' | grep -E '^linux-image-[0-9]' | grep -Fvx "linux-image-${current}" | xargs -r apt-get purge -y || true
}
t_apt_zram()    { apt_run install -y --no-install-recommends systemd-zram-generator; }

t_verify_cmds() {
    local cmd
    for cmd in surf openbox xrandr xset xprop curl; do
        command -v "$cmd" >/dev/null 2>&1 || { echo "'$cmd' is missing after installation" >&2; return 1; }
    done
}

t_create_user() {
    local g extra=() groups_csv
    getent group "$KIOSK_GROUP" >/dev/null || groupadd "$KIOSK_GROUP"
    for g in video render audio; do
        if getent group "$g" >/dev/null; then extra+=("$g"); fi
    done
    groups_csv=$(IFS=,; echo "${extra[*]}")
    if id "$KIOSK_USER" >/dev/null 2>&1; then
        echo "user exists; keeping account, refreshing groups"
        if [[ -n $groups_csv ]]; then usermod -aG "$groups_csv" "$KIOSK_USER"; fi
    else
        if [[ -n $groups_csv ]]; then
            useradd --create-home --home-dir "$KIOSK_HOME" --shell /bin/bash \
                    --gid "$KIOSK_GROUP" --groups "$groups_csv" "$KIOSK_USER"
        else
            useradd --create-home --home-dir "$KIOSK_HOME" --shell /bin/bash \
                    --gid "$KIOSK_GROUP" "$KIOSK_USER"
        fi
    fi
}

t_prep_dirs() {
    chown "$KIOSK_USER:$KIOSK_GROUP" "$KIOSK_HOME"
    chmod 0750 "$KIOSK_HOME"
    install -d -o "$KIOSK_USER" -g "$KIOSK_GROUP" -m 0755 "$KIOSK_HOME/.config"
    install -d -o "$KIOSK_USER" -g "$KIOSK_GROUP" -m 0700 "$KIOSK_HOME/.local/share/surf"
    install -d -o root -g root -m 0755 "$CONF_DIR" "$LIB_DIR"
    # Debian resolves 'localhost' to ::1 first, but the app binds 127.0.0.1 only.
    # Drop 'localhost' from the ::1 line so localhost -> 127.0.0.1 (IPv4) only.
    if [[ -f /etc/hosts ]]; then
        sed -i -E '/^::1[[:space:]]/s/[[:space:]]+localhost([[:space:]]+|$)/\1/g' /etc/hosts \
            || echo "warning: could not update /etc/hosts; continuing" >&2
    fi
}

t_write_conf() {
    write_file "$CONFIG_FILE" 0644 <<EOF
# Kiosk settings - edit, then run: sudo kiosk-ctl restart
KIOSK_URL='${URL}'

# Display: normal | left | right | inverted. 'left' and 'right' give portrait.
KIOSK_ROTATE='${ROTATE}'
# xrandr output name (empty = first connected output). See: kiosk-ctl status
KIOSK_OUTPUT='${OUTPUT}'
# Force a mode such as 1440x2560 (empty = monitor's preferred mode)
KIOSK_MODE='${MODE}'
# Device scale factor; kept for CLI compat, ignored by Surf (no scale concept)
KIOSK_SCALE='${SCALE}'
# 1 = rotate touchscreen input to match the display
KIOSK_TOUCH=${TOUCH}

# Restart the browser every N hours to contain memory growth (0 = never)
KIOSK_RESTART_HOURS=${RESTART_HOURS}
# Seconds to wait for the network / for the monitor to appear at start-up
KIOSK_NET_WAIT=60
KIOSK_DISPLAY_WAIT=30
# Extra browser flags; kept for CLI compat, ignored by Surf
KIOSK_EXTRA_FLAGS=''
# Standby schedule (overnight display standby)
KIOSK_STANDBY_ENABLED=1
KIOSK_STANDBY_START='22:00'
KIOSK_STANDBY_END='06:00'
KIOSK_STANDBY_MODE='display'
KIOSK_PORT=3000
KIOSK_MGMT_PORT=8808
EOF
}

t_write_session() {
    write_file "$LIB_DIR/session.sh" 0755 <<'SESSION_EOF'
#!/bin/bash
# Kiosk session. Runs as the kiosk user inside the X session started from getty.
# If this script ever exits, the getty login ends and the screen goes dark
# until the next getty autologin.
set -u

export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_FORCE_SANDBOX=0
export DISPLAY=:0
export XAUTHORITY=/home/kiosk/.Xauthority

CONFIG_FILE=/etc/kiosk/kiosk.conf
RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u 2>/dev/null || echo 0)}
mkdir -p "$RUNTIME_DIR" 2>/dev/null || RUNTIME_DIR=/tmp
SURF_LOG="${RUNTIME_DIR}/kiosk-surf.log"
CACHE_DIR="${RUNTIME_DIR}/kiosk-surf-cache"   # tmpfs: spares the eMMC
export XDG_CACHE_HOME="$CACHE_DIR"
WM_PID=""
BROWSER_PID=""

log() {
    logger -t kiosk -- "$*" 2>/dev/null || true
    printf '%s kiosk: %s\n' "$(date '+%F %T')" "$*" >&2
}

load_config() {
    KIOSK_URL=""; KIOSK_ROTATE="left"; KIOSK_OUTPUT=""; KIOSK_MODE=""
    KIOSK_SCALE=""; KIOSK_TOUCH=0; KIOSK_RESTART_HOURS=24
    KIOSK_NET_WAIT=60; KIOSK_DISPLAY_WAIT=30; KIOSK_EXTRA_FLAGS=""
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
    # Debian resolves 'localhost' to ::1 first, but the app binds 127.0.0.1 only,
    # so Surf would see "connection refused". Normalize to the IPv4 loopback.
    # Only normalize a plain-http URL whose host is exactly 'localhost'
    # (avoid breaking https certificate verification or other hostnames).
    case "$KIOSK_URL" in
        http://localhost|http://localhost:*|http://localhost/*|http://localhost\?*|http://localhost#*)
            KIOSK_URL="http://127.0.0.1${KIOSK_URL#http://localhost}"
            ;;
    esac

}

# ---- display ---------------------------------------------------------------

find_output() {
    if [[ -n $KIOSK_OUTPUT ]]; then
        xrandr --query | awk -v o="$KIOSK_OUTPUT" '$1==o && $2=="connected" {print $1; exit}'
    else
        xrandr --query | awk '$2=="connected" {print $1; exit}'
    fi
}

# Prints normal|left|right|inverted, or "inactive" if the output has no mode set.
# Parsing stops at the "(normal left inverted right ...)" capability list.
current_rotation() {
    xrandr --query | awk -v o="$1" '
        $1==o && $2=="connected" {
            geom=0; rot="normal"
            for (i=3; i<=NF; i++) {
                if ($i ~ /^\(/) break
                if ($i ~ /^[0-9]+x[0-9]+\+[0-9]+\+[0-9]+$/) geom=1
                if ($i=="left" || $i=="right" || $i=="inverted") rot=$i
            }
            print (geom ? rot : "inactive"); exit
        }'
}

apply_display() {
    local out=$1
    local args=(--output "$out" --primary --pos 0x0 --rotate "$KIOSK_ROTATE")
    if [[ -n $KIOSK_MODE ]]; then
        args+=(--mode "$KIOSK_MODE")
    else
        args+=(--auto)
    fi
    xrandr "${args[@]}"
}

apply_touch() {
    [[ $KIOSK_TOUCH == 1 ]] || return 0
    command -v xinput >/dev/null 2>&1 || return 0
    local m id
    case $KIOSK_ROTATE in
        left)     m="0 -1 1 1 0 0 0 0 1" ;;
        right)    m="0 1 0 -1 0 1 0 0 1" ;;
        inverted) m="-1 0 1 0 -1 1 0 0 1" ;;
        *)        m="1 0 0 0 1 0 0 0 1" ;;
    esac
    while read -r id; do
        # shellcheck disable=SC2086
        xinput set-prop "$id" "Coordinate Transformation Matrix" $m 2>/dev/null
    done < <(xinput list 2>/dev/null | sed -n 's/.*[Tt]ouch.*id=\([0-9][0-9]*\).*/\1/p')
}

# ensure_display SECONDS - make the monitor appear and match KIOSK_ROTATE.
# DisplayPort monitors often report "connected" late at boot, so retry for up
# to SECONDS (0 = single attempt). Idempotent; cheap when nothing is wrong.
ensure_display() {
    local deadline=$((SECONDS + ${1:-0})) out cur
    while :; do
        out=$(find_output)
        if [[ -n $out ]]; then
            cur=$(current_rotation "$out")
            [[ $cur == "$KIOSK_ROTATE" ]] && return 0
            log "display ${out}: rotation '${cur}' -> '${KIOSK_ROTATE}'"
            if apply_display "$out"; then
                sleep 1
                cur=$(current_rotation "$out")
                if [[ $cur == "$KIOSK_ROTATE" ]]; then
                    apply_touch
                    return 0
                fi
            fi
        fi
        (( SECONDS >= deadline )) && break
        sleep 1
    done
    log "WARNING: could not set rotation '${KIOSK_ROTATE}' (output: '${out:-none found}')"
    return 1
}

# ---- start-up gates --------------------------------------------------------

wait_for_wm() {
    for _ in $(seq 1 20); do
        xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && return 0
        sleep 0.5
    done
    return 1
}

wait_for_clock() {   # HTTPS fails with a wrong clock (dead RTC battery)
    command -v timedatectl >/dev/null 2>&1 || return 0
    for _ in $(seq 1 10); do
        [[ $(timedatectl show -p NTPSynchronized --value 2>/dev/null) == yes ]] && return 0
        sleep 2
    done
    log "WARNING: clock not NTP-synchronised yet; HTTPS pages may fail until it is"
}

wait_for_network() {
    [[ $KIOSK_URL == http* ]] || return 0
    local deadline=$((SECONDS + KIOSK_NET_WAIT)) code
    while (( SECONDS < deadline )); do
        code=$(curl -ksS -L -o /dev/null --max-time 5 -w '%{http_code}' "$KIOSK_URL" 2>/dev/null || true)
        [[ -n $code && $code != 000 ]] && return 0
        sleep 3
    done
    log "WARNING: ${KIOSK_URL} unreachable after ${KIOSK_NET_WAIT}s; starting browser anyway"
}

# ---- browser ---------------------------------------------------------------

prepare_profile() {
    # Surf keeps everything in tmpfs cache; no profile to repair after a crash.
    mkdir -p "$CACHE_DIR"
}

launch_browser() {
    local limit=()
    if (( KIOSK_RESTART_HOURS > 0 )); then
        limit=(timeout -k 15 "$((KIOSK_RESTART_HOURS * 3600))")
    fi

    : >"$SURF_LOG"
    "${limit[@]}" /usr/bin/surf -F "$KIOSK_URL" >>"$SURF_LOG" 2>&1 &
    BROWSER_PID=$!
}

cleanup() {
    trap - EXIT
    [[ -n $BROWSER_PID ]] && kill "$BROWSER_PID" 2>/dev/null
    [[ -n $WM_PID ]] && kill "$WM_PID" 2>/dev/null
    return 0
}

main() {
    load_config
    if [[ -z $KIOSK_URL ]]; then
        log "ERROR: KIOSK_URL is empty in ${CONFIG_FILE}"
        sleep 30
        exit 1
    fi

    trap cleanup EXIT
    trap 'exit 0' TERM INT HUP

    xset s off
    xset s noblank
    xset -dpms
    xsetroot -solid black

    openbox &
    WM_PID=$!
    wait_for_wm || log "WARNING: window manager did not announce itself"

    local fails=0 started up rc delay first=1
    while :; do
        load_config
        ensure_display "$KIOSK_DISPLAY_WAIT" || true
        if (( first )); then
            apply_touch
            wait_for_clock
            first=0
        fi
        wait_for_network
        prepare_profile

        started=$SECONDS
        launch_browser
        log "browser started (pid ${BROWSER_PID}) -> ${KIOSK_URL}"

        # Supervise: re-assert rotation if the monitor was power-cycled.
        while kill -0 "$BROWSER_PID" 2>/dev/null; do
            sleep 5
            ensure_display 0 || true
        done
        wait "$BROWSER_PID" 2>/dev/null
        rc=$?
        BROWSER_PID=""
        up=$((SECONDS - started))

        if (( rc == 124 )); then
            log "scheduled browser restart after ${up}s"
            fails=0; delay=2
        elif (( up < 20 )); then
            fails=$((fails + 1))
            delay=$((fails * 5 > 60 ? 60 : fails * 5))
            log "browser exited after ${up}s (rc=${rc}); retrying in ${delay}s"
        else
            fails=0; delay=2
            log "browser exited after ${up}s (rc=${rc}); restarting"
        fi
        sleep "$delay"
    done
}

main "$@"
SESSION_EOF
}

t_write_ctl() {
    write_file /usr/local/bin/kiosk-ctl 0755 <<'CTL_EOF'
#!/bin/sh
# kiosk-ctl - small helper for the kiosk. Run as root (sudo).
set -eu
KIOSK_USER=kiosk

case "${1:-status}" in
    restart)
        pkill -TERM -u "$KIOSK_USER" -x surf || echo "browser not running; the session will start it"
        echo "Browser restarts within seconds and re-reads /etc/kiosk/kiosk.conf."
        ;;
    restart-session)
        systemctl restart getty@tty1
        ;;
    status)
        printf 'getty   : '; systemctl is-active getty@tty1 || true
        printf 'surf    : '; pgrep -u "$KIOSK_USER" -x surf >/dev/null && echo running || echo "not running"
        echo "displays:"
        DISPLAY=:0 XAUTHORITY="/home/$KIOSK_USER/.Xauthority" xrandr --query 2>/dev/null \
            | grep ' connected' | sed 's/^/  /' || echo "  (X server not reachable)"
        ;;
    logs)
        journalctl -t kiosk -b --no-pager | tail -n 50
        uid=$(id -u "$KIOSK_USER")
        echo "--- surf log ---"
        tail -n 50 "/run/user/${uid}/kiosk-surf.log" 2>/dev/null || true
        ;;
    *)
        echo "usage: kiosk-ctl {status|restart|restart-session|logs}" >&2
        exit 1
        ;;
esac
CTL_EOF
}

t_install_tsx() {
    if ! command -v tsx >/dev/null 2>&1; then
        npm install -g tsx || true
    fi
}

# Install a Node.js runtime new enough for the app's native dependencies
# (better-sqlite3 >= 13 requires Node >= 22; target the Node 24 LTS line).
# Debian's packaged nodejs is too old, so pull Node 24 LTS from NodeSource.
t_install_node() {
    local need_install=0 node_bin npm_bin major usr_major
    node_bin=$(command -v node 2>/dev/null || true)
    npm_bin=$(command -v npm 2>/dev/null || true)

    if [[ -z $node_bin || -z $npm_bin ]]; then
        need_install=1
    else
        major=$("$node_bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
        if (( major < 24 )); then need_install=1; fi
    fi

    # The service runs /usr/bin/node by absolute path, so a new enough node
    # elsewhere on PATH does not help if /usr/bin/node itself is old (e.g.
    # Node 24 on PATH with a stale Node 22 under /usr/bin). Probe the
    # absolute path too and reinstall when it is present but too old, even
    # when PATH already reports Node 24; a missing /usr/bin/node is handled
    # by the linking step below.
    if [[ -x /usr/bin/node ]]; then
        usr_major=$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
        if (( usr_major < 24 )); then need_install=1; fi
    fi

    # The app service invokes /usr/bin/npm (and /usr/bin/node) by absolute path,
    # so a runtime found only under /usr/local/bin is not enough on its own.
    if (( need_install == 0 )) && { [[ ! -x /usr/bin/node ]] || [[ ! -x /usr/bin/npm ]]; }; then
        echo "Node.js runtime is new enough but missing from /usr/bin; linking it into place"
        ln -sf "$node_bin" /usr/bin/node
        ln -sf "$npm_bin" /usr/bin/npm
    fi

    if (( need_install == 1 )); then
        echo "Installing Node.js 24 LTS from NodeSource"
        curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
        apt-get install -y nodejs
    fi

    # Final guard: the service and build must have the runtime at the paths they use.
    if [[ ! -x /usr/bin/node || ! -x /usr/bin/npm ]]; then
        if [[ -n $node_bin && -x $node_bin && -n $npm_bin && -x $npm_bin ]]; then
            ln -sf "$node_bin" /usr/bin/node
            ln -sf "$npm_bin" /usr/bin/npm
        fi
    fi
    [[ -x /usr/bin/node ]] || { echo "node is not available at /usr/bin/node" >&2; return 1; }
    [[ -x /usr/bin/npm ]]  || { echo "npm is not available at /usr/bin/npm" >&2; return 1; }

    major=$(/usr/bin/node -p 'process.versions.node.split(".")[0]')
    if (( major < 24 )); then
        echo "Node.js at /usr/bin/node is too old (need >= 24, have $(/usr/bin/node --version))" >&2
        return 1
    fi
    /usr/bin/node --version
}

# Precompile the CLI to plain JavaScript so `kiosk` starts with bare
# `node` instead of re-transpiling the TypeScript sources through tsx on
# every invocation. The wrapper falls back to tsx when no build exists
# (e.g. before the app tree has dependencies installed).
# The build publishes atomically: compile into a temp dir and swap it
# into place only after success, so a power loss or compiler failure
# never leaves `kiosk` pointing at a half-written build. The previous
# build stays untouched when compilation fails.
build_kiosk_cli() {
    local app_dir="${DSCOS_APP_DIR:-/opt/dscos}"
    local tsc="${app_dir}/node_modules/.bin/tsc"
    if [[ ! -x "$tsc" || ! -f "${app_dir}/lib/kiosk/cli.ts" ]]; then
        # No build possible from this tree. Drop any previously compiled
        # build so the wrapper falls back to this tree's sources through
        # tsx instead of running a CLI that no longer matches the app.
        rm -rf /usr/local/lib/kiosk/build
        return 0
    fi
    install -d -m 0755 /usr/local/lib/kiosk
    local tmp
    tmp=$(mktemp -d /usr/local/lib/kiosk/.build.XXXXXX) || return 0
    if ! ( cd "$app_dir" && "$tsc" lib/kiosk/cli.ts \
        --outDir "$tmp" \
        --module commonjs --target es2022 \
        --moduleResolution node --esModuleInterop --skipLibCheck \
        --declaration false --sourceMap false ); then
        # Keep the previous build: the failure may be transient (disk
        # full, power loss), and the old CLI stays safe to run.
        rm -rf "$tmp"
        return 0
    fi
    rm -rf /usr/local/lib/kiosk/.build.prev
    [[ -d /usr/local/lib/kiosk/build ]] && mv /usr/local/lib/kiosk/build /usr/local/lib/kiosk/.build.prev
    chmod 0755 "$tmp"
    mv "$tmp" /usr/local/lib/kiosk/build
    rm -rf /usr/local/lib/kiosk/.build.prev
}

t_install_cli() {
    install -d -m 0755 /usr/local/bin
    cat > /usr/local/bin/kiosk <<'KIOSK_EOF'
#!/bin/sh
export KIOSK_CONFIG_PATH=/etc/kiosk/kiosk.conf
export KIOSK_CLI_ENTRY=1
APP_DIR="${DSCOS_APP_DIR:-/opt/dscos}"
if [ -f /usr/local/lib/kiosk/build/kiosk/cli.js ]; then
    NODE_PATH="${APP_DIR}/node_modules" exec /usr/bin/node /usr/local/lib/kiosk/build/kiosk/cli.js "$@"
elif command -v tsx >/dev/null 2>&1; then
    exec tsx "${APP_DIR}/lib/kiosk/cli.ts" "$@"
elif command -v npx >/dev/null 2>&1; then
    exec npx --yes tsx "${APP_DIR}/lib/kiosk/cli.ts" "$@"
else
    echo "tsx is required to run kiosk CLI" >&2
    exit 1
fi
KIOSK_EOF
    chmod 0755 /usr/local/bin/kiosk
    build_kiosk_cli
    # convenience alias used by docs
}

t_deploy_app() {
    local app_dir="${DSCOS_APP_DIR:-/opt/dscos}"
    if [[ ! -d "$app_dir/.git" && ! -f "$app_dir/package.json" ]]; then
        if [[ -n "${DSCOS_REPO:-}" ]]; then
            git clone "$DSCOS_REPO" "$app_dir"
        elif [[ -f ./package.json ]]; then
            mkdir -p "$app_dir"
            cp -a . "$app_dir"/
        else
            echo "application source not found; set DSCOS_APP_DIR or DSCOS_REPO" >&2
            return 1
        fi
    fi
    cd "$app_dir"
    if [[ -f package.json ]]; then
        # Install with pnpm: the committed pnpm-lock.yaml is the single source
        # of truth for device builds, so what a frame runs is exactly what was
        # resolved at release time. Debian's corepack is too old to launch
        # pnpm 12, so npm provides the bootstrap only; the version follows
        # packageManager in package.json. On Debian 12 (node 18) pnpm 12 and
        # Next 16 both refuse to run - fails loudly.
        if ! command -v pnpm >/dev/null 2>&1; then
            PNPM_VER=$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@\([^"]*\)".*/\1/p' package.json)
            npm install -g "pnpm@${PNPM_VER:-12}"
        fi
        pnpm install --frozen-lockfile
    fi
    # t_install_cli runs before this task, so build the compiled CLI now
    # that node_modules (and therefore tsc) exist. Without it the kiosk
    # wrapper transparently falls back to running through tsx.
    build_kiosk_cli
}

t_enroll_frame() {
    if [[ -z "${CONSOLE_URL:-}" || -z "${ENROLL_CODE:-}" ]]; then
        echo "console URL / enrollment code not supplied; frame boots unpaired" \
             "(sync stays off until: sudo kiosk-ctl enroll <URL> <CODE>)" >&2
        return 0
    fi
    cd "${DSCOS_APP_DIR:-/opt/dscos}"
    # Fresh installs: the dscos service does not exist yet, so the CLI's own
    # restart advisory may fail; the later service/enable tasks start it.
    KIOSK_CLI_ENTRY=1 npx tsx lib/kiosk/cli.ts enroll "$CONSOLE_URL" "$ENROLL_CODE" || true
    echo "enroll command completed; the app service will be started shortly"
}

t_build_app() {
    local app_dir="${DSCOS_APP_DIR:-/opt/dscos}"
    cd "$app_dir"
    # frame.env must exist BEFORE the build so NEXT_PUBLIC_* values inline.
    if [[ -f /etc/dscos/frame.env ]]; then
        source lib/kiosk/build-env.sh
        load_frame_build_env /etc/dscos/frame.env
    fi
    pnpm run build
}

t_write_app_service() {
    local app_dir="${DSCOS_APP_DIR:-/opt/dscos}"
    cat > /etc/systemd/system/dscos.service <<SVC_EOF
[Unit]
Description=Digital Signage Content OS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kiosk
WorkingDirectory=${app_dir}
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=KIOSK_MGMT_PORT=8808
Environment=FRAME_DATA_DIR=/var/lib/dscos/data
EnvironmentFile=-/etc/dscos/frame.env
ExecStart=/usr/bin/npm run start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC_EOF
    mkdir -p /var/lib/dscos/data
    chown -R kiosk:kiosk /var/lib/dscos
    systemctl daemon-reload
    if [[ ${KIOSK_RUNTIME_UPDATE:-0} != 1 ]]; then
        systemctl enable dscos.service
    fi
}

t_write_update_timer() {
    cat > /etc/systemd/system/kiosk-update.service <<'SVC_EOF'
[Unit]
Description=Digital Signage Kiosk auto-update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/kiosk update apply --yes
SVC_EOF
    cat > /etc/systemd/system/kiosk-update.timer <<'TIMER_EOF'
[Unit]
Description=Daily kiosk update check
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
Unit=kiosk-update.service
[Install]
WantedBy=timers.target
TIMER_EOF
    systemctl daemon-reload
    if [[ ${KIOSK_RUNTIME_UPDATE:-0} != 1 ]]; then
        systemctl enable --now kiosk-update.timer || true
    fi
}

t_write_installer_version() {
    echo "${INSTALLER_VERSION}" > /etc/kiosk/installer.version
    chown root:kiosk /etc/kiosk/installer.version 2>/dev/null || true
    chmod 0644 /etc/kiosk/installer.version
}

t_write_standby_scripts() {
    cat > /usr/local/bin/kiosk-standby-on <<'ON_EOF'
#!/bin/sh
export DISPLAY=:0
export XAUTHORITY=/home/kiosk/.Xauthority
sudo -u kiosk xset dpms force off 2>/dev/null || true
ON_EOF
    cat > /usr/local/bin/kiosk-standby-off <<'OFF_EOF'
#!/bin/sh
export DISPLAY=:0
export XAUTHORITY=/home/kiosk/.Xauthority
sudo -u kiosk xset dpms force on 2>/dev/null || true
OFF_EOF
    chmod 0755 /usr/local/bin/kiosk-standby-on /usr/local/bin/kiosk-standby-off
}

t_write_standby_timers() {
    # shellcheck disable=SC1091
    . /etc/kiosk/kiosk.conf 2>/dev/null || true
    local start="${KIOSK_STANDBY_START:-22:00}"
    local end="${KIOSK_STANDBY_END:-06:00}"
    cat > /etc/systemd/system/kiosk-standby-on.service <<EOF
[Unit]
Description=Enable kiosk overnight standby
[Service]
Type=oneshot
ExecStart=/usr/local/bin/kiosk-standby-on
EOF
    cat > /etc/systemd/system/kiosk-standby-on.timer <<EOF
[Unit]
Description=Kiosk standby on at ${start}
[Timer]
OnCalendar=*-*-* ${start}:00
Persistent=true
Unit=kiosk-standby-on.service
[Install]
WantedBy=timers.target
EOF
    cat > /etc/systemd/system/kiosk-standby-off.service <<EOF
[Unit]
Description=Disable kiosk overnight standby
[Service]
Type=oneshot
ExecStart=/usr/local/bin/kiosk-standby-off
EOF
    cat > /etc/systemd/system/kiosk-standby-off.timer <<EOF
[Unit]
Description=Kiosk standby off at ${end}
[Timer]
OnCalendar=*-*-* ${end}:00
Persistent=true
Unit=kiosk-standby-off.service
[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now kiosk-standby-on.timer kiosk-standby-off.timer
}

t_getty() {
    install -d -m 0755 /etc/systemd/system/getty@tty1.service.d
    write_file /etc/systemd/system/getty@tty1.service.d/override.conf 0644 <<'EOF'
[Service]
ExecStart=-/sbin/agetty --autologin root --noclear %I $TERM
EOF
    systemctl disable lightdm.service 2>/dev/null || true
    systemctl daemon-reload
}

t_xinit() {
    write_file /usr/local/bin/kiosk-xinit 0755 <<'EOF'
#!/bin/sh
# Start Xorg on tty1 as root (vt access), then run the kiosk session as kiosk.
export DISPLAY=:0
export XAUTHORITY=/home/kiosk/.Xauthority
touch /home/kiosk/.Xauthority
chown kiosk:kiosk /home/kiosk/.Xauthority
chmod 600 /home/kiosk/.Xauthority
while true; do
    /usr/bin/Xorg :0 -nolisten tcp -s 0 -dpms vt1 &
    XORG_PID=$!
    sleep 2
    su - kiosk -c 'exec /usr/local/lib/kiosk/session.sh'
    kill "$XORG_PID" 2>/dev/null || true
    wait "$XORG_PID" 2>/dev/null || true
    sleep 2
done
EOF
    # Root profile guard: autologin lands on /dev/tty1 and starts X.
    local prof=/root/.profile
    [[ -f $prof ]] || prof=/root/.bash_profile
    if ! grep -q "kiosk-xinit" "$prof" 2>/dev/null; then
        printf '\n# Kiosk: start X + Surf on tty1\nif [ "$(tty)" = /dev/tty1 ]; then exec /usr/local/bin/kiosk-xinit; fi\n' >>"$prof"
    fi
}

t_policy_note() {
    # Surf has no policy surface; this is a no-op checkpoint that documents why.
    echo "surf: minimal WebKit viewer, no extensions/sign-in; single-URL fullscreen enforced by session.sh"
}

t_journald() {
    install -d -m 0755 /etc/systemd/journald.conf.d
    write_file /etc/systemd/journald.conf.d/20-kiosk-storage.conf 0644 <<'EOF'
[Journal]
Storage=volatile
SystemMaxUse=50M
RuntimeMaxUse=50M
EOF
    systemctl restart systemd-journald || echo "could not restart journald (a reboot will apply it)"
}

t_timesync() {
    systemctl enable --now systemd-timesyncd || echo "could not enable systemd-timesyncd now"
}

t_timezone() {
    timedatectl set-timezone "$TZ_NAME" || ln -sf "/usr/share/zoneinfo/${TZ_NAME}" /etc/localtime
}

t_zram_conf() {
    write_file /etc/systemd/zram-generator.conf 0644 <<'EOF'
[zram0]
zram-size = ram / 2
compression-algorithm = lz4
swap-priority = 100
EOF
    # Hardware longevity: fewer slow swaps onto eMMC.
    if grep -q '^#\?vm\.swappiness=' /etc/sysctl.conf 2>/dev/null; then
        sed -i 's/^#\?vm\.swappiness=.*/vm.swappiness=10/' /etc/sysctl.conf
    else
        printf '\nvm.swappiness=10\n' >>/etc/sysctl.conf
    fi
    sysctl -p >/dev/null 2>&1 || echo "could not apply sysctl now (a reboot will apply vm.swappiness=10)"
}

t_cron_reboot() {
    systemctl enable cron 2>/dev/null || true
    ( crontab -l 2>/dev/null | grep -vF '/sbin/reboot' || true ; echo '0 3 * * * /sbin/reboot' ) | crontab -
}

t_validate() {
    bash -n "$LIB_DIR/session.sh"
    [[ -x /usr/local/bin/kiosk-xinit ]]
    [[ -f /etc/systemd/system/getty@tty1.service.d/override.conf ]]
    # shellcheck disable=SC1090
    ( . "$CONFIG_FILE" && [[ -n ${KIOSK_URL:-} ]] )
}

t_enable_boot() {
    systemctl set-default graphical.target
    systemctl enable lightdm.service 2>/dev/null || true
}

t_apt_clean() { apt-get clean; apt-get autoremove --purge -y; }

# ==========================================================================
# Screens
# ==========================================================================
show_plan() {
    local orient="portrait" rot_txt
    if [[ $ROTATE == normal || $ROTATE == inverted ]]; then orient="landscape"; fi
    rot_txt="${orient} ${G_SEP} rotate ${ROTATE}"

    printf '  %s%sInstallation plan%s\n' "$BOLD" "$ACCENT" "$RST"
    gradient_rule 36; printf '  %s\n' "$REPLY"
    kv "Dashboard" "$URL"
    kv "Display" "${rot_txt} ${G_SEP} output: ${OUTPUT:-auto-detect} ${G_SEP} mode: ${MODE:-monitor preferred}"
    kv "Browser" "restart every $( ((RESTART_HOURS > 0)) && echo "${RESTART_HOURS} h" || echo "never" ) ${G_SEP} scale: ${SCALE:-1.0} ${G_SEP} touch rotation: $( ((TOUCH)) && echo on || echo off )"
    kv "System" "timezone: ${TZ_NAME:-unchanged} ${G_SEP} zram swap: $( ((ZRAM)) && echo on || echo off )"
    kv "Account" "${KIOSK_USER} (no password, no sudo)"
    kv "Log" "$LOG"
    printf '\n  %sThis installer will run %d steps:%s\n' "$MUTED" "$STEP_TOTAL" "$RST"
    local i
    for i in "${!STEP_TITLES[@]}"; do
        printf '   %s%s%s %s\n' "$ACCENT" "$G_DOT" "$RST" "${STEP_TITLES[i]}"
    done
    printf '\n'
    if (( DRY )); then
        printf '  %s%sDRY RUN%s %s- nothing on this machine will be changed.%s\n\n' "$BOLD" "$WARNC" "$RST" "$MUTED" "$RST"
    fi
}

confirm_start() {
    if (( YES )) || [[ ! -t 0 ]] || (( ! UI_LIVE )); then return 0; fi
    printf '  Press %sEnter%s to begin, or %sCtrl+C%s to cancel. ' "$BOLD" "$RST" "$BOLD" "$RST"
    read -r _ || true
    printf '\033[2J\033[H\n'
}

finish_screen() {
    local elapsed=$SECONDS orient="portrait"
    if [[ $ROTATE == normal || $ROTATE == inverted ]]; then orient="landscape"; fi
    if (( UI_LIVE )); then printf '\033[?25h'; fi

    printf '\n'
    gradient_rule $((COLS > 60 ? 58 : COLS - 4)); printf '  %s\n' "$REPLY"
    printf '  %s%s%s Installation complete%s  %s(%dm %02ds)%s\n' "$OKC" "$BOLD" "$G_OK" "$RST" "$MUTED" $((elapsed / 60)) $((elapsed % 60)) "$RST"
    gradient_rule $((COLS > 60 ? 58 : COLS - 4)); printf '  %s\n\n' "$REPLY"

    kv "Dashboard" "$URL"
    kv "Display" "${orient} (rotate ${ROTATE})"
    kv "Browser" "$( ((DRY)) && echo "(dry run)" || surf --version 2>/dev/null || surf -v 2>&1 | head -n 1 || echo unknown )"
    kv "Free disk" "$( df -h / 2>/dev/null | awk 'NR==2 {print $4 " free of " $2}' )"
    printf '\n  %sWhat happens next%s\n' "$BOLD" "$RST"
    next_step 1 "Reboot. The machine logs in automatically and starts the dashboard."
    next_step 2 "Check on it with 'sudo kiosk-ctl status' or 'sudo kiosk-ctl logs'."
    next_step 3 "Change the URL or rotation in ${CONFIG_FILE}, then run 'sudo kiosk-ctl restart'."
    if [[ -z $CONSOLE_URL || -z $ENROLL_CODE ]]; then
        next_step 4 "Frame is unpaired. Enroll later with: sudo kiosk-ctl enroll <console-url> <enroll-code>"
    fi
    if [[ $ROTATE == left || $ROTATE == right ]]; then
        local other=left tip
        if [[ $ROTATE == left ]]; then other=right; fi
        tip="Tip: if the picture is upside down, set KIOSK_ROTATE to '${other}' in kiosk.conf."
        printf '\n%s%s%s\n' "$WARNC" "$(printf '%s\n' "$tip" | fold -s -w $((COLS - 4)) | sed 's/^/  /')" "$RST"
    fi
    printf '\n'

    if (( DRY )); then
        printf '  %sDry run finished - no changes were made.%s\n\n' "$MUTED" "$RST"
        return 0
    fi
    if (( REBOOT )); then
        printf '  Rebooting in 5 seconds (Ctrl+C to cancel)...\n'
        sleep 5
        systemctl reboot
    elif (( ! YES )) && [[ -t 0 ]]; then
        local ans=""
        printf '  Reboot now? [y/N] '
        read -r ans || true
        if [[ $ans =~ ^[Yy] ]]; then systemctl reboot; fi
        printf '\n'
    fi
}

# ==========================================================================
# Main
# ==========================================================================
if (( BUILD_CLI )); then
    # Rebuild only the compiled CLI. The update flow calls this after an
    # app switch (and on rollback) so `kiosk` runs the CLI that matches
    # the active app.
    build_kiosk_cli
    exit 0
fi

if (( UPDATE_RUNTIME )); then
    # Reinstall only the generated runtime files. Settings in
    # /etc/kiosk/kiosk.conf and /etc/dscos/frame.env stay untouched.
    # The new bundle needs Node >=24 at /usr/bin/node|npm (the service path),
    # so ensure it before refreshing the helpers that will run against it.
    t_install_node
    t_install_cli
    t_write_session
    t_write_ctl
    t_getty
    t_xinit
    t_write_app_service
    t_write_update_timer
    t_write_standby_scripts
    systemctl daemon-reload
    echo "kiosk runtime updated to ${INSTALLER_VERSION}"
    exit 0
fi

if (( DRY )); then
    LOG=$(mktemp /tmp/kiosk-install-dryrun.XXXXXX)
else
    LOG=$DEFAULT_LOG
fi
STATE_DIR=$(mktemp -d)
trap cleanup_ui EXIT
trap 'printf "\n  Cancelled.\n"; exit 130' INT TERM
printf '\n===== kiosk installer %s, started %s =====\n' "$INSTALLER_VERSION" "$(date '+%F %T')" >>"$LOG"
export DEBIAN_FRONTEND=noninteractive

ui_init
splash
show_plan
confirm_start

# ---- 1/9 --------------------------------------------------------------------
step 3 \
    "Before changing anything, the installer confirms this is a supported Debian release, that the eMMC has enough free space, and that there is enough memory to run a browser comfortably."
task "Detecting Debian release" t_check_os
task "Checking free disk space" t_check_disk
task "Checking memory" t_check_hw
if [[ -r /proc/meminfo ]]; then
    info "$(awk '/^MemTotal:/ {printf "RAM %.1f GB", $2/1048576}' /proc/meminfo) ${G_SEP} $(nproc 2>/dev/null || echo '?') CPU cores ${G_SEP} $(df -h / | awk 'NR==2 {print $4}') free on /"
fi
step_end

# ---- 2/9 --------------------------------------------------------------------
step 2 \
    "Downloads the latest package index from the Debian mirrors so the newest, security-patched versions of everything below get installed."
task "Preparing the package manager" t_preseed
task "Downloading package lists" t_apt_update
step_end

# ---- 3/9 --------------------------------------------------------------------
PACKAGES=(
    xserver-xorg-core xserver-xorg-input-libinput xauth
    x11-xserver-utils x11-utils
    openbox
    surf
    cron
    dbus-x11 dbus-user-session
    curl ca-certificates
    fonts-dejavu-core fonts-noto-color-emoji
    systemd-timesyncd
    git
    build-essential python3
)
if (( TOUCH )); then PACKAGES+=(xinput); fi
if (( ZRAM && ! DRY )); then
    apt-cache show systemd-zram-generator >/dev/null 2>&1 || ZRAM=0
fi
n_tasks=2
if (( ZRAM )); then n_tasks=3; fi

step "$n_tasks" \
    "Installing only what a kiosk needs, with no recommended extras, to keep the 8 GB eMMC roomy:" \
    "$G_DOT Xorg core + libinput - the display server and keyboard/touch drivers" \
    "$G_DOT Getty - logs in automatically on tty1 and starts the X session" \
    "$G_DOT Openbox - a tiny window manager so the browser can go fullscreen" \
    "$G_DOT Surf - the WebKit browser that shows your dashboard" \
    "$G_DOT Fonts, curl, certificates, dbus - fonts, HTTPS and desktop plumbing" \
    "$G_DOT systemd-timesyncd - keeps the clock right so HTTPS pages load"
task "Installing display stack and browser" t_apt_install
if (( ZRAM )); then task "Installing compressed-RAM swap (zram)" t_apt_zram; fi
task "Verifying installed programs" t_verify_cmds
step_end

# ---- 4/9 --------------------------------------------------------------------
step 2 \
    "The browser runs as a dedicated 'kiosk' user with no password and no sudo rights, which limits what a misbehaving web page could reach on this machine."
task "Creating the 'kiosk' user and groups" t_create_user
task "Preparing home and settings directories" t_prep_dirs
step_end

# ---- 5/9 --------------------------------------------------------------------
step 3 \
    "Writes /etc/kiosk/kiosk.conf (your settings), the session script that starts Surf and keeps it running, and the kiosk-ctl helper. They are owned by root, so the kiosk user cannot modify them."
task "Writing kiosk settings" t_write_conf
task "Installing the kiosk session script" t_write_session
task "Installing the kiosk-ctl helper" t_write_ctl
step_end

# ---- 6/9 --------------------------------------------------------------------
if [[ $ROTATE == left || $ROTATE == right ]]; then
    disp_txt="The screen is rotated to portrait ('${ROTATE}'). At every start the session waits for the monitor to report in (DisplayPort can be slow at boot), applies the rotation, and keeps re-checking so a power-cycled monitor stays upright."
else
    disp_txt="The screen is kept in '${ROTATE}' orientation. At every start the session waits for the monitor to report in and keeps re-checking it."
fi
step 2 \
    "Configures getty to sign in automatically on tty1, starting Xorg and the Surf browser fullscreen, with the mouse pointer hidden and screen blanking disabled." \
    "$disp_txt"
task "Configuring getty autologin" t_getty
task "Installing the X launcher" t_xinit
step_end

# ---- 7/9 --------------------------------------------------------------------
step 1 \
    "Surf is a minimal WebKit viewer with no extension, sign-in, or policy surface. Lockdown is hardware-level: it can only open one URL fullscreen, and the supervisor respawns it if it crashes."
task "Confirming Surf lockdown (no policy needed)" t_policy_note
step_end

# ---- 8/9 --------------------------------------------------------------------
n_tasks=3
if [[ -n $TZ_NAME ]]; then n_tasks=$((n_tasks + 1)); fi
if (( ZRAM )); then n_tasks=$((n_tasks + 1)); fi
step "$n_tasks" \
    "Logs are kept in RAM and Surf's cache lives on tmpfs (XDG_CACHE_HOME), so the flash storage is not worn out by constant writes. Time sync keeps HTTPS working even if the clock battery is flat." \
    "Compressed swap (zram) gives the 2 GB of RAM some breathing room without touching the disk."
task "Keeping system logs in RAM" t_journald
task "Enabling network time sync" t_timesync
task "Scheduling daily 03:00 reboot" t_cron_reboot
if [[ -n $TZ_NAME ]]; then task "Setting timezone to ${TZ_NAME}" t_timezone; fi
if (( ZRAM )); then task "Configuring zram swap" t_zram_conf; fi
step_end

# ---- 9/11 --------------------------------------------------------------------
step 10 \
    "Installs the management CLI, deploys the local application, and configures its service."
task "Installing Node.js runtime" t_install_node
task "Installing tsx runtime" t_install_tsx
task "Installing kiosk CLI" t_install_cli
task "Deploying application" t_deploy_app
task "Enrolling frame" t_enroll_frame
task "Building application" t_build_app
task "Configuring application service" t_write_app_service
task "Configuring update timer" t_write_update_timer
task "Writing installer version" t_write_installer_version
task "Configuring standby scripts" t_write_standby_scripts
step_end

# ---- 10/11 --------------------------------------------------------------------
step 2 \
    "Configures overnight standby timers (22:00-06:00) using systemd."
task "Configuring standby timers" t_write_standby_timers
task "Enabling standby timers" t_enable_boot
step_end

# ---- 11/11 --------------------------------------------------------------------
step 3 \
    "Checks the generated files, switches the machine to boot into the graphical session, and clears the package cache to free space."
task "Validating the installation" t_validate
task "Enabling graphical boot" t_enable_boot
task "Cleaning the package cache" t_apt_clean
step_end

finish_screen
