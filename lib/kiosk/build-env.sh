load_frame_build_env() {
    local env_file=$1 line key value
    [[ -f $env_file ]] || { printf 'frame environment file not found: %s\n' "$env_file" >&2; return 1; }

    while IFS= read -r line || [[ -n $line ]]; do
        [[ $line == *=* ]] || continue
        key=${line%%=*}
        value=${line#*=}
        case "$key" in
            NEXT_PUBLIC_*) export "$key=$value" ;;
        esac
    done < "$env_file"
}
