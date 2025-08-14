const FileScanner = require('../src/file-scanner');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('FileScanner', () => {
  let tempDir;
  let fileScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ftp-sync-test-'));
    fileScanner = new FileScanner();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  test('should scan files correctly', async () => {
    // Create test files
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(path.join(tempDir, 'subdir', 'file2.txt'), 'content2');

    const files = await fileScanner.scanFiles(tempDir);
    
    expect(files).toHaveLength(2);
    expect(files.map(f => f.relativePath)).toContain('file1.txt');
    expect(files.map(f => f.relativePath)).toContain('subdir/file2.txt');
  });

  test('should exclude files based on patterns', async () => {
    // Create test files
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
    await fs.writeFile(path.join(tempDir, 'file2.log'), 'log content');
    await fs.mkdir(path.join(tempDir, 'node_modules'));
    await fs.writeFile(path.join(tempDir, 'node_modules', 'module.js'), 'module');

    const files = await fileScanner.scanFiles(tempDir);
    
    // Should exclude .log files and node_modules
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('file1.txt');
  });

  test('should handle custom exclusion patterns', async () => {
    // Create test files
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
    await fs.writeFile(path.join(tempDir, 'file2.tmp'), 'temp content');
    await fs.writeFile(path.join(tempDir, 'file3.txt'), 'content3');

    const files = await fileScanner.scanFiles(tempDir, '*.tmp');
    
    // Should exclude .tmp files
    expect(files).toHaveLength(2);
    expect(files.map(f => f.relativePath)).toContain('file1.txt');
    expect(files.map(f => f.relativePath)).toContain('file3.txt');
  });
});
