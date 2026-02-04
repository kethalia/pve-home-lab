#!/usr/bin/env bats
# test-service-permissions.bats — Verify ProtectSystem=strict paths
# These tests verify that all paths the config-manager needs to write to
# are properly listed in ReadWritePaths

load '../bats-helpers'

setup() {
    # Parse ReadWritePaths from the service file
    SERVICE_FILE="${PROJECT_ROOT}/infra/lxc/scripts/config-manager/config-manager.service"
}

@test "service: ReadWritePaths includes /var/log/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/var/log/config-manager"
}

@test "service: ReadWritePaths includes /opt/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/opt/config-manager"
}

@test "service: ReadWritePaths includes /etc/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/config-manager"
}

@test "service: ReadWritePaths includes /usr/local/lib/config-manager" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/usr/local/lib/config-manager"
}

@test "service: ReadWritePaths includes /usr/local/bin" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/usr/local/bin"
}

@test "service: ReadWritePaths includes /etc/sudoers.d (bug fix)" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/sudoers.d"
}

@test "service: ReadWritePaths includes /home" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/home"
}

@test "service: uses ProtectSystem=strict (not full)" {
    run grep "ProtectSystem" "$SERVICE_FILE"
    assert_output --partial "strict"
    refute_output --partial "full"
}

@test "service: ReadWritePaths includes /etc/systemd/system (for service creation)" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/systemd/system"
}

@test "service: ReadWritePaths includes /etc/passwd (for user creation)" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/passwd"
}

@test "service: ReadWritePaths includes /etc/group (for user creation)" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/group"
}

@test "service: ReadWritePaths includes /etc/shadow (for user creation)" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/shadow"
}

@test "service: ReadWritePaths includes /etc/gshadow (for user creation)" {
    run grep "ReadWritePaths" "$SERVICE_FILE"
    assert_output --partial "/etc/gshadow"
}
