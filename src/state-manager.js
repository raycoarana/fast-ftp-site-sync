const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class StateManager {
  constructor(stateFilePath = '.ftp-sync-state.json') {
    this.stateFilePath = stateFilePath;
    this.currentState = {
      version: '1.0.0',
      lastSync: null,
      files: {}
    };
  }

  /**
   * Calculate MD5 hash of a file
   */
  async calculateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash('md5').update(fileBuffer).digest('hex');
    } catch (error) {
      throw new Error(`Failed to calculate hash for ${filePath}: ${error.message}`);
    }
  }

  /**
   * Build state from local files with MD5 checksums
   */
  async buildLocalState(files) {
    const localState = {
      version: '1.0.0',
      lastSync: new Date().toISOString(),
      files: {}
    };

    for (const file of files) {
      const hash = await this.calculateFileHash(file.path);
      const stats = await fs.stat(file.path);
      
      localState.files[file.remotePath] = {
        hash: hash,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        localPath: file.path
      };
    }

    return localState;
  }

  /**
   * Download and parse remote state file
   */
  async downloadRemoteState(client, remotePath) {
    try {
      const remoteStateFile = path.posix.join(remotePath, this.stateFilePath);
      
      // Check if state file exists
      const exists = await this.remoteFileExists(client, remoteStateFile);
      if (!exists) {
        return null;
      }

      // Download state file to temporary location
      const tempFile = path.join(require('os').tmpdir(), `remote-state-${Date.now()}.json`);
      await client.downloadFile(remoteStateFile, tempFile);
      
      // Parse and return state
      const stateContent = await fs.readFile(tempFile, 'utf8');
      await fs.unlink(tempFile); // Clean up temp file
      
      return JSON.parse(stateContent);
    } catch (error) {
      console.warn(`Could not download remote state: ${error.message}`);
      return null;
    }
  }

  /**
   * Upload state file to remote server
   */
  async uploadState(client, state, remotePath) {
    try {
      const remoteStateFile = path.posix.join(remotePath, this.stateFilePath);
      const tempFile = path.join(require('os').tmpdir(), `local-state-${Date.now()}.json`);
      
      // Write state to temporary file
      await fs.writeFile(tempFile, JSON.stringify(state, null, 2));
      
      // Upload to remote
      await client.uploadFile(tempFile, remoteStateFile);
      
      // Clean up temp file
      await fs.unlink(tempFile);
    } catch (error) {
      throw new Error(`Failed to upload state file: ${error.message}`);
    }
  }

  /**
   * Check if remote file exists
   */
  async remoteFileExists(client, remotePath) {
    try {
      // Try to get file info, if it fails, file doesn't exist
      if (typeof client.exists === 'function') {
        return await client.exists(remotePath);
      } else {
        // Fallback: try to download a small part of the file
        const tempFile = path.join(require('os').tmpdir(), `test-${Date.now()}`);
        try {
          await client.downloadFile(remotePath, tempFile);
          await fs.unlink(tempFile);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  /**
   * Compare local and remote states to determine what needs to be synced
   */
  compareStates(localState, remoteState) {
    const result = {
      filesToUpload: [],
      filesToDelete: [],
      stats: {
        unchanged: 0,
        modified: 0,
        new: 0,
        deleted: 0
      }
    };

    const remoteFiles = remoteState ? remoteState.files : {};
    const localFiles = localState.files;

    // Check each local file
    for (const [remotePath, localFile] of Object.entries(localFiles)) {
      const remoteFile = remoteFiles[remotePath];
      
      if (!remoteFile) {
        // New file
        result.filesToUpload.push({
          action: 'new',
          remotePath,
          localPath: localFile.localPath,
          hash: localFile.hash
        });
        result.stats.new++;
      } else if (remoteFile.hash !== localFile.hash) {
        // Modified file
        result.filesToUpload.push({
          action: 'modified',
          remotePath,
          localPath: localFile.localPath,
          hash: localFile.hash,
          oldHash: remoteFile.hash
        });
        result.stats.modified++;
      } else {
        // Unchanged file
        result.stats.unchanged++;
      }
    }

    // Check for deleted files (exist in remote but not in local)
    for (const remotePath of Object.keys(remoteFiles)) {
      if (!localFiles[remotePath]) {
        result.filesToDelete.push(remotePath);
        result.stats.deleted++;
      }
    }

    return result;
  }

  /**
   * Generate sync summary
   */
  generateSyncSummary(comparison, forceFullSync = false) {
    const { stats } = comparison;
    const total = stats.new + stats.modified + stats.unchanged + stats.deleted;
    
    return {
      total,
      toUpload: stats.new + stats.modified,
      toDelete: stats.deleted,
      unchanged: stats.unchanged,
      forceFullSync,
      summary: `${stats.new} new, ${stats.modified} modified, ${stats.deleted} deleted, ${stats.unchanged} unchanged`
    };
  }
}

module.exports = StateManager;
