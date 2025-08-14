const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs').promises;

class FtpClient {
  constructor(config) {
    this.config = config;
    this.client = new ftp.Client();
  }

  async connect() {
    try {
      await this.client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.username,
        password: this.config.password,
        secure: false // Use true for FTPS
      });
    } catch (error) {
      throw new Error(`Failed to connect to FTP server: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      // Ensure remote directory exists
      const remoteDir = path.dirname(remotePath);
      await this.ensureRemoteDir(remoteDir);
      
      await this.client.uploadFrom(localPath, remotePath);
    } catch (error) {
      throw new Error(`Failed to upload file ${localPath}: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    try {
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      await fs.mkdir(localDir, { recursive: true });
      
      await this.client.downloadTo(localPath, remotePath);
    } catch (error) {
      throw new Error(`Failed to download file ${remotePath}: ${error.message}`);
    }
  }

  async exists(remotePath) {
    try {
      await this.client.size(remotePath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureRemoteDir(dirPath) {
    if (dirPath === '/' || dirPath === '.') return;
    
    try {
      await this.client.ensureDir(dirPath);
    } catch (error) {
      throw new Error(`Failed to create remote directory ${dirPath}: ${error.message}`);
    }
  }

  async listRemoteFiles(remotePath) {
    try {
      const files = [];
      
      const listRecursive = async (client, currentPath) => {
        const list = await client.list(currentPath);
        
        for (const item of list) {
          const itemPath = path.posix.join(currentPath, item.name);
          
          if (item.type === 1) { // File
            files.push(itemPath);
          } else if (item.type === 2) { // Directory
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
      await this.client.remove(remotePath);
    } catch (error) {
      throw new Error(`Failed to delete file ${remotePath}: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      this.client.close();
    } catch (error) {
      // Ignore disconnection errors
    }
  }
}

module.exports = FtpClient;
