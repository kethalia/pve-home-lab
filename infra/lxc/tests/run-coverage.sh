#!/usr/bin/env bash
# run-coverage.sh — Generate code coverage report for bash scripts
#
# Uses kcov to track line coverage of bash scripts during BATS tests

# Note: We use 'set -eo pipefail' (without -u) because kcov's instrumentation
# can cause BASH_SOURCE to be unbound in some contexts, even when protected with ${BASH_SOURCE[0]:-}
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
COVERAGE_DIR="${SCRIPT_DIR}/coverage"
mkdir -p "$COVERAGE_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

info "Running tests with coverage tracking..."

# Core scripts to track coverage for
SCRIPTS=(
    "/workspace/infra/lxc/scripts/config-manager/config-sync.sh"
    "/workspace/infra/lxc/scripts/config-manager/config-manager-helpers.sh"
    "/workspace/infra/lxc/scripts/config-manager/execute-scripts.sh"
    "/workspace/infra/lxc/scripts/config-manager/process-files.sh"
)

# Build include-pattern for kcov
INCLUDE_PATTERN=""
for script in "${SCRIPTS[@]}"; do
    INCLUDE_PATTERN="${INCLUDE_PATTERN} --include-pattern=${script}"
done

# Run BATS tests with kcov
info "Running unit tests with coverage..."
kcov \
    --exclude-pattern=/usr/local,/tmp \
    ${INCLUDE_PATTERN} \
    "${COVERAGE_DIR}" \
    bats /workspace/infra/lxc/tests/unit/

# Generate coverage summary
info ""
info "=== Coverage Summary ==="

if [ -f "${COVERAGE_DIR}/index.html" ]; then
    # Parse coverage from kcov's index.json
    if command -v python3 &>/dev/null && [ -f "${COVERAGE_DIR}/index.json" ]; then
        python3 <<'EOF'
import json
import sys

try:
    with open('coverage/index.json', 'r') as f:
        data = json.load(f)
        percent = data.get('percent_covered', 0)
        lines_covered = data.get('covered', 0)
        lines_total = data.get('instrumented', 0)
        
        print(f"Lines covered: {lines_covered}/{lines_total}")
        print(f"Coverage: {percent:.1f}%")
        
        if percent < 50:
            print("\n⚠️  WARNING: Coverage below 50%")
            sys.exit(1)
        elif percent < 70:
            print("\n⚠️  Coverage below 70% (target: 70%)")
        else:
            print("\n✅ Good coverage!")
except Exception as e:
    print(f"Error parsing coverage: {e}")
    sys.exit(1)
EOF
    else
        warn "Python3 not available or index.json not found - coverage summary unavailable"
    fi
    
    info ""
    info "HTML report: file://${COVERAGE_DIR}/index.html"
else
    warn "Coverage report not generated"
    exit 1
fi
