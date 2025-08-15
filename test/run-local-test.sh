#!/bin/bash

set -e

echo "🧪 Local Action Test"
echo "� Running unified integration tests..."

# Run the unified integration test script in local mode
$(dirname "$0")/integration-test.sh local
