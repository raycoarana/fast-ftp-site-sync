# Integration Testing Guide

This document explains how to run integration tests for the Fast FTP Site Sync action using real FTP and SFTP servers.

## 🎯 Overview

The integration tests verify that our action works correctly with real FTP and SFTP servers by:

- Testing initial file uploads (no state)
- Testing state management (skip uploads when files haven't changed)
- Testing change detection (upload only modified files)
- Testing dry-run mode
- Testing error handling

## 🐳 Prerequisites

- Docker and Docker Compose installed
- Node.js 20.x or later
- netcat (`nc`) for connection testing

## 🚀 Quick Start

### 1. Start Test Servers

```bash
npm run test:integration:setup
```

This will:
- Start FTP server on `localhost:21`
- Start SFTP server on `localhost:2222`
- Use credentials: `testuser` / `testpass`

### 2. Run Local Tests

```bash
npm run test:integration:local
```

This will run the action locally against both servers and test:
- FTP upload functionality
- SFTP upload functionality  
- State file creation and management

### 3. Cleanup

```bash
npm run test:integration:cleanup
```

## 📋 Test Scenarios

### GitHub Actions Integration Tests

The integration tests run automatically in CI and cover:

1. **FTP Initial Sync**
   - Upload files to empty remote directory
   - Verify state file creation
   - Check upload counts

2. **FTP State Management** 
   - Run sync twice with same files
   - Verify second run skips uploads (state working)

3. **SFTP Initial Sync**
   - Upload files via SFTP protocol
   - Verify different port/auth works

4. **SFTP Change Detection**
   - Modify local files
   - Verify only changed files are uploaded
   - Test MD5 checksum comparison

5. **Dry Run Mode**
   - Test without actually uploading
   - Verify no state file creation

6. **Error Handling**
   - Test with invalid credentials
   - Verify proper error responses

## 🔧 Manual Testing

### Test with Different Protocols

**FTP Test:**
```bash
export INPUT_PROTOCOL="ftp"
export INPUT_HOST="localhost"
export INPUT_PORT="21"
export INPUT_USERNAME="testuser"
export INPUT_PASSWORD="testpass"
export INPUT_LOCAL_PATH="./test/test-files"
export INPUT_REMOTE_PATH="/manual-test"
export INPUT_STATE_PATH="./.ftp-manual.json"
export INPUT_DRY_RUN="false"

npm run build
node dist/index.js
```

**SFTP Test:**
```bash
export INPUT_PROTOCOL="sftp"
export INPUT_HOST="localhost"
export INPUT_PORT="2222"
export INPUT_USERNAME="testuser"
export INPUT_PASSWORD="testpass"
export INPUT_LOCAL_PATH="./test/test-files"
export INPUT_REMOTE_PATH="/upload/manual-test"
export INPUT_STATE_PATH="./.sftp-manual.json"
export INPUT_DRY_RUN="false"

node dist/index.js
```

## 📁 Test Files Structure

```
test/
├── test-files/           # Sample files to upload
│   ├── index.html       # HTML file
│   ├── style.css        # CSS file
│   ├── script.js        # JavaScript file
│   └── assets/
│       └── logo.txt     # Nested file
├── start-test-servers.sh # Setup Docker containers
└── run-local-test.sh    # Run local integration test
```

## 🔍 Verification Steps

After running tests, verify:

1. **State Files Created**
   ```bash
   ls -la ./*-state*.json
   ```

2. **Docker Containers Running**
   ```bash
   docker ps
   ```

3. **Server Connectivity**
   ```bash
   nc -z localhost 21    # FTP
   nc -z localhost 2222  # SFTP
   ```

## 🐛 Troubleshooting

### Common Issues

**FTP Connection Failed:**
- Check if port 21 is available
- Verify FTP server is running: `docker logs test-ftp-server`

**SFTP Connection Failed:**
- Check if port 2222 is available  
- Verify SFTP server is running: `docker logs test-sftp-server`

**Permission Errors:**
- Ensure test scripts are executable: `chmod +x test/*.sh`

**State File Issues:**
- Clean up old state files: `rm ./*-state*.json`

### Debugging

Enable debug logging:
```bash
export ACTIONS_STEP_DEBUG=true
export RUNNER_DEBUG=1
```

View Docker logs:
```bash
docker compose -f docker-compose.test.yml logs ftp-server
docker compose -f docker-compose.test.yml logs sftp-server
```

## 🎯 CI/CD Integration

The integration tests run automatically on:
- Pull requests that modify source code
- Manual workflow dispatch
- Changes to test files or workflows

View results in the GitHub Actions "Integration Tests" workflow.

## 📊 Expected Results

Successful test run should show:
- ✅ Files uploaded on first run
- ✅ Zero files uploaded on second run (state working)
- ✅ Changed files detected and uploaded
- ✅ Dry run mode works without side effects
- ✅ Error handling works for invalid credentials

## 🔗 Related

- [Main CI Workflow](../.github/workflows/ci.yml)
- [Integration Test Workflow](../.github/workflows/integration.yml)
- [Docker Compose Config](../docker-compose.test.yml)
