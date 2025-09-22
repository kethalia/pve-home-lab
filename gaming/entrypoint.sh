#!/bin/bash
set -e

echo "🎮 Launching Steam..."

# Use X11 instead of Wayland
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/1000

# Start D-Bus & PulseAudio
if ! pgrep dbus-daemon > /dev/null; then
    echo "🔧 Starting D-Bus..."
    dbus-launch --exit-with-session &
fi

echo "🔊 Starting PulseAudio..."
pulseaudio --start --daemonize

sleep 3

# Launch Steam in background
steam -silent &

# Wait until Steam is running
echo "⏳ Waiting for Steam to start..."
until pgrep steam > /dev/null; do sleep 1; done

sleep 5

# Now launch Sunshine
echo "📡 Starting Sunshine..."
exec sunshine --loglevel=info "$@"