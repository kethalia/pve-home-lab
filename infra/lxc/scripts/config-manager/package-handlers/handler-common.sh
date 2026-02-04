#!/usr/bin/env bash
# handler-common.sh — Shared logic and orchestration for cross-distribution
# package management.
#
# This script is the main entry point for the package installation phase.
# It discovers package list files, parses them, and delegates to the
# appropriate distribution-specific or cross-distro handler.
#
# Functions exported:
#   install_packages <packages_dir>  — main entry point for the package phase
#   parse_package_file <file>        — read a package file, strip comments/blanks
#
# Expected variables (from config-sync.sh or config-manager-helpers.sh):
#   _PKG_MGR       — detected native package manager (apt|apk|dnf|yum)
#   CONTAINER_OS   — detected OS (ubuntu|debian|alpine|fedora|rhel|...)
#   LIB_DIR        — path to config-manager library scripts
#
# This file is safe to source multiple times (idempotent guard).

# Guard against double-sourcing
[[ -n "${_HANDLER_COMMON_LOADED:-}" ]] && return 0
readonly _HANDLER_COMMON_LOADED=1

# ---------------------------------------------------------------------------
# Package handler directory — co-located with this script
# ---------------------------------------------------------------------------
readonly _HANDLER_DIR="${_HANDLER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)}"

# ---------------------------------------------------------------------------
# Logging — source shared logging utilities
# ---------------------------------------------------------------------------
# shellcheck source=/dev/null
[[ -f "${_HANDLER_DIR}/handler-logging.sh" ]] && source "${_HANDLER_DIR}/handler-logging.sh"
source_logging_stubs

# ---------------------------------------------------------------------------
# Counters for summary reporting
# ---------------------------------------------------------------------------
_PKG_INSTALLED=0
_PKG_SKIPPED=0
_PKG_FAILED=0

# ---------------------------------------------------------------------------
# Native package manager → file extension mapping
# ---------------------------------------------------------------------------
declare -rA _NATIVE_EXTENSIONS=(
    [apt]="apt"
    [apk]="apk"
    [dnf]="dnf"
    [yum]="dnf"    # yum systems use .dnf package files
)

# Cross-distro handler extensions (processed regardless of OS)
readonly _CROSS_DISTRO_EXTENSIONS="npm pip"

# ---------------------------------------------------------------------------
# parse_package_file <file> — read a package file, return clean package list
#
# Strips:
#   - blank lines
#   - lines starting with # (comments)
#   - inline comments (everything after #)
#   - leading/trailing whitespace
#
# Output: one package name per line on stdout
# ---------------------------------------------------------------------------
parse_package_file() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        log_warn "Package file not found: $file"
        return 1
    fi

    # Process the file: strip comments, blank lines, and whitespace
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Remove inline comments
        line="${line%%#*}"
        # Trim leading/trailing whitespace
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        # Validate package name format
        # Allow: alphanumeric, @, /, _, ., :, ~, +, =, -, *, >, <
        # This covers:
        #   - apt: nodejs=24.*, docker-ce=5:20.*
        #   - npm: @babel/core, typescript
        #   - pip: package>=1.0, requests<3.0
        local valid_pkg_pattern='^[a-zA-Z0-9@/_.:~+=*<>-]+$'
        if [[ ! "$line" =~ $valid_pkg_pattern ]]; then
            log_warn "Invalid characters in package name: '$line' in $(basename "$file") (skipping)"
            continue
        fi
        
        # Validate version specifiers (if present)
        if [[ "$line" =~ ^([^=]+)=(.+)$ ]]; then
            local pkg_name="${BASH_REMATCH[1]}"
            local version="${BASH_REMATCH[2]}"
            
            # Warn about suspicious patterns
            if [[ "$version" =~ [[:space:]] ]]; then
                log_warn "Suspicious whitespace in version for '$pkg_name' in $(basename "$file")"
            fi
            
            # Warn about double/triple equals (common typo)
            if [[ "$version" =~ ^= ]]; then
                log_warn "Multiple equals detected in '$pkg_name=$version' in $(basename "$file")"
            fi
        fi
        
        printf '%s\n' "$line"
    done < "$file"
}

# ---------------------------------------------------------------------------
# _source_handler <handler_name> — source a handler script
#
# Looks for handler-<name>.sh in the handler directory or LIB_DIR.
# ---------------------------------------------------------------------------
_source_handler() {
    local name="$1"
    local handler_file="${_HANDLER_DIR}/handler-${name}.sh"

    # Fallback: try installed path under LIB_DIR
    if [[ ! -f "$handler_file" ]] && [[ -n "${LIB_DIR:-}" ]]; then
        handler_file="${LIB_DIR}/package-handlers/handler-${name}.sh"
    fi

    if [[ ! -f "$handler_file" ]]; then
        log_error "Handler not found: handler-${name}.sh"
        return 1
    fi

    # shellcheck source=/dev/null
    source "$handler_file"
}

# ---------------------------------------------------------------------------
# _process_native_packages <packages_dir>
#
# Discovers all *.<pkg_manager_ext> files, parses them, filters out
# already-installed packages, and batch-installs the rest.
# ---------------------------------------------------------------------------
_process_native_packages() {
    local packages_dir="$1"
    local ext="${_NATIVE_EXTENSIONS[${_PKG_MGR}]:-}"

    if [[ -z "$ext" ]]; then
        log_warn "No file extension mapping for package manager '${_PKG_MGR}' — skipping native packages."
        return 0
    fi

    # Discover package files
    local -a pkg_files=()
    while IFS= read -r -d '' f; do
        pkg_files+=("$f")
    done < <(find "$packages_dir" -maxdepth 1 -name "*.${ext}" -type f -print0 2>/dev/null | sort -z)

    if [[ ${#pkg_files[@]} -eq 0 ]]; then
        log_info "No .${ext} package files found in ${packages_dir} — skipping native packages."
        return 0
    fi

    # Source the appropriate handler
    _source_handler "$ext" || return 1

    # Update package index once before processing all files
    local update_fn="${ext}_update_index"
    if declare -f "$update_fn" &>/dev/null; then
        log_info "Updating package index for ${ext}..."
        if ! "$update_fn"; then
            log_error "Package index update failed for ${ext} — cannot safely proceed."
            log_error "Please check network connectivity and repository configuration."
            log_error "Skipping all .${ext} package files to prevent installing stale packages."
            # Count all packages in all files as failed
            for pkg_file in "${pkg_files[@]}"; do
                local -a count_packages=()
                while IFS= read -r pkg; do
                    count_packages+=("$pkg")
                done < <(parse_package_file "$pkg_file")
                (( _PKG_FAILED += ${#count_packages[@]} )) || true
            done
            return 1
        fi
    fi

    # Process each package file
    local check_fn="${ext}_is_pkg_installed"
    local install_fn="${ext}_install_packages"

    for pkg_file in "${pkg_files[@]}"; do
        local pkg_file_name
        pkg_file_name="$(basename "$pkg_file")"
        log_info "Processing package file: ${pkg_file_name}"

        # Parse packages from file
        local -a all_packages=()
        while IFS= read -r pkg; do
            all_packages+=("$pkg")
        done < <(parse_package_file "$pkg_file")

        if [[ ${#all_packages[@]} -eq 0 ]]; then
            log_info "  No packages listed in ${pkg_file_name} — skipping."
            continue
        fi

        # Filter: check which are already installed
        local -a missing_packages=()
        for pkg in "${all_packages[@]}"; do
            if declare -f "$check_fn" &>/dev/null && "$check_fn" "$pkg" 2>/dev/null; then
                log_info "  [SKIP] ${pkg} — already installed"
                (( _PKG_SKIPPED++ )) || true
            else
                missing_packages+=("$pkg")
            fi
        done

        if [[ ${#missing_packages[@]} -eq 0 ]]; then
            log_info "  All packages from ${pkg_file_name} are already installed."
            continue
        fi

        # Batch install missing packages
        log_info "  Installing ${#missing_packages[@]} package(s) from ${pkg_file_name}: ${missing_packages[*]}"
        if declare -f "$install_fn" &>/dev/null; then
            if "$install_fn" "${missing_packages[@]}"; then
                (( _PKG_INSTALLED += ${#missing_packages[@]} )) || true
                log_info "  [OK] ${#missing_packages[@]} package(s) installed from ${pkg_file_name}"
            else
                (( _PKG_FAILED += ${#missing_packages[@]} )) || true
                log_error "  [FAIL] Batch install failed for ${pkg_file_name} — up to ${#missing_packages[@]} package(s) affected"
            fi
        else
            log_error "  Install function '${install_fn}' not found — skipping ${pkg_file_name}"
            (( _PKG_FAILED += ${#missing_packages[@]} )) || true
        fi
    done
}

# ---------------------------------------------------------------------------
# _process_cross_distro_packages <packages_dir> <extension>
#
# Processes cross-distro package files (e.g. *.npm, *.pip) regardless of OS.
# ---------------------------------------------------------------------------
_process_cross_distro_packages() {
    local packages_dir="$1"
    local ext="$2"

    # Discover package files for this extension
    local -a pkg_files=()
    while IFS= read -r -d '' f; do
        pkg_files+=("$f")
    done < <(find "$packages_dir" -maxdepth 1 -name "*.${ext}" -type f -print0 2>/dev/null | sort -z)

    if [[ ${#pkg_files[@]} -eq 0 ]]; then
        return 0
    fi

    # Source the handler
    if ! _source_handler "$ext"; then
        log_warn "Handler for .${ext} files not available — skipping."
        return 0
    fi

    # Check if the tool is available (handler should define <ext>_is_available)
    local available_fn="${ext}_is_available"
    if declare -f "$available_fn" &>/dev/null; then
        if ! "$available_fn"; then
            log_warn "${ext} is not installed — skipping .${ext} package files."
            return 0
        fi
    fi

    local check_fn="${ext}_is_pkg_installed"
    local install_fn="${ext}_install_packages"

    for pkg_file in "${pkg_files[@]}"; do
        local pkg_file_name
        pkg_file_name="$(basename "$pkg_file")"
        log_info "Processing cross-distro package file: ${pkg_file_name}"

        # Parse packages
        local -a all_packages=()
        while IFS= read -r pkg; do
            all_packages+=("$pkg")
        done < <(parse_package_file "$pkg_file")

        if [[ ${#all_packages[@]} -eq 0 ]]; then
            log_info "  No packages listed in ${pkg_file_name} — skipping."
            continue
        fi

        # Filter already installed
        local -a missing_packages=()
        for pkg in "${all_packages[@]}"; do
            if declare -f "$check_fn" &>/dev/null && "$check_fn" "$pkg" 2>/dev/null; then
                log_info "  [SKIP] ${pkg} — already installed"
                (( _PKG_SKIPPED++ )) || true
            else
                missing_packages+=("$pkg")
            fi
        done

        if [[ ${#missing_packages[@]} -eq 0 ]]; then
            log_info "  All packages from ${pkg_file_name} are already installed."
            continue
        fi

        # Batch install
        log_info "  Installing ${#missing_packages[@]} package(s) from ${pkg_file_name}: ${missing_packages[*]}"
        if declare -f "$install_fn" &>/dev/null; then
            if "$install_fn" "${missing_packages[@]}"; then
                (( _PKG_INSTALLED += ${#missing_packages[@]} )) || true
                log_info "  [OK] ${#missing_packages[@]} package(s) installed from ${pkg_file_name}"
            else
                (( _PKG_FAILED += ${#missing_packages[@]} )) || true
                log_error "  [FAIL] Batch install failed for ${pkg_file_name} — up to ${#missing_packages[@]} package(s) affected"
            fi
        else
            log_error "  Install function '${install_fn}' not found — skipping ${pkg_file_name}"
            (( _PKG_FAILED += ${#missing_packages[@]} )) || true
        fi
    done
}

# ---------------------------------------------------------------------------
# _process_custom_packages <packages_dir>
#
# Processes custom package files (*.custom) that define non-standard
# installation methods (curl-based installers, build-from-source, etc.).
#
# Each .custom file uses pipe-delimited format:
#   name|check_command|install_command[|timeout_seconds]
# ---------------------------------------------------------------------------
_process_custom_packages() {
    local packages_dir="$1"
    
    # Discover all *.custom files
    local -a custom_files=()
    while IFS= read -r -d '' f; do
        custom_files+=("$f")
    done < <(find "$packages_dir" -maxdepth 1 -name "*.custom" -type f -print0 2>/dev/null | sort -z)
    
    if [[ ${#custom_files[@]} -eq 0 ]]; then
        return 0
    fi
    
    # Source the handler
    if ! _source_handler "custom"; then
        log_warn "Handler for .custom files not available — skipping."
        return 0
    fi
    
    # Process each custom file
    for custom_file in "${custom_files[@]}"; do
        local custom_file_name
        custom_file_name="$(basename "$custom_file")"
        log_info "Processing custom package file: ${custom_file_name}"
        
        if declare -f custom_parse_and_install &>/dev/null; then
            # custom_parse_and_install handles its own logging and counter updates
            custom_parse_and_install "$custom_file" || true  # Continue on failure
        else
            log_error "custom_parse_and_install function not found — skipping ${custom_file_name}"
        fi
    done
}

# ---------------------------------------------------------------------------
# install_packages <packages_dir> — main entry point
#
# Orchestrates the full package installation phase:
#   1. Validates the packages directory exists
#   2. Ensures OS and package manager are detected
#   3. Processes native package files (*.<pkg_mgr>)
#   4. Processes cross-distro files (*.npm, *.pip)
#   5. Processes custom installation files (*.custom)
#   6. Logs a summary
# ---------------------------------------------------------------------------
install_packages() {
    local packages_dir="${1:-}"

    if [[ -z "$packages_dir" ]]; then
        log_error "install_packages: packages directory path is required."
        return 1
    fi

    if [[ ! -d "$packages_dir" ]]; then
        log_info "Packages directory not found: ${packages_dir} — skipping package installation."
        return 0
    fi

    # Reset counters
    _PKG_INSTALLED=0
    _PKG_SKIPPED=0
    _PKG_FAILED=0

    # Ensure detection has been performed (helpers should already be loaded)
    if [[ -z "${CONTAINER_OS:-}" ]] || [[ "$CONTAINER_OS" == "unknown" ]]; then
        if declare -f detect_container_os &>/dev/null; then
            detect_container_os
        fi
    fi

    if [[ -z "${_PKG_MGR:-}" ]] || [[ "$_PKG_MGR" == "unknown" ]]; then
        if declare -f detect_package_manager &>/dev/null; then
            detect_package_manager
        fi
    fi

    log_info "Package installation — OS: ${CONTAINER_OS:-unknown}, package manager: ${_PKG_MGR:-unknown}"

    # Step 1: Process native packages
    if [[ -n "${_PKG_MGR:-}" ]] && [[ "${_PKG_MGR}" != "unknown" ]]; then
        _process_native_packages "$packages_dir"
    else
        log_warn "No supported native package manager detected — skipping native packages."
    fi

    # Step 2: Process cross-distro packages
    local ext
    for ext in $_CROSS_DISTRO_EXTENSIONS; do
        _process_cross_distro_packages "$packages_dir" "$ext"
    done

    # Step 3: Process custom packages
    _process_custom_packages "$packages_dir"

    # Step 4: Summary
    log_info "Package installation complete — installed: ${_PKG_INSTALLED}, skipped: ${_PKG_SKIPPED}, failed: ${_PKG_FAILED}"

    if [[ $_PKG_FAILED -gt 0 ]]; then
        log_warn "${_PKG_FAILED} package(s) failed to install. Review the log for details."
        return 1  # Signal partial failure to caller
    fi

    return 0
}

# ---------------------------------------------------------------------------
# Direct execution support (for testing)
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    set -euo pipefail
    install_packages "${1:-.}"
fi
