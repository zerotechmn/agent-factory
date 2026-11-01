#!/bin/sh
# ./data is bind-mounted from the host and may be root-owned; hand it to the
# unprivileged user so agents never run as root.
set -e
chown -R node:node /data 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node "$@"
