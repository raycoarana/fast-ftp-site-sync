# Fast FTP Site Sync

A GitHub Action for syncing files to FTP/SFTP remote sites with selective folder synchronization.

## Features

- 🚀 Support for both FTP and SFTP protocols
- 📁 Selective folder/file synchronization
- 🔐 SSH key authentication for SFTP
- ⚡ State-based sync with MD5 checksums for optimal performance
- 🧹 Option to delete orphaned files on remote
- 🔍 File exclusion patterns
- 🧪 Dry run mode for testing
- 📊 Detailed logging and output metrics

## Usage

### Basic FTP Example

```yaml
name: Deploy to FTP
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Sync to FTP
      uses: raycoarana/fast-ftp-site-sync@v1
      with:
        host: 'ftp.example.com'
        username: ${{ secrets.FTP_USERNAME }}
        password: ${{ secrets.FTP_PASSWORD }}
        local-path: './build'
        remote-path: '/public_html'
        exclude: '*.log,*.tmp,node_modules/**'
```

### SFTP with SSH Key Example

```yaml
name: Deploy to SFTP
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Sync to SFTP
      uses: raycoarana/fast-ftp-site-sync@v1
      with:
        host: 'sftp.example.com'
        port: '22'
        protocol: 'sftp'
        username: ${{ secrets.SFTP_USERNAME }}
        private-key: ${{ secrets.SFTP_PRIVATE_KEY }}
        local-path: './dist'
        remote-path: '/var/www/html'
        delete-orphaned: 'true'
        exclude: '.git/**,.github/**'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `host` | FTP/SFTP server hostname | ✅ | |
| `port` | FTP/SFTP server port | ❌ | `21` |
| `username` | FTP/SFTP username | ✅ | |
| `password` | FTP/SFTP password | ❌ | |
| `private-key` | SSH private key for SFTP | ❌ | |
| `protocol` | Protocol to use (`ftp` or `sftp`) | ❌ | `ftp` |
| `local-path` | Local path/folder to sync from | ❌ | `./` |
| `remote-path` | Remote path/folder to sync to | ❌ | `/` |
| `exclude` | Comma-separated list of files/folders to exclude | ❌ | |
| `dry-run` | Perform a dry run without uploading | ❌ | `false` |
| `delete-orphaned` | Delete files on remote that don't exist locally | ❌ | `false` |
| `state-file-path` | Path to the state file on remote server | ❌ | `.ftp-sync-state.json` |
| `force-full-sync` | Force full sync ignoring remote state file | ❌ | `false` |
| `compression` | Enable compression for SFTP transfers (ignored for FTP) | ❌ | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `files-uploaded` | Number of files uploaded |
| `files-deleted` | Number of files deleted |
| `sync-status` | Overall sync status (`success`/`failed`) |

## Authentication

### FTP
- Use `username` and `password` inputs
- Store credentials in GitHub Secrets

### SFTP
- **Option 1**: Use `username` and `password`
- **Option 2**: Use `username` and `private-key` (recommended)
- Store credentials in GitHub Secrets

### Generating SSH Key for SFTP

```bash
# Generate a new SSH key pair
ssh-keygen -t rsa -b 4096 -f sftp_key

# Add the public key to your server's authorized_keys
cat sftp_key.pub >> ~/.ssh/authorized_keys

# Add the private key to GitHub Secrets as SFTP_PRIVATE_KEY
cat sftp_key
```

## File Exclusion

The action automatically excludes common files:
- `.git/**`
- `.github/**`
- `node_modules/**`
- `.DS_Store`
- `Thumbs.db`
- `*.tmp`
- `*.log`

Additional exclusions can be specified using the `exclude` input with glob patterns:

```yaml
exclude: '*.log,*.tmp,coverage/**,docs/**'
```

## State-Based Synchronization

The action uses an intelligent state-based sync algorithm that significantly improves performance by avoiding slow remote directory listings. Here's how it works:

### How It Works

1. **Local Analysis**: Calculates MD5 checksums for all local files
2. **State Download**: Downloads the previous sync state from the remote server (`.ftp-sync-state.json`)
3. **Smart Comparison**: Compares local and remote file states using checksums
4. **Selective Upload**: Only uploads files that are new or have changed
5. **State Update**: Uploads the new state file after successful sync

### Benefits

- **⚡ Faster Syncs**: Avoids slow recursive directory listings on remote servers
- **🎯 Precision**: Only transfers files that have actually changed
- **📊 Transparency**: Clear reporting of what files are new, modified, or deleted
- **🔄 Reliability**: State file ensures consistency across deployments

### Configuration

```yaml
- name: Smart Sync with State
  uses: raycoarana/fast-ftp-site-sync@v1
  with:
    host: ${{ secrets.FTP_HOST }}
    username: ${{ secrets.FTP_USERNAME }}
    password: ${{ secrets.FTP_PASSWORD }}
    local-path: './dist'
    remote-path: '/public_html'
    state-file-path: '.deploy-state.json'  # Custom state file name
    force-full-sync: 'false'               # Set to true to ignore state
```

### Force Full Sync

Sometimes you may want to ignore the state file and perform a complete sync:

```yaml
force-full-sync: 'true'  # Uploads all files regardless of state
```

Use this when:
- First deployment to a new server
- Recovering from sync issues
- State file corruption
- Manual changes were made to remote files

## Examples

### Deploy React App to FTP

```yaml
name: Deploy React App
on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install and build
      run: |
        npm ci
        npm run build
    
    - name: Deploy to FTP
      uses: raycoarana/fast-ftp-site-sync@v1
      with:
        host: ${{ secrets.FTP_HOST }}
        username: ${{ secrets.FTP_USERNAME }}
        password: ${{ secrets.FTP_PASSWORD }}
        local-path: './build'
        remote-path: '/public_html'
        delete-orphaned: 'true'
```

### Dry Run Test

```yaml
- name: Test sync (dry run)
  uses: raycoarana/fast-ftp-site-sync@v1
  with:
    host: ${{ secrets.FTP_HOST }}
    username: ${{ secrets.FTP_USERNAME }}
    password: ${{ secrets.FTP_PASSWORD }}
    local-path: './dist'
    remote-path: '/test'
    dry-run: 'true'
```

## Security

- Always store credentials in GitHub Secrets
- Use SSH keys instead of passwords for SFTP when possible
- Limit FTP/SFTP user permissions to only necessary directories
- Consider using FTPS (FTP over SSL) for encrypted FTP connections

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

If you encounter issues or have questions:
1. Check the [Issues](https://github.com/raycoarana/fast-ftp-site-sync/issues) page
2. Create a new issue with detailed information
3. Include action logs and configuration (sanitized)
GitHub Action to sync your site to a remote FTP with speed in mind
