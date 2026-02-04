#!/usr/bin/env bats
# test-service-permissions.bats - Verify service security settings
# This service needs broad permissions to configure the system

load '../bats-helpers'

SERVICE_FILE="${PROJECT_ROOT}/infra/lxc/scripts/config-manager/config-manager.service"

@test "service: does NOT use ProtectSystem (needs full system access)" {
    # config-manager needs to modify /etc, /usr, create users, install packages
    # ProtectSystem would block these operations
    run grep "^ProtectSystem=" "$SERVICE_FILE"
    assert_failure
}

@test "service: does NOT use NoNewPrivileges (breaks package installs)" {
    # Docker and other package installers need to set capabilities
    # NoNewPrivileges would block these operations
    run grep "^NoNewPrivileges=" "$SERVICE_FILE"
    assert_failure
}

@test "service: does NOT use PrivateTmp (may break some scripts)" {
    run grep "^PrivateTmp=" "$SERVICE_FILE"
    assert_failure
}

@test "service: explains security trade-offs in comments" {
    # The service file should document why it has broad permissions
    run grep -A5 "Security considerations" "$SERVICE_FILE"
    assert_success
    assert_output --regexp "(useradd|sudoers|systemd|packages)"
}

@test "service: has RuntimeDirectory for lock files" {
    run grep "^RuntimeDirectory=" "$SERVICE_FILE"
    assert_success
    assert_output "RuntimeDirectory=config-manager"
}

@test "service: has appropriate timeout for long-running setup" {
    run grep "^TimeoutStartSec=" "$SERVICE_FILE"
    assert_success
}

@test "actual useradd works without ProtectSystem blocking it" {
    # This is the real test - can we actually create a user?
    # Previous tests only checked config strings, not actual behavior
    run useradd -m -u 9999 -s /bin/bash testuser9999
    assert_success
    
    # Cleanup
    userdel -r testuser9999 2>/dev/null || true
}

@test "actual sudoers write works without read-only filesystem" {
    # Test writing to /etc/sudoers.d (the original bug)
    echo "testuser ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/testuser
    assert [ -f /etc/sudoers.d/testuser ]
    
    # Cleanup
    rm -f /etc/sudoers.d/testuser
}
