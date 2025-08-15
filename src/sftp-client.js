const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;

class SshSftpClient {
  constructor(config) {
    this.config = config;
    this.client = new SftpClient();
  }

  async connect() {
    console.log(`🔗 [SFTP] Connecting to ${this.config.host}:${this.config.port} as ${this.config.username}`);
    
    try {
      const connectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username
      };

      if (this.config.privateKey) {
        console.log(`🔑 [SFTP] Using private key authentication`);
        connectConfig.privateKey = this.config.privateKey;
      } else if (this.config.password) {
        console.log(`🔑 [SFTP] Using password authentication`);
        connectConfig.password = this.config.password;
      }

      // Enable compression if requested (default: true)
      if (this.config.compression !== false) {
        console.log(`🗜️ [SFTP] Enabling compression: zlib@openssh.com`);
        connectConfig.compress = 'zlib@openssh.com';  // Use OpenSSH compression
      } else {
        console.log(`🗜️ [SFTP] Compression disabled`);
      }

      console.log(`📋 [SFTP] Connection config:`, JSON.stringify({
        ...connectConfig,
        username: connectConfig.username ? '[REDACTED]' : undefined,
        password: connectConfig.password ? '[REDACTED]' : undefined,
        privateKey: connectConfig.privateKey ? '[REDACTED]' : undefined
      }, null, 2));
      await this.client.connect(connectConfig);
      console.log(`✅ [SFTP] Successfully connected to SFTP server`);
    } catch (error) {
      console.log(`❌ [SFTP] Connection failed: ${error.message}`);
      throw new Error(`Failed to connect to SFTP server: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    console.log(`⬆️ [SFTP] uploadFile: ${localPath} -> ${remotePath}`);
    
    try {
      // Ensure remote directory exists
      const remoteDir = path.dirname(remotePath);
      console.log(`📂 [SFTP] Ensuring remote directory: ${remoteDir}`);
      await this.ensureRemoteDir(remoteDir);
      
      console.log(`📤 [SFTP] Calling client.put with params:`, {
        localPath,
        remotePath
      });
      await this.client.put(localPath, remotePath);
      console.log(`✅ [SFTP] Upload successful: ${remotePath}`);
    } catch (error) {
      console.log(`❌ [SFTP] Upload failed: ${error.message}`);
      console.log(`🔍 [SFTP] Error details:`, {
        name: error.name,
        code: error.code,
        errno: error.errno,
        stack: error.stack
      });
      throw new Error(`Failed to upload file ${localPath}: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    console.log(`⬇️ [SFTP] downloadFile: ${remotePath} -> ${localPath}`);
    
    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      console.log(`📂 [SFTP] Ensuring local directory: ${localDir}`);
      await fs.mkdir(localDir, { recursive: true });
      
      console.log(`📥 [SFTP] Calling client.get with params:`, {
        remotePath,
        localPath
      });
      await this.client.get(remotePath, localPath);
      console.log(`✅ [SFTP] Download successful: ${localPath}`);
    } catch (error) {
      console.log(`❌ [SFTP] Download failed: ${error.message}`);
      throw new Error(`Failed to download file ${remotePath}: ${error.message}`);
    }
  }

  async exists(remotePath) {
    console.log(`🔍 [SFTP] exists: ${remotePath}`);
    
    try {
      console.log(`📋 [SFTP] Calling client.stat with params:`, { remotePath });
      await this.client.stat(remotePath);
      console.log(`✅ [SFTP] File exists: ${remotePath}`);
      return true;
    } catch (error) {
      console.log(`❌ [SFTP] File does not exist: ${remotePath} (${error.message})`);
      return false;
    }
  }

  async ensureRemoteDir(dirPath) {
    if (dirPath === '/' || dirPath === '.') return;
    
    console.log(`📂 [SFTP] ensureRemoteDir: ${dirPath}`);
    
    try {
      // Check if directory already exists
      try {
        console.log(`🔍 [SFTP] Checking if directory exists with stat: ${dirPath}`);
        const stat = await this.client.stat(dirPath);
        if (stat.isDirectory()) {
          console.log(`✅ [SFTP] Directory already exists: ${dirPath}`);
          return; // Directory already exists
        } else {
          console.log(`⚠️ [SFTP] Path exists but is not a directory: ${dirPath}`);
        }
      } catch (_statError) {
        console.log(`📂 [SFTP] Directory doesn't exist, will create: ${dirPath}`);
      }
      
      console.log(`🏗️ [SFTP] Calling client.mkdir with params:`, {
        dirPath,
        recursive: true
      });
      await this.client.mkdir(dirPath, true); // recursive mkdir
      console.log(`✅ [SFTP] Successfully created directory: ${dirPath}`);
    } catch (error) {
      console.log(`❌ [SFTP] mkdir error: ${error.message}`);
      
      // Directory might already exist, ignore error
      if (!error.message.includes('exists')) {
        throw new Error(`Failed to create remote directory ${dirPath}: ${error.message}`);
      } else {
        console.log(`✅ [SFTP] Directory creation ignored (already exists): ${dirPath}`);
      }
    }
  }

  async listRemoteFiles(remotePath) {
    console.log(`📋 [SFTP] listRemoteFiles: ${remotePath}`);
    
    try {
      const files = [];
      
      const listRecursive = async (client, currentPath) => {
        console.log(`🔍 [SFTP] Listing directory: ${currentPath}`);
        const list = await client.list(currentPath);
        console.log(`📂 [SFTP] Found ${list.length} items in ${currentPath}`);
        
        for (const item of list) {
          const itemPath = path.posix.join(currentPath, item.name);
          console.log(`📄 [SFTP] Processing item: ${itemPath} (type: ${item.type})`);
          
          if (item.type === '-') { // File
            files.push(itemPath);
            console.log(`📄 [SFTP] Added file: ${itemPath}`);
          } else if (item.type === 'd') { // Directory
            console.log(`📂 [SFTP] Recursing into directory: ${itemPath}`);
            await listRecursive(client, itemPath);
          }
        }
      };
      
      await listRecursive(this.client, remotePath);
      console.log(`✅ [SFTP] Total files found: ${files.length}`);
      return files;
    } catch (error) {
      console.log(`❌ [SFTP] List files failed: ${error.message}`);
      throw new Error(`Failed to list remote files: ${error.message}`);
    }
  }

  async deleteFile(remotePath) {
    console.log(`🗑️ [SFTP] deleteFile: ${remotePath}`);
    
    try {
      console.log(`📤 [SFTP] Calling client.delete with params:`, { remotePath });
      await this.client.delete(remotePath);
      console.log(`✅ [SFTP] Delete successful: ${remotePath}`);
    } catch (error) {
      console.log(`❌ [SFTP] Delete failed: ${error.message}`);
      throw new Error(`Failed to delete file ${remotePath}: ${error.message}`);
    }
  }

  async disconnect() {
    console.log(`🔌 [SFTP] Disconnecting from SFTP server`);
    
    try {
      console.log(`📤 [SFTP] Calling client.end()`);
      await this.client.end();
      console.log(`✅ [SFTP] Disconnect successful`);
    } catch (error) {
      console.log(`⚠️ [SFTP] Disconnect error (ignored): ${error.message}`);
      // Ignore disconnection errors
    }
  }
}

module.exports = SshSftpClient;
