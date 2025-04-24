#!/bin/bash
# Start Xvfb
Xvfb :99 -screen 0 1280x1024x24 &
# Start the Node.js application
node index.js