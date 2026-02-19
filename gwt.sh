# gwt shell wrapper - source this in your shell
# Wraps the gwt executable to enable cd into new worktrees

gwt() {
    case "${1:-}" in
        ls|clean|rm|help|-h|--help|--version|"")
            command gwt "$@"
            ;;
        *)
            local output
            output=$(command gwt "$@")
            local rc=$?
            if [ $rc -ne 0 ]; then
                return $rc
            fi
            if [ -n "$output" ] && [ -d "$output" ]; then
                cd "$output"
            fi
            ;;
    esac
}
