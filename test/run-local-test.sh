#!/bin/bash

set -e

echo "🧪 Local Action Test"

# Build the action
echo "📦 Building action..."
npm run build

echo "🚀 Running FTP test..."

# Set environment variables and run FTP test
INPUT_PROTOCOL="ftp" \
INPUT_HOST="localhost" \
INPUT_PORT="21" \
INPUT_USERNAME="testuser" \
INPUT_PASSWORD="testpass" \
INPUT_LOCAL_PATH="./test/test-files" \
INPUT_REMOTE_PATH="local-test" \
INPUT_STATE_FILE_PATH="./.ftp-local-test.json" \
INPUT_DRY_RUN="false" \
node dist/index.js

echo ""
echo "🔄 Running SFTP test..."

# Set environment variables and run SFTP test
INPUT_PROTOCOL="sftp" \
INPUT_HOST="localhost" \
INPUT_PORT="2222" \
INPUT_USERNAME="testuser" \
INPUT_PASSWORD="testpass" \
INPUT_LOCAL_PATH="./test/test-files" \
INPUT_REMOTE_PATH="upload/local-test" \
INPUT_STATE_FILE_PATH="./.sftp-local-test.json" \
INPUT_DRY_RUN="false" \
node dist/index.js

echo ""
echo "✅ Local tests completed!"
echo "State files created:"
ls -la ./*-local-test.json 2>/dev/null || echo "No state files found"
