const StateManager = require('../src/state-manager');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

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
});
