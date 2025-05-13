#!/bin/bash

export DISPLAY=:99
export PORT=5001

echo "🔄 Cleaning up old Xvfb processes..."
sudo pkill -f "Xvfb :99" 2>/dev/null || true

echo "🧹 Removing stale lock files..."
sudo rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

echo "🚀 Starting Xvfb on DISPLAY=$DISPLAY..."
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!

sleep 2

if ps -p $XVFB_PID > /dev/null; then
  echo "✅ Xvfb started successfully with PID $XVFB_PID"
else
  echo "❌ Failed to start Xvfb"
  exit 1
fi

echo "🟢 Starting Node.js server..."
node index.js
