const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;

class SshSftpClient {
  constructor(config) {
    this.config = config;
    this.client = new SftpClient();
  }

  async connect() {
    try {
      const connectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username
      };

      if (this.config.privateKey) {
        connectConfig.privateKey = this.config.privateKey;
      } else if (this.config.password) {
        connectConfig.password = this.config.password;
      }

      await this.client.connect(connectConfig);
    } catch (error) {
      throw new Error(`Failed to connect to SFTP server: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      // Ensure remote directory exists
      const remoteDir = path.dirname(remotePath);
      await this.ensureRemoteDir(remoteDir);
      
      await this.client.put(localPath, remotePath);
    } catch (error) {
      throw new Error(`Failed to upload file ${localPath}: ${error.message}`);
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
    
    try {
      // Check if directory already exists
      try {
        const stat = await this.client.stat(dirPath);
        if (stat.isDirectory()) {
          return; // Directory already exists
        }
      } catch (_statError) {
        // Directory doesn't exist, create it
      }
      
      await this.client.mkdir(dirPath, true); // recursive mkdir
    } catch (error) {
      // Directory might already exist, ignore error
      if (!error.message.includes('exists')) {
        throw new Error(`Failed to create remote directory ${dirPath}: ${error.message}`);
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
