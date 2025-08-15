const SftpClient = require('ssh2-sftp-client');
const core = require('@actions/core');
const path = require('path');
const fs = require('fs').promises;

class SshSftpClient {
  constructor(config) {
    this.config = config;
    this.client = new SftpClient();
  }

  async connect() {
    core.debug(`🔗 [SFTP] Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}`);
    
    try {
      const connectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username
      };

      if (this.config.privateKey) {
        core.debug(`🔑 [SFTP] Using private key authentication`);
        connectConfig.privateKey = this.config.privateKey;
      } else if (this.config.password) {
        core.debug(`🔑 [SFTP] Using password authentication`);
        connectConfig.password = this.config.password;
      }

      // Enable compression if requested (default: true)
      if (this.config.compression !== false) {
        core.debug(`🗜️ [SFTP] Enabling compression: zlib@openssh.com`);
        connectConfig.compress = 'zlib@openssh.com';  // Use OpenSSH compression
      } else {
        core.debug(`🗜️ [SFTP] Compression disabled`);
      }

      core.debug(`📋 [SFTP] Connection config:`, JSON.stringify({
        ...connectConfig,
        username: connectConfig.username ? '[REDACTED]' : undefined,
        password: connectConfig.password ? '[REDACTED]' : undefined,
        privateKey: connectConfig.privateKey ? '[REDACTED]' : undefined
      }, null, 2));
      await this.client.connect(connectConfig);
      core.debug(`✅ [SFTP] Successfully connected to SFTP server`);
      
      // Log current working directory after connection
      try {
        const cwd = await this.client.cwd();
        core.debug(`📁 [SFTP] Current working directory after connection: "${cwd}"`);
      } catch (cwdError) {
        core.debug(`⚠️ [SFTP] Could not get current working directory: ${cwdError.message}`);
      }
    } catch (error) {
      core.error(`❌ [SFTP] Connection failed: ${error.message}`);
      throw new Error(`Failed to connect to SFTP server: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    core.debug(`⬆️ [SFTP] uploadFile called with:`);
    core.debug(`   localPath: "${localPath}"`);
    core.debug(`   remotePath: "${remotePath}"`);
    
    try {
      // Ensure remote directory exists
      const remoteDir = path.dirname(remotePath);
      core.debug(`📂 [SFTP] Extracted remote directory from path.dirname("${remotePath}"): "${remoteDir}"`);
      core.debug(`📂 [SFTP] Remote directory type: ${typeof remoteDir}, length: ${remoteDir?.length}`);
      
      await this.ensureRemoteDir(remoteDir);
      
      core.debug(`📤 [SFTP] Calling client.put with params:`, {
        localPath: `"${localPath}"`,
        remotePath: `"${remotePath}"`
      });
      await this.client.put(localPath, remotePath);
      core.debug(`✅ [SFTP] Upload successful: "${remotePath}"`);
    } catch (error) {
      core.error(`❌ [SFTP] Upload failed: ${error.message}`);
      core.error(`🔍 [SFTP] Error details:`, {
        name: error.name,
        code: error.code,
        errno: error.errno
      });
      throw new Error(`Failed to upload file ${localPath}: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    core.debug(`⬇️ [SFTP] downloadFile: ${remotePath} -> ${localPath}`);
    
    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      core.debug(`📂 [SFTP] Ensuring local directory: ${localDir}`);
      await fs.mkdir(localDir, { recursive: true });
      
      core.debug(`📥 [SFTP] Calling client.get with params:`, {
        remotePath,
        localPath
      });
      await this.client.get(remotePath, localPath);
      core.debug(`✅ [SFTP] Download successful: ${localPath}`);
    } catch (error) {
      core.error(`❌ [SFTP] Download failed: ${error.message}`);
      throw new Error(`Failed to download file ${remotePath}: ${error.message}`);
    }
  }

  async exists(remotePath) {
    core.debug(`🔍 [SFTP] exists: ${remotePath}`);
    
    try {
      core.debug(`📋 [SFTP] Calling client.stat with params:`, { remotePath });
      await this.client.stat(remotePath);
      core.debug(`✅ [SFTP] File exists: ${remotePath}`);
      return true;
    } catch (error) {
      core.debug(`❌ [SFTP] File does not exist: ${remotePath} (${error.message})`);
      return false;
    }
  }

  async ensureRemoteDir(dirPath) {
    core.debug(`📂 [SFTP] ensureRemoteDir called with: "${dirPath}"`);
    
    if (dirPath === '/' || dirPath === '.') {
      core.debug(`📂 [SFTP] Skipping root or current directory: "${dirPath}"`);
      return;
    }

    try {
      // Check if directory already exists
      try {
        core.debug(`🔍 [SFTP] Checking if directory exists with stat: "${dirPath}"`);
        const stat = await this.client.stat(dirPath);
        core.debug(`📊 [SFTP] Stat result for "${dirPath}":`, {
          isDirectory: stat.isDirectory,
          isFile: stat.isFile,
          mode: stat.mode?.toString(8),
          size: stat.size,
          uid: stat.uid,
          gid: stat.gid
        });
        
        if (stat.isDirectory) {
          core.debug(`✅ [SFTP] Directory already exists: "${dirPath}"`);
          return; // Directory already exists
        } else {
          core.debug(`⚠️ [SFTP] Path exists but is not a directory: "${dirPath}"`);
        }
      } catch (statError) {
        core.debug(`❌ [SFTP] stat() failed for "${dirPath}": ${statError.message}`);
        core.debug(`🔍 [SFTP] Error details:`, {
          name: statError.name,
          code: statError.code,
          errno: statError.errno
        });
      }
      
      core.debug(`🏗️ [SFTP] Calling client.mkdir with params:`, {
        dirPath: `"${dirPath}"`,
        recursive: true
      });
      await this.client.mkdir(dirPath, true); // recursive mkdir
      core.debug(`✅ [SFTP] Successfully created directory: "${dirPath}"`);
    } catch (error) {
      core.error(`❌ [SFTP] mkdir error for "${dirPath}": ${error.message}`);
      core.error(`🔍 [SFTP] mkdir error details:`, {
        name: error.name,
        code: error.code,
        errno: error.errno
      });
      
      // Directory might already exist, ignore error
      if (!error.message.includes('exists')) {
        throw new Error(`Failed to create remote directory ${dirPath}: ${error.message}`);
      } else {
        core.debug(`✅ [SFTP] Directory creation ignored (already exists): "${dirPath}"`);
      }
    }
  }

  async listRemoteFiles(remotePath) {
    core.debug(`📋 [SFTP] listRemoteFiles: ${remotePath}`);
    
    try {
      const files = [];
      
      const listRecursive = async (client, currentPath) => {
        core.debug(`🔍 [SFTP] Listing directory: ${currentPath}`);
        const list = await client.list(currentPath);
        core.debug(`📂 [SFTP] Found ${list.length} items in ${currentPath}`);
        
        for (const item of list) {
          const itemPath = path.posix.join(currentPath, item.name);
          core.debug(`📄 [SFTP] Processing item: ${itemPath} (type: ${item.type})`);
          
          if (item.type === '-') { // File
            files.push(itemPath);
            core.debug(`📄 [SFTP] Added file: ${itemPath}`);
          } else if (item.type === 'd') { // Directory
            core.debug(`📂 [SFTP] Recursing into directory: ${itemPath}`);
            await listRecursive(client, itemPath);
          }
        }
      };
      
      await listRecursive(this.client, remotePath);
      core.debug(`✅ [SFTP] Total files found: ${files.length}`);
      return files;
    } catch (error) {
      core.error(`❌ [SFTP] List files failed: ${error.message}`);
      throw new Error(`Failed to list remote files: ${error.message}`);
    }
  }

  async deleteFile(remotePath) {
    core.debug(`🗑️ [SFTP] deleteFile: ${remotePath}`);
    
    try {
      core.debug(`📤 [SFTP] Calling client.delete with params:`, { remotePath });
      await this.client.delete(remotePath);
      core.debug(`✅ [SFTP] Delete successful: ${remotePath}`);
    } catch (error) {
      core.error(`❌ [SFTP] Delete failed: ${error.message}`);
      throw new Error(`Failed to delete file ${remotePath}: ${error.message}`);
    }
  }

  async disconnect() {
    core.debug(`🔌 [SFTP] Disconnecting from SFTP server`);
    
    try {
      core.debug(`📤 [SFTP] Calling client.end()`);
      await this.client.end();
      core.debug(`✅ [SFTP] Disconnect successful`);
    } catch (error) {
      core.debug(`⚠️ [SFTP] Disconnect error (ignored): ${error.message}`);
      // Ignore disconnection errors
    }
  }
}

module.exports = SshSftpClient;
