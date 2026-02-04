#!/usr/bin/env bash
# run-tests.sh — Run config-manager tests locally via Docker
#
# Usage:
#   ./run-tests.sh              # Run all tests
#   ./run-tests.sh lint         # Run only lint tests
#   ./run-tests.sh unit         # Run only unit tests
#   ./run-tests.sh integration  # Run only integration tests
#   ./run-tests.sh act          # Run via act (GitHub Actions locally)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Check Docker is available
check_docker() {
    if ! command -v docker &>/dev/null; then
        error "Docker is required but not installed."
        exit 1
    fi

    if ! docker info &>/dev/null 2>&1; then
        # Try with sudo
        if sudo docker info &>/dev/null 2>&1; then
            DOCKER_CMD="sudo docker"
            COMPOSE_CMD="sudo docker compose"
        else
            error "Docker daemon is not running or not accessible."
            exit 1
        fi
    else
        DOCKER_CMD="docker"
        COMPOSE_CMD="docker compose"
    fi
}

run_target() {
    local target="$1"
    info "Running ${target} tests..."
    $COMPOSE_CMD -f "${SCRIPT_DIR}/docker-compose.yml" run --rm --build "$target"
}

run_act() {
    if ! command -v act &>/dev/null; then
        error "act is required but not installed."
        exit 1
    fi

    info "Running tests via act (GitHub Actions locally)..."
    act -W "${PROJECT_ROOT}/.github/workflows/test-config-manager.yml" \
        --container-daemon-socket /var/run/docker.sock
}

main() {
    check_docker

    local target="${1:-all}"

    case "$target" in
        lint)
            run_target lint
            ;;
        unit)
            run_target unit
            ;;
        integration)
            run_target integration
            ;;
        coverage)
            info "Running tests with coverage tracking..."
            run_target coverage
            ;;
        act)
            run_act
            ;;
        all)
            info "=== Running All Config-Manager Tests ==="
            echo ""

            local failures=0

            run_target lint || ((failures++))
            echo ""
            run_target unit || ((failures++))
            echo ""
            run_target integration || ((failures++))
            echo ""

            if [ $failures -eq 0 ]; then
                info "=== All tests passed! ==="
            else
                error "=== ${failures} test suite(s) failed ==="
                exit 1
            fi
            ;;
        *)
            echo "Usage: $0 [lint|unit|integration|coverage|act|all]"
            exit 1
            ;;
    esac
}

main "$@"
