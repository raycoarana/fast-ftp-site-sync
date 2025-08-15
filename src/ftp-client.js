const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs').promises;

class FtpClient {
  constructor(config) {
    this.config = config;
    this.client = new ftp.Client();
    // Default timeout is 10 seconds, but can be configured
    this.timeout = config.timeout || 10000;
  }

  async connect() {
    const connectPromise = this.client.access({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      secure: false // Use true for FTPS
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout / 1000} seconds`));
      }, this.timeout);
    });

    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } catch (error) {
      // Ensure client is closed on error
      this.client.close();
      throw new Error(`Failed to connect to FTP server: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      const remoteDir = path.posix.dirname(remotePath);
      const remoteFileName = path.posix.basename(remotePath);
      
      // Save current directory
      const originalDir = await this.client.pwd();
      
      try {
        if (remoteDir !== '.' && remoteDir !== '/' && remoteDir !== '') {
          // Create directory structure manually
          await this.ensureRemoteDir(remoteDir);
          
          // Change to the target directory
          await this.client.cd(remoteDir);
          
          // Upload using just the filename
          await this.client.uploadFrom(localPath, remoteFileName);
        } else {
          // Upload directly to root
          await this.client.uploadFrom(localPath, remoteFileName);
        }
      } finally {
        // Always return to original directory
        if (remoteDir !== '.' && remoteDir !== '/' && remoteDir !== '') {
          await this.client.cd(originalDir);
        }
      }
      
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
    if (dirPath === '/' || dirPath === '.' || dirPath === '') return;
    
    try {
      // Split path and create directories recursively using MKD
      const parts = dirPath.split('/').filter(part => part !== '');
      let currentPath = '';
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        try {
          // Try to change to the directory to see if it exists
          await this.client.cd(currentPath);
          // Go back to root
          await this.client.cd('/');
        } catch (_cdError) {
          // Directory doesn't exist, create it using MKD
          try {
            await this.client.send('MKD ' + currentPath);
          } catch (mkdError) {
            // If directory already exists, that's okay
            if (mkdError.code === 550 && mkdError.message.includes('exists')) {
              // Directory already exists, continue
            } else {
              throw mkdError;
            }
          }
        }
      }
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
    } catch (_error) {
      // Ignore disconnection errors
    }
  }
}

module.exports = FtpClient;
