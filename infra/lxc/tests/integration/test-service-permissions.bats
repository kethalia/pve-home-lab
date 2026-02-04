#!/usr/bin/env bats
# test-service-permissions.bats - Verify ProtectSystem and ReadWritePaths
# These tests verify that the service has appropriate security settings

load '../bats-helpers'

SERVICE_FILE="${PROJECT_ROOT}/infra/lxc/scripts/config-manager/config-manager.service"

@test "service: ReadWritePaths includes /var/log/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/var/log/config-manager"
}

@test "service: ReadWritePaths includes /opt/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/opt/config-manager"
}

@test "service: ReadWritePaths includes /var/lib/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/var/lib/config-manager"
}

@test "service: ReadWritePaths includes /usr/local/lib/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/usr/local/lib/config-manager"
}

@test "service: ReadWritePaths includes /usr/local/bin" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/usr/local/bin"
}

@test "service: uses ProtectSystem=full (not strict due to useradd lock file requirements)" {
    # useradd creates lock files in /etc which requires directory write access
    # ProtectSystem=strict doesn't allow this even with individual file whitelisting
    # Check only the actual directive line, not comments
    run grep "^ProtectSystem=" "$SERVICE_FILE"
    assert_output "ProtectSystem=full"
}

@test "service: documents why ProtectSystem=full is needed" {
    # The service file should explain the security trade-off
    run grep -B3 "ProtectSystem" "$SERVICE_FILE"
    assert_output --regexp "(lock file|useradd|usermod)"
}
