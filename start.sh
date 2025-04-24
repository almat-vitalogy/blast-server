#!/bin/bash

export DISPLAY=:99
Xvfb :99 -screen 0 1280x1024x24 &

sleep 3  # Ensure Xvfb starts fully before node.js
echo "Starting node.js with DISPLAY=$DISPLAY"
node index.js
