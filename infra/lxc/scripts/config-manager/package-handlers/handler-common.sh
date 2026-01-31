#!/usr/bin/env bash
# =============================================================================
# handler-common.sh — Cross-distribution package management orchestrator
#
# Detects the Linux distribution and delegates to the appropriate handler.
# Processes package list files from container-configs/packages/.
#
# Sourced by config-sync.sh
# =============================================================================

[ -n "${_HANDLER_COMMON_LOADED:-}" ] && return 0
_HANDLER_COMMON_LOADED=1

# ---------------------------------------------------------------------------
# Distribution detection
# ---------------------------------------------------------------------------
_detected_distro=""
_detected_pkg_manager=""

detect_distribution() {
  if [ -n "$_detected_distro" ]; then return 0; fi

  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian|linuxmint|pop)
        _detected_distro="debian"
        _detected_pkg_manager="apt"
        ;;
      alpine)
        _detected_distro="alpine"
        _detected_pkg_manager="apk"
        ;;
      fedora|rhel|centos|rocky|alma)
        _detected_distro="fedora"
        _detected_pkg_manager="dnf"
        ;;
      *)
        # Fallback: check for package managers
        if command -v apt-get >/dev/null 2>&1; then
          _detected_distro="debian"
          _detected_pkg_manager="apt"
        elif command -v apk >/dev/null 2>&1; then
          _detected_distro="alpine"
          _detected_pkg_manager="apk"
        elif command -v dnf >/dev/null 2>&1; then
          _detected_distro="fedora"
          _detected_pkg_manager="dnf"
        elif command -v yum >/dev/null 2>&1; then
          _detected_distro="fedora"
          _detected_pkg_manager="yum"
        else
          _detected_distro="unknown"
          _detected_pkg_manager="unknown"
        fi
        ;;
    esac
  fi

  log_info "Detected distribution: ${_detected_distro} (${_detected_pkg_manager})"
}

# ---------------------------------------------------------------------------
# Parse package file — returns list of packages (strips comments/blanks)
# ---------------------------------------------------------------------------
_parse_package_file() {
  local file="$1"
  grep -v '^\s*#' "$file" | grep -v '^\s*$' | sed 's/#.*//' | sed 's/[[:space:]]*$//'
}

# ---------------------------------------------------------------------------
# APT handler
# ---------------------------------------------------------------------------
_apt_updated=0

_apt_ensure_updated() {
  if [ "$_apt_updated" -eq 0 ]; then
    log_info "  Updating apt package index..."
    DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1
    _apt_updated=1
  fi
}

_apt_is_installed() {
  dpkg -l "$1" 2>/dev/null | grep -q "^ii" 2>/dev/null
}

_apt_install() {
  local file="$1"
  local file_name
  file_name="$(basename "$file")"
  log_info "Processing APT packages: ${file_name}"

  _apt_ensure_updated

  local installed=0 skipped=0 failed=0
  local to_install=()

  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    # Extract package name (strip version specifiers like =1.0 or >=1.0)
    local pkg_name="${pkg%%[>=<]*}"
    if _apt_is_installed "$pkg_name"; then
      (( skipped++ )) || true
    else
      to_install+=("$pkg")
    fi
  done < <(_parse_package_file "$file")

  if [ ${#to_install[@]} -gt 0 ]; then
    log_info "  Installing ${#to_install[@]} package(s): ${to_install[*]}"
    if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${to_install[@]}" >/dev/null 2>&1; then
      installed=${#to_install[@]}
      log_ok "  APT: ${installed} installed, ${skipped} already present."
    else
      # Try one by one on batch failure
      for pkg in "${to_install[@]}"; do
        if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg" >/dev/null 2>&1; then
          (( installed++ )) || true
        else
          log_error "  Failed to install: ${pkg}"
          (( failed++ )) || true
        fi
      done
      log_info "  APT: ${installed} installed, ${skipped} skipped, ${failed} failed."
    fi
  else
    log_info "  APT: All ${skipped} packages already installed."
  fi
}

# ---------------------------------------------------------------------------
# APK handler
# ---------------------------------------------------------------------------
_apk_is_installed() {
  apk info -e "$1" >/dev/null 2>&1
}

_apk_install() {
  local file="$1"
  local file_name
  file_name="$(basename "$file")"
  log_info "Processing APK packages: ${file_name}"

  apk update --quiet >/dev/null 2>&1

  local installed=0 skipped=0 failed=0
  local to_install=()

  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    local pkg_name="${pkg%%[>=<]*}"
    if _apk_is_installed "$pkg_name"; then
      (( skipped++ )) || true
    else
      to_install+=("$pkg")
    fi
  done < <(_parse_package_file "$file")

  if [ ${#to_install[@]} -gt 0 ]; then
    log_info "  Installing ${#to_install[@]} package(s)..."
    if apk add --quiet "${to_install[@]}" >/dev/null 2>&1; then
      installed=${#to_install[@]}
    else
      for pkg in "${to_install[@]}"; do
        if apk add --quiet "$pkg" >/dev/null 2>&1; then
          (( installed++ )) || true
        else
          log_error "  Failed to install: ${pkg}"
          (( failed++ )) || true
        fi
      done
    fi
  fi

  log_info "  APK: ${installed} installed, ${skipped} skipped, ${failed} failed."
}

# ---------------------------------------------------------------------------
# DNF handler
# ---------------------------------------------------------------------------
_dnf_is_installed() {
  rpm -q "$1" >/dev/null 2>&1
}

_dnf_install() {
  local file="$1"
  local file_name
  file_name="$(basename "$file")"
  log_info "Processing DNF packages: ${file_name}"

  local installed=0 skipped=0 failed=0
  local to_install=()

  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    local pkg_name="${pkg%%[>=<]*}"
    if _dnf_is_installed "$pkg_name"; then
      (( skipped++ )) || true
    else
      to_install+=("$pkg")
    fi
  done < <(_parse_package_file "$file")

  if [ ${#to_install[@]} -gt 0 ]; then
    log_info "  Installing ${#to_install[@]} package(s)..."
    local cmd="dnf"
    command -v dnf >/dev/null 2>&1 || cmd="yum"
    if $cmd install -y -q "${to_install[@]}" >/dev/null 2>&1; then
      installed=${#to_install[@]}
    else
      for pkg in "${to_install[@]}"; do
        if $cmd install -y -q "$pkg" >/dev/null 2>&1; then
          (( installed++ )) || true
        else
          log_error "  Failed to install: ${pkg}"
          (( failed++ )) || true
        fi
      done
    fi
  fi

  log_info "  DNF: ${installed} installed, ${skipped} skipped, ${failed} failed."
}

# ---------------------------------------------------------------------------
# NPM handler (cross-distro)
# ---------------------------------------------------------------------------
_npm_install() {
  local file="$1"
  local file_name
  file_name="$(basename "$file")"
  log_info "Processing NPM packages: ${file_name}"

  if ! command -v npm >/dev/null 2>&1; then
    log_warn "  npm not found — skipping NPM packages."
    return 0
  fi

  local installed=0 skipped=0 failed=0

  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    if npm list -g "$pkg" >/dev/null 2>&1; then
      (( skipped++ )) || true
    else
      if npm install -g "$pkg" >/dev/null 2>&1; then
        (( installed++ )) || true
      else
        log_error "  Failed to install NPM package: ${pkg}"
        (( failed++ )) || true
      fi
    fi
  done < <(_parse_package_file "$file")

  log_info "  NPM: ${installed} installed, ${skipped} skipped, ${failed} failed."
}

# ---------------------------------------------------------------------------
# PIP handler (cross-distro)
# ---------------------------------------------------------------------------
_pip_install() {
  local file="$1"
  local file_name
  file_name="$(basename "$file")"
  log_info "Processing PIP packages: ${file_name}"

  local pip_cmd=""
  if command -v pip3 >/dev/null 2>&1; then
    pip_cmd="pip3"
  elif command -v pip >/dev/null 2>&1; then
    pip_cmd="pip"
  else
    log_warn "  pip not found — skipping PIP packages."
    return 0
  fi

  local installed=0 skipped=0 failed=0

  while IFS= read -r pkg; do
    [ -z "$pkg" ] && continue
    local pkg_name="${pkg%%[>=<]*}"
    if $pip_cmd show "$pkg_name" >/dev/null 2>&1; then
      (( skipped++ )) || true
    else
      if $pip_cmd install "$pkg" >/dev/null 2>&1; then
        (( installed++ )) || true
      else
        log_error "  Failed to install PIP package: ${pkg}"
        (( failed++ )) || true
      fi
    fi
  done < <(_parse_package_file "$file")

  log_info "  PIP: ${installed} installed, ${skipped} skipped, ${failed} failed."
}

# ---------------------------------------------------------------------------
# Custom handler — processes custom.sh with name|check|install format
# ---------------------------------------------------------------------------
_custom_install() {
  local file="$1"
  local file_name
  file_name="$(basename "$file")"
  log_info "Processing custom installations: ${file_name}"

  local installed=0 skipped=0 failed=0
  local timeout_sec="${CUSTOM_INSTALL_TIMEOUT:-300}"

  while IFS= read -r line; do
    [ -z "$line" ] && continue

    local name check_cmd install_cmd
    name="$(echo "$line" | cut -d'|' -f1)"
    check_cmd="$(echo "$line" | cut -d'|' -f2)"
    install_cmd="$(echo "$line" | cut -d'|' -f3-)"

    if [ -z "$name" ] || [ -z "$install_cmd" ]; then
      log_warn "  Invalid custom entry: ${line}"
      continue
    fi

    # Check if already installed
    if [ -n "$check_cmd" ] && eval "$check_cmd" >/dev/null 2>&1; then
      log_info "  [custom] ${name}: already installed."
      (( skipped++ )) || true
      continue
    fi

    log_info "  [custom] Installing: ${name}..."

    # Run with timeout
    if timeout "$timeout_sec" bash -c "$install_cmd" >/dev/null 2>&1; then
      # Verify installation
      if [ -n "$check_cmd" ] && ! eval "$check_cmd" >/dev/null 2>&1; then
        log_warn "  [custom] ${name}: install completed but verification failed."
        (( failed++ )) || true
      else
        log_ok "  [custom] ${name}: installed successfully."
        (( installed++ )) || true
      fi
    else
      log_error "  [custom] ${name}: installation failed."
      (( failed++ )) || true
    fi
  done < <(_parse_package_file "$file")

  log_info "  Custom: ${installed} installed, ${skipped} skipped, ${failed} failed."
}

# ---------------------------------------------------------------------------
# packages_install — main entry point
# ---------------------------------------------------------------------------
packages_install() {
  local packages_dir="${CONFIGS_DIR:-}/packages"

  if [ ! -d "$packages_dir" ]; then
    log_info "No packages/ directory found. Skipping package installation."
    return 0
  fi

  detect_distribution

  # Process system package files matching detected distribution
  for file in "$packages_dir"/*.${_detected_pkg_manager} "$packages_dir"/*.apt "$packages_dir"/*.apk "$packages_dir"/*.dnf; do
    [ -f "$file" ] || continue
    local ext="${file##*.}"
    case "$ext" in
      apt)
        [ "$_detected_pkg_manager" = "apt" ] && _apt_install "$file"
        ;;
      apk)
        [ "$_detected_pkg_manager" = "apk" ] && _apk_install "$file"
        ;;
      dnf)
        [ "$_detected_pkg_manager" = "dnf" ] || [ "$_detected_pkg_manager" = "yum" ] && _dnf_install "$file"
        ;;
    esac
  done

  # Process cross-distro package files
  for file in "$packages_dir"/*.npm; do
    [ -f "$file" ] && _npm_install "$file"
  done

  for file in "$packages_dir"/*.pip; do
    [ -f "$file" ] && _pip_install "$file"
  done

  # Process custom installations
  for file in "$packages_dir"/custom.sh "$packages_dir"/*.custom; do
    [ -f "$file" ] && _custom_install "$file"
  done

  log_info "Package installation complete."
}
