const StateManager = require('../src/state-manager');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Mock client for testing
class MockClient {
  constructor(options = {}) {
    this.shouldFailDownload = options.shouldFailDownload || false;
    this.shouldFailUpload = options.shouldFailUpload || false;
    this.shouldFailExists = options.shouldFailExists || false;
    this.hasExistsMethod = options.hasExistsMethod !== false;
    this.fileExists = options.fileExists !== false;
    this.downloadData = options.downloadData || JSON.stringify({
      version: '1.0.0',
      files: {
        'test.txt': { hash: 'testhash', size: 100, mtime: '2023-01-01T00:00:00.000Z' }
      }
    });
  }

  async downloadFile(remotePath, localPath) {
    if (this.shouldFailDownload) {
      throw new Error('Download failed');
    }
    await fs.writeFile(localPath, this.downloadData);
  }

  async uploadFile(localPath, remotePath) {
    if (this.shouldFailUpload) {
      throw new Error('Upload failed');
    }
    // Simulate successful upload
  }

  async exists(remotePath) {
    if (this.shouldFailExists) {
      throw new Error('Exists check failed');
    }
    return this.fileExists;
  }
}

describe('StateManager', () => {
  let tempDir;
  let stateManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'state-test-'));
    stateManager = new StateManager();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  test('should calculate MD5 hash correctly', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFile, 'Hello World');
    
    const hash = await stateManager.calculateFileHash(testFile);
    expect(hash).toBe('b10a8db164e0754105b7a99be72e3fe5'); // MD5 of "Hello World"
  });

  test('should build local state with file hashes', async () => {
    // Create test files
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');
    await fs.writeFile(file1, 'content1');
    await fs.writeFile(file2, 'content2');

    const files = [
      {
        path: file1,
        remotePath: 'file1.txt'
      },
      {
        path: file2,
        remotePath: 'file2.txt'
      }
    ];

    const state = await stateManager.buildLocalState(files);
    
    expect(state.version).toBe('1.0.0');
    expect(Object.keys(state.files)).toContain('file1.txt');
    expect(Object.keys(state.files)).toContain('file2.txt');
    expect(state.files['file1.txt'].hash).toBeDefined();
    expect(state.files['file2.txt'].hash).toBeDefined();
  });

  test('should compare states correctly', () => {
    const localState = {
      files: {
        'file1.txt': { hash: 'hash1', localPath: '/local/file1.txt' },
        'file2.txt': { hash: 'hash2', localPath: '/local/file2.txt' },
        'file3.txt': { hash: 'hash3', localPath: '/local/file3.txt' }
      }
    };

    const remoteState = {
      files: {
        'file1.txt': { hash: 'hash1' }, // unchanged
        'file2.txt': { hash: 'oldhash2' }, // modified
        'file4.txt': { hash: 'hash4' } // deleted (not in local)
      }
    };

    const comparison = stateManager.compareStates(localState, remoteState);
    
    expect(comparison.filesToUpload).toHaveLength(2); // file2 (modified) + file3 (new)
    expect(comparison.filesToDelete).toHaveLength(1); // file4
    expect(comparison.stats.unchanged).toBe(1); // file1
    expect(comparison.stats.modified).toBe(1); // file2
    expect(comparison.stats.new).toBe(1); // file3
    expect(comparison.stats.deleted).toBe(1); // file4
  });

  test('should handle missing remote state', () => {
    const localState = {
      files: {
        'file1.txt': { hash: 'hash1', localPath: '/local/file1.txt' },
        'file2.txt': { hash: 'hash2', localPath: '/local/file2.txt' }
      }
    };

    const comparison = stateManager.compareStates(localState, null);
    
    expect(comparison.filesToUpload).toHaveLength(2); // all files are new
    expect(comparison.filesToDelete).toHaveLength(0);
    expect(comparison.stats.new).toBe(2);
    expect(comparison.stats.unchanged).toBe(0);
  });

  test('should generate sync summary correctly', () => {
    const comparison = {
      filesToUpload: [
        { action: 'new', remotePath: 'file1.txt' },
        { action: 'modified', remotePath: 'file2.txt' }
      ],
      filesToDelete: ['file3.txt'],
      stats: {
        new: 1,
        modified: 1,
        deleted: 1,
        unchanged: 2
      }
    };

    const summary = stateManager.generateSyncSummary(comparison);
    
    expect(summary.total).toBe(5);
    expect(summary.toUpload).toBe(2);
    expect(summary.toDelete).toBe(1);
    expect(summary.unchanged).toBe(2);
    expect(summary.forceFullSync).toBe(false);
    expect(summary.summary).toBe('1 new, 1 modified, 1 deleted, 2 unchanged');
  });

  test('should generate sync summary with force full sync', () => {
    const comparison = {
      stats: { new: 0, modified: 0, deleted: 0, unchanged: 1 }
    };

    const summary = stateManager.generateSyncSummary(comparison, true);
    
    expect(summary.forceFullSync).toBe(true);
  });

  test('should download remote state successfully', async () => {
    const mockClient = new MockClient();
    
    const remoteState = await stateManager.downloadRemoteState(mockClient, '/remote');
    
    expect(remoteState).toBeDefined();
    expect(remoteState.version).toBe('1.0.0');
    expect(remoteState.files['test.txt']).toBeDefined();
  });

  test('should return null when remote state file does not exist', async () => {
    const mockClient = new MockClient({ fileExists: false });
    
    const remoteState = await stateManager.downloadRemoteState(mockClient, '/remote');
    
    expect(remoteState).toBeNull();
  });

  test('should handle download failure gracefully', async () => {
    const mockClient = new MockClient({ shouldFailDownload: true });
    
    const remoteState = await stateManager.downloadRemoteState(mockClient, '/remote');
    
    expect(remoteState).toBeNull();
  });

  test('should handle invalid JSON in remote state', async () => {
    const mockClient = new MockClient({ downloadData: 'invalid json' });
    
    const remoteState = await stateManager.downloadRemoteState(mockClient, '/remote');
    
    expect(remoteState).toBeNull();
  });

  test('should upload state successfully', async () => {
    const mockClient = new MockClient();
    const testState = {
      version: '1.0.0',
      files: {
        'test.txt': { hash: 'hash123', size: 100 }
      }
    };

    await expect(stateManager.uploadState(mockClient, testState, '/remote')).resolves.not.toThrow();
  });

  test('should handle upload failure', async () => {
    const mockClient = new MockClient({ shouldFailUpload: true });
    const testState = { version: '1.0.0', files: {} };

    await expect(stateManager.uploadState(mockClient, testState, '/remote')).rejects.toThrow('Failed to upload state file');
  });

  test('should check remote file exists with exists method', async () => {
    const mockClient = new MockClient({ fileExists: true });
    
    const exists = await stateManager.remoteFileExists(mockClient, '/remote/file.txt');
    
    expect(exists).toBe(true);
  });

  test('should check remote file exists without exists method', async () => {
    const mockClient = new MockClient({ hasExistsMethod: false, fileExists: true });
    // Remove exists method to test fallback
    delete mockClient.exists;
    
    const exists = await stateManager.remoteFileExists(mockClient, '/remote/file.txt');
    
    expect(exists).toBe(true);
  });

  test('should return false when remote file does not exist', async () => {
    const mockClient = new MockClient({ fileExists: false });
    
    const exists = await stateManager.remoteFileExists(mockClient, '/remote/file.txt');
    
    expect(exists).toBe(false);
  });

  test('should handle fallback download failure in remoteFileExists', async () => {
    // Create a mock client without exists method that fails downloads
    const mockClient = {
      async downloadFile(remotePath, localPath) {
        throw new Error('Download failed for fallback test');
      }
    };
    
    const exists = await stateManager.remoteFileExists(mockClient, '/remote/file.txt');
    
    expect(exists).toBe(false);
  });

  test('should handle fallback download success in remoteFileExists', async () => {
    // Create a mock client without exists method that succeeds downloads
    const mockClient = {
      async downloadFile(remotePath, localPath) {
        // Create a temporary file to simulate successful download
        await fs.writeFile(localPath, 'test content');
      }
    };
    
    const exists = await stateManager.remoteFileExists(mockClient, '/remote/file.txt');
    
    expect(exists).toBe(true);
  });

  test('should handle errors when checking remote file exists', async () => {
    const mockClient = new MockClient({ shouldFailExists: true });
    
    const exists = await stateManager.remoteFileExists(mockClient, '/remote/file.txt');
    
    expect(exists).toBe(false);
  });

  test('should handle file hash calculation error', async () => {
    const nonExistentFile = path.join(tempDir, 'nonexistent.txt');
    
    await expect(stateManager.calculateFileHash(nonExistentFile)).rejects.toThrow('Failed to calculate hash');
  });

  test('should build local state with file stats', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFile, 'test content');

    const files = [{
      path: testFile,
      remotePath: 'test.txt',
      relativePath: 'test.txt'
    }];

    const state = await stateManager.buildLocalState(files);
    
    expect(state.files['test.txt'].size).toBeDefined();
    expect(state.files['test.txt'].mtime).toBeDefined();
    expect(state.files['test.txt'].localPath).toBe('test.txt');
    expect(state.lastSync).toBeDefined();
  });

  test('should handle complex comparison scenarios', () => {
    const localState = {
      files: {
        'unchanged.txt': { hash: 'same', localPath: 'unchanged.txt' },
        'modified.txt': { hash: 'new', localPath: 'modified.txt' },
        'new.txt': { hash: 'new', localPath: 'new.txt' }
      }
    };

    const remoteState = {
      files: {
        'unchanged.txt': { hash: 'same' },
        'modified.txt': { hash: 'old' },
        'deleted.txt': { hash: 'gone' }
      }
    };

    const comparison = stateManager.compareStates(localState, remoteState);
    
    // Check specific files in upload list
    const uploadActions = comparison.filesToUpload.map(f => ({ action: f.action, remotePath: f.remotePath }));
    expect(uploadActions).toContainEqual({ action: 'modified', remotePath: 'modified.txt' });
    expect(uploadActions).toContainEqual({ action: 'new', remotePath: 'new.txt' });
    
    expect(comparison.filesToDelete).toContain('deleted.txt');
    expect(comparison.stats.unchanged).toBe(1);
    expect(comparison.stats.modified).toBe(1);
    expect(comparison.stats.new).toBe(1);
    expect(comparison.stats.deleted).toBe(1);
  });
});
