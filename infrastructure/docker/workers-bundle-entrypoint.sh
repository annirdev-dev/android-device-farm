#!/bin/bash
set -e

mkdir -p /data
minio server /data --console-address ":9001" &
node /repo/services/device-orchestrator/dist/index.js &
node /repo/services/streaming-gateway/dist/index.js &
node /repo/services/emulator-worker/dist/index.js &

# If any one process dies, bring the whole container down so Railway restarts
# it cleanly rather than limping along with a missing piece.
wait -n
exit $?
