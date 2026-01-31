#!/usr/bin/env bash
# =============================================================================
# benchmark.sh — Performance measurements for LXC container
#
# Measures boot time, sync duration, memory usage, and disk usage.
# Usage: bash benchmark.sh
# =============================================================================
set -uo pipefail

echo "============================================"
echo "LXC Container Performance Benchmark"
echo "Date: $(date)"
echo "============================================"
echo ""

# --- Memory Usage ---
echo "=== Memory ==="
free -h | head -2
echo ""

# Detailed process memory (top 10)
echo "Top processes by memory:"
ps aux --sort=-%mem | head -11
echo ""

# --- Disk Usage ---
echo "=== Disk ==="
df -h / | head -2
echo ""

if [ -d /home ]; then
  echo "Home directory sizes:"
  du -sh /home/*/ 2>/dev/null || echo "  (empty)"
  echo ""
fi

# --- Sync Duration ---
echo "=== Config Manager ==="
if [ -f /var/log/config-manager/sync.log ]; then
  # Extract last sync start and end times
  last_start="$(grep "sync starting" /var/log/config-manager/sync.log | tail -1 | cut -d']' -f1 | tr -d '[')"
  last_end="$(grep "sync completed" /var/log/config-manager/sync.log | tail -1 | cut -d']' -f1 | tr -d '[')"
  echo "Last sync start: ${last_start:-unknown}"
  echo "Last sync end:   ${last_end:-unknown}"

  if [ -n "$last_start" ] && [ -n "$last_end" ]; then
    start_ts="$(date -d "$last_start" +%s 2>/dev/null || echo 0)"
    end_ts="$(date -d "$last_end" +%s 2>/dev/null || echo 0)"
    if [ "$start_ts" -gt 0 ] && [ "$end_ts" -gt 0 ]; then
      duration=$(( end_ts - start_ts ))
      echo "Sync duration:   ${duration}s"
    fi
  fi
else
  echo "No sync log found."
fi
echo ""

# --- Boot Time ---
echo "=== Boot Time ==="
if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze time 2>/dev/null || echo "systemd-analyze not available"
else
  echo "systemd-analyze not available"
fi
echo ""

# --- Service Times ---
echo "=== Service Startup ==="
if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze blame 2>/dev/null | head -10 || true
fi
echo ""

echo "============================================"
echo "Benchmark complete."
