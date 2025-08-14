#!/bin/bash

set -e

echo "🚀 Starting FTP/SFTP Integration Test Setup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📦 Starting Docker containers...${NC}"
docker compose -f docker-compose.test.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Test FTP connection
echo -e "${YELLOW}🔍 Testing FTP connection...${NC}"
timeout 30 bash -c 'until nc -z localhost 21; do sleep 1; done' || {
    echo -e "${RED}❌ FTP server not ready${NC}"
    exit 1
}
echo -e "${GREEN}✅ FTP server is ready${NC}"

# Test SFTP connection
echo -e "${YELLOW}🔍 Testing SFTP connection...${NC}"
timeout 30 bash -c 'until nc -z localhost 2222; do sleep 1; done' || {
    echo -e "${RED}❌ SFTP server not ready${NC}"
    exit 1
}
echo -e "${GREEN}✅ SFTP server is ready${NC}"

echo -e "${GREEN}🎉 All services are ready for testing!${NC}"
echo ""
echo "Test credentials:"
echo "  FTP:  localhost:21 (testuser/testpass)"
echo "  SFTP: localhost:2222 (testuser/testpass)"
echo ""
echo "To run the action locally:"
echo "  npm run build"
echo "  node dist/index.js"
echo ""
echo "To stop services:"
echo "  docker compose -f docker-compose.test.yml down"
