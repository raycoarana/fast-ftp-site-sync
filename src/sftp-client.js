const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;

class SshSftpClient {
  constructor(config) {
    this.config = config;
    this.client = new SftpClient();
  }

  async connect() {
    console.log(`🔗 [SFTP DEBUG] Connecting to ${this.config.host}:${this.config.port}`);
    
    try {
      const connectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username
      };

      if (this.config.privateKey) {
        console.log(`🔑 [SFTP DEBUG] Using private key authentication`);
        connectConfig.privateKey = this.config.privateKey;
      } else if (this.config.password) {
        console.log(`🔑 [SFTP DEBUG] Using password authentication`);
        connectConfig.password = this.config.password;
      }

      // Enable compression if requested (default: true)
      if (this.config.compression !== false) {
        console.log(`🗜️ [SFTP DEBUG] Enabling compression`);
        connectConfig.compress = true;
      } else {
        console.log(`🗜️ [SFTP DEBUG] Compression disabled`);
      }

      await this.client.connect(connectConfig);
      console.log(`✅ [SFTP DEBUG] Successfully connected to SFTP server`);
      
    } catch (error) {
      console.log(`❌ [SFTP DEBUG] Connection failed: ${error.message}`);
      throw new Error(`Failed to connect to SFTP server: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    console.log(`🔍 [SFTP DEBUG] Starting upload: ${localPath} -> ${remotePath}`);
    
    try {
      // Check local file details
      const fs = require('fs').promises;
      const localStats = await fs.stat(localPath);
      console.log(`📁 [SFTP DEBUG] Local file size: ${localStats.size} bytes, modified: ${localStats.mtime}`);
      
      // Ensure remote directory exists
      const remoteDir = path.dirname(remotePath);
      console.log(`📂 [SFTP DEBUG] Ensuring remote directory: ${remoteDir}`);
      await this.ensureRemoteDir(remoteDir);
      
      // Check if remote file exists before upload
      const remoteExists = await this.exists(remotePath);
      console.log(`🔍 [SFTP DEBUG] Remote file exists: ${remoteExists}`);
      
      if (remoteExists) {
        try {
          const remoteStat = await this.client.stat(remotePath);
          console.log(`📄 [SFTP DEBUG] Remote file size: ${remoteStat.size} bytes, mode: ${remoteStat.mode?.toString(8)}`);
        } catch (statError) {
          console.log(`⚠️ [SFTP DEBUG] Could not stat remote file: ${statError.message}`);
        }
      }
      
      // Try to upload the file with overwrite support
      console.log(`⬆️ [SFTP DEBUG] Attempting upload with overwrite flags...`);
      await this.client.put(localPath, remotePath, { 
        writeStreamOptions: { flags: 'w' }  // Force overwrite mode
      });
      console.log(`✅ [SFTP DEBUG] Upload successful: ${remotePath}`);
      
    } catch (error) {
      console.log(`❌ [SFTP DEBUG] Upload failed with error: ${error.message}`);
      console.log(`🔍 [SFTP DEBUG] Error stack: ${error.stack}`);
      console.log(`🔍 [SFTP DEBUG] Error type: ${error.constructor.name}`);
      
      // If the upload fails, try to delete the remote file first and retry
      if (error.message.includes('Write stream error') || error.message.includes('Failure')) {
        console.log(`🔄 [SFTP DEBUG] Detected write stream error, attempting recovery...`);
        
        try {
          // Check if remote file exists and try to delete it
          const exists = await this.exists(remotePath);
          console.log(`🔍 [SFTP DEBUG] Remote file exists for retry: ${exists}`);
          
          if (exists) {
            console.log(`🗑️ [SFTP DEBUG] Deleting existing remote file: ${remotePath}`);
            await this.client.delete(remotePath);
            console.log(`✅ [SFTP DEBUG] Successfully deleted remote file`);
            
            // Verify deletion
            const stillExists = await this.exists(remotePath);
            console.log(`🔍 [SFTP DEBUG] File still exists after deletion: ${stillExists}`);
          }
          
          // Retry the upload after deletion
          console.log(`🔄 [SFTP DEBUG] Retrying upload after cleanup...`);
          await this.client.put(localPath, remotePath, { 
            writeStreamOptions: { flags: 'w' }
          });
          console.log(`✅ [SFTP DEBUG] Retry upload successful: ${remotePath}`);
          
        } catch (retryError) {
          console.log(`❌ [SFTP DEBUG] Retry failed: ${retryError.message}`);
          console.log(`🔍 [SFTP DEBUG] Retry error stack: ${retryError.stack}`);
          throw new Error(`Failed to upload file ${localPath} after retry: ${retryError.message}`);
        }
      } else {
        throw new Error(`Failed to upload file ${localPath}: ${error.message}`);
      }
    }
  }

  async downloadFile(remotePath, localPath) {
    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      await fs.mkdir(localDir, { recursive: true });
      
      await this.client.get(remotePath, localPath);
    } catch (error) {
      throw new Error(`Failed to download file ${remotePath}: ${error.message}`);
    }
  }

  async exists(remotePath) {
    try {
      await this.client.stat(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureRemoteDir(dirPath) {
    if (dirPath === '/' || dirPath === '.') return;
    
    console.log(`📂 [SFTP DEBUG] Ensuring directory: ${dirPath}`);
    
    try {
      // Check if directory already exists
      try {
        const stat = await this.client.stat(dirPath);
        if (stat.isDirectory()) {
          console.log(`✅ [SFTP DEBUG] Directory already exists: ${dirPath}`);
          return; // Directory already exists
        } else {
          console.log(`⚠️ [SFTP DEBUG] Path exists but is not a directory: ${dirPath}`);
        }
      } catch (_statError) {
        console.log(`📂 [SFTP DEBUG] Directory doesn't exist, creating: ${dirPath}`);
      }
      
      await this.client.mkdir(dirPath, true); // recursive mkdir
      console.log(`✅ [SFTP DEBUG] Successfully created directory: ${dirPath}`);
      
    } catch (error) {
      console.log(`❌ [SFTP DEBUG] mkdir error: ${error.message}`);
      
      // Directory might already exist, ignore error
      if (!error.message.includes('exists')) {
        throw new Error(`Failed to create remote directory ${dirPath}: ${error.message}`);
      } else {
        console.log(`✅ [SFTP DEBUG] Directory creation ignored (already exists): ${dirPath}`);
      }
    }
  }

  async listRemoteFiles(remotePath) {
    try {
      const files = [];
      
      const listRecursive = async (client, currentPath) => {
        const list = await client.list(currentPath);
        
        for (const item of list) {
          const itemPath = path.posix.join(currentPath, item.name);
          
          if (item.type === '-') { // File
            files.push(itemPath);
          } else if (item.type === 'd') { // Directory
            await listRecursive(client, itemPath);
          }
        }
      };
      
      await listRecursive(this.client, remotePath);
      return files;
    } catch (error) {
      throw new Error(`Failed to list remote files: ${error.message}`);
    }
  }

  async deleteFile(remotePath) {
    try {
      await this.client.delete(remotePath);
    } catch (error) {
      throw new Error(`Failed to delete file ${remotePath}: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      await this.client.end();
    } catch (_error) {
      // Ignore disconnection errors
    }
  }
}

module.exports = SshSftpClient;
