#!/bin/sh
set -e
mkdir -p /app/.data
chown -R nextjs:nodejs /app/.data 2>/dev/null || true
if command -v runuser >/dev/null 2>&1; then
  exec runuser -u nextjs -- node server.js
fi
exec node server.js
