#!/bin/sh
set -e

mkdir -p /app/uploads/profile-photos
chown -R node:node /app/uploads

exec su-exec node "$@"
