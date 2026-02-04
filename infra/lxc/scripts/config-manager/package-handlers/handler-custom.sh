#!/usr/bin/env bash
# handler-custom.sh — Custom package installation handler for non-standard tools.
#
# This handler processes custom package installation files that define tools
# which cannot be installed through standard package managers (apt, dnf, npm, etc.).
#
# Each line in a .custom file follows the pipe-delimited format:
#   name|check_command|install_command[|timeout_seconds]
#
# Where:
#   - name:            Human-readable tool name
#   - check_command:   Command that returns 0 if already installed
#   - install_command: Command to run for installation
#   - timeout_seconds: (Optional) Timeout in seconds (default: 300)
#
# Functions exported:
#   custom_is_available           — always returns 0 (custom installs always available)
#   custom_parse_and_install <file> — parse and process a .custom file
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_CUSTOM_LOADED:-}" ]] && return 0
readonly _HANDLER_CUSTOM_LOADED=1

# ---------------------------------------------------------------------------
# Logging — source shared logging utilities
# ---------------------------------------------------------------------------
readonly _HANDLER_DIR="${_HANDLER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"
# shellcheck source=/dev/null
[[ -f "${_HANDLER_DIR}/handler-logging.sh" ]] && source "${_HANDLER_DIR}/handler-logging.sh"
source_logging_stubs

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly DEFAULT_TIMEOUT=300  # 5 minutes default timeout

# ---------------------------------------------------------------------------
# custom_is_available — always returns 0 (custom installations are always "available" to try)
# ---------------------------------------------------------------------------
custom_is_available() {
    return 0
}

# ---------------------------------------------------------------------------
# _validate_custom_line <line> — validate pipe-delimited format
#
# Returns 0 if valid, 1 if invalid.
# Expected format: name|check_command|install_command[|timeout_seconds]
# ---------------------------------------------------------------------------
_validate_custom_line() {
    local line="$1"
    local field_count
    
    # Count pipe delimiters (should be 2 or 3)
    field_count=$(echo "$line" | tr -cd '|' | wc -c)
    
    if [[ $field_count -lt 2 ]] || [[ $field_count -gt 3 ]]; then
        return 1
    fi
    
    # Parse fields
    local name check_cmd install_cmd timeout_val
    IFS='|' read -r name check_cmd install_cmd timeout_val <<< "$line"
    
    # Validate required fields are not empty
    if [[ -z "$name" ]] || [[ -z "$check_cmd" ]] || [[ -z "$install_cmd" ]]; then
        return 1
    fi
    
    # Validate timeout if provided
    if [[ -n "$timeout_val" ]] && ! [[ "$timeout_val" =~ ^[0-9]+$ ]]; then
        log_warn "Invalid timeout value '$timeout_val' for '$name' — must be a positive integer"
        return 1
    fi
    
    return 0
}

# ---------------------------------------------------------------------------
# _run_with_timeout <timeout_seconds> <command> — execute command with timeout
#
# Returns the exit code of the command, or 124 if timed out.
# ---------------------------------------------------------------------------
_run_with_timeout() {
    local timeout_seconds="$1"
    shift
    local command="$*"
    
    if command -v timeout &>/dev/null; then
        # GNU timeout available
        timeout "$timeout_seconds" bash -c "$command"
        return $?
    else
        # Fallback: run without timeout (log warning)
        log_warn "timeout command not available — running without timeout enforcement"
        bash -c "$command"
        return $?
    fi
}

# ---------------------------------------------------------------------------
# custom_parse_and_install <file> — parse and process a .custom file
#
# Reads a .custom file line by line, validates format, checks if tools are
# already installed, and installs missing tools with timeout enforcement.
#
# Tracks installed/skipped/failed tools by name and logs detailed results.
# ---------------------------------------------------------------------------
custom_parse_and_install() {
    local file="$1"
    
    if [[ -z "$file" ]]; then
        log_error "custom_parse_and_install: file path is required"
        return 1
    fi
    
    if [[ ! -f "$file" ]]; then
        log_warn "Custom package file not found: $file"
        return 1
    fi
    
    local file_name
    file_name="$(basename "$file")"
    
    # Track tool status
    local -a installed_tools=()
    local -a skipped_tools=()
    local -a failed_tools=()
    local line_num=0
    
    # Process file line by line
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_num++))
        
        # Remove inline comments
        line="${line%%#*}"
        
        # Trim whitespace
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        # Validate format
        if ! _validate_custom_line "$line"; then
            log_warn "  [Line $line_num] Invalid format (expected: name|check_cmd|install_cmd[|timeout]) — skipping"
            continue
        fi
        
        # Parse fields
        local name check_cmd install_cmd timeout_val
        IFS='|' read -r name check_cmd install_cmd timeout_val <<< "$line"
        timeout_val="${timeout_val:-$DEFAULT_TIMEOUT}"
        
        # Step 1: Check if already installed
        log_info "  [${name}] Checking if already installed..."
        log_info "  [${name}] Running check: ${check_cmd}"
        
        if bash -c "$check_cmd" &>/dev/null; then
            log_info "  [${name}] Already installed — skipping"
            skipped_tools+=("$name")
            continue
        fi
        
        # Step 2: Install with timeout
        log_info "  [${name}] Not found — installing..."
        log_info "  [${name}] Timeout: ${timeout_val}s"
        
        # Truncate long install commands in log for readability
        local install_cmd_display="$install_cmd"
        if [[ ${#install_cmd_display} -gt 100 ]]; then
            install_cmd_display="${install_cmd_display:0:97}..."
        fi
        log_info "  [${name}] Command: ${install_cmd_display}"
        
        local install_output install_exit_code
        install_output=$(_run_with_timeout "$timeout_val" "$install_cmd" 2>&1)
        install_exit_code=$?
        
        # Log installation output (truncate if too long)
        if [[ -n "$install_output" ]]; then
            local output_line_count
            output_line_count=$(echo "$install_output" | wc -l)
            
            if [[ $output_line_count -gt 10 ]]; then
                # Show first 5 and last 5 lines
                echo "$install_output" | head -n 5 | while IFS= read -r out_line; do
                    log_info "  [${name}] ${out_line}"
                done
                log_info "  [${name}] ... (${output_line_count} lines total, middle truncated) ..."
                echo "$install_output" | tail -n 5 | while IFS= read -r out_line; do
                    log_info "  [${name}] ${out_line}"
                done
            else
                echo "$install_output" | while IFS= read -r out_line; do
                    log_info "  [${name}] ${out_line}"
                done
            fi
        fi
        
        # Check installation exit code
        if [[ $install_exit_code -eq 124 ]]; then
            log_error "  [${name}] Installation timed out after ${timeout_val}s"
            failed_tools+=("${name} (timeout)")
            continue
        elif [[ $install_exit_code -ne 0 ]]; then
            log_error "  [${name}] Installation failed with exit code ${install_exit_code}"
            failed_tools+=("${name} (install failed)")
            continue
        fi
        
        # Step 3: Verify installation
        log_info "  [${name}] Verifying installation..."
        if bash -c "$check_cmd" &>/dev/null; then
            log_info "  [${name}] ✓ Successfully installed and verified"
            installed_tools+=("$name")
        else
            log_error "  [${name}] Installation completed but verification failed"
            log_error "  [${name}] The tool may require additional configuration or a shell restart"
            failed_tools+=("${name} (verification failed)")
        fi
        
    done < "$file"
    
    # Summary report
    log_info "  ─────────────────────────────────────"
    log_info "  Custom package summary for ${file_name}:"
    log_info "  - Installed: ${#installed_tools[@]} tool(s)"
    if [[ ${#installed_tools[@]} -gt 0 ]]; then
        for tool in "${installed_tools[@]}"; do
            log_info "    - ${tool}"
        done
    fi
    
    log_info "  - Skipped: ${#skipped_tools[@]} tool(s) (already installed)"
    if [[ ${#skipped_tools[@]} -gt 0 ]]; then
        for tool in "${skipped_tools[@]}"; do
            log_info "    - ${tool}"
        done
    fi
    
    log_info "  - Failed: ${#failed_tools[@]} tool(s)"
    if [[ ${#failed_tools[@]} -gt 0 ]]; then
        for tool in "${failed_tools[@]}"; do
            log_info "    - ${tool}"
        done
    fi
    log_info "  ─────────────────────────────────────"
    
    # Update global counters if they exist (from handler-common.sh)
    if [[ -n "${_PKG_INSTALLED+x}" ]]; then
        (( _PKG_INSTALLED += ${#installed_tools[@]} )) || true
    fi
    if [[ -n "${_PKG_SKIPPED+x}" ]]; then
        (( _PKG_SKIPPED += ${#skipped_tools[@]} )) || true
    fi
    if [[ -n "${_PKG_FAILED+x}" ]]; then
        (( _PKG_FAILED += ${#failed_tools[@]} )) || true
    fi
    
    # Return failure if any tools failed
    if [[ ${#failed_tools[@]} -gt 0 ]]; then
        return 1
    fi
    
    return 0
}

# ---------------------------------------------------------------------------
# Direct execution support (for testing)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    set -euo pipefail
    
    case "${1:-}" in
        available)
            custom_is_available && echo "custom handler is available" || echo "custom handler is not available"
            ;;
        install)
            shift
            custom_parse_and_install "$@"
            ;;
        *)
            echo "Usage: $(basename "$0") {available|install <file>}"
            exit 1
            ;;
    esac
fi
