// Mock ssh2-sftp-client first
jest.mock('ssh2-sftp-client');
// Mock @actions/core
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn()
}));

const SftpClient = require('../src/sftp-client');
const core = require('@actions/core');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Mock fs.promises separately
jest.mock('fs', () => ({
  promises: {
    mkdtemp: jest.fn(),
    rm: jest.fn(),
    mkdir: jest.fn()
  }
}));

// Mock the actual ssh2-sftp-client class
const MockSftpClient = jest.fn().mockImplementation(() => ({
  connect: jest.fn(),
  put: jest.fn(),
  get: jest.fn(),
  stat: jest.fn(),
  mkdir: jest.fn(),
  list: jest.fn(),
  delete: jest.fn(),
  end: jest.fn(),
  cwd: jest.fn()
}));

require('ssh2-sftp-client').mockImplementation(MockSftpClient);

describe('SftpClient', () => {
  let sftpClient;
  let mockClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create SFTP client instance
    const config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass'
    };
    
    sftpClient = new SftpClient(config);
    mockClient = sftpClient.client;
  });

  describe('constructor', () => {
    test('should create instance with config', () => {
      const config = {
        host: 'test.com',
        port: 22,
        username: 'user',
        password: 'pass'
      };
      
      const client = new SftpClient(config);
      
      expect(client.config).toEqual(config);
      expect(MockSftpClient).toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    test('should connect with password authentication', async () => {
      mockClient.connect.mockResolvedValueOnce();
      mockClient.cwd.mockResolvedValueOnce('/home/user');
      
      await sftpClient.connect();
      
      expect(mockClient.connect).toHaveBeenCalledWith({
        host: 'test.example.com',
        port: 22,
        username: 'testuser',
        password: 'testpass',
        compress: 'zlib@openssh.com'
      });
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Connecting to'));
    });

    test('should connect with private key authentication', async () => {
      const clientWithKey = new SftpClient({
        host: 'test.com',
        port: 22,
        username: 'user',
        privateKey: 'fake-key-data'
      });
      clientWithKey.client.connect.mockResolvedValueOnce();
      clientWithKey.client.cwd.mockResolvedValueOnce('/home/user');
      
      await clientWithKey.connect();
      
      expect(clientWithKey.client.connect).toHaveBeenCalledWith({
        host: 'test.com',
        port: 22,
        username: 'user',
        privateKey: 'fake-key-data',
        compress: 'zlib@openssh.com'
      });
    });

    test('should connect without compression when disabled', async () => {
      const clientNoCompression = new SftpClient({
        host: 'test.com',
        port: 22,
        username: 'user',
        password: 'pass',
        compression: false
      });
      clientNoCompression.client.connect.mockResolvedValueOnce();
      clientNoCompression.client.cwd.mockResolvedValueOnce('/home/user');
      
      await clientNoCompression.connect();
      
      expect(clientNoCompression.client.connect).toHaveBeenCalledWith({
        host: 'test.com',
        port: 22,
        username: 'user',
        password: 'pass'
      });
    });

    test('should handle connection failure', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(sftpClient.connect()).rejects.toThrow('Failed to connect to SFTP server: Connection failed');
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
    });

    test('should handle cwd failure gracefully', async () => {
      mockClient.connect.mockResolvedValueOnce();
      mockClient.cwd.mockRejectedValueOnce(new Error('CWD failed'));
      
      await sftpClient.connect();
      
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Could not get current working directory'));
    });
  });

  describe('uploadFile', () => {
    test('should upload file successfully', async () => {
      mockClient.put.mockResolvedValueOnce();
      mockClient.stat.mockResolvedValueOnce({ isDirectory: true });
      
      await sftpClient.uploadFile('/local/file.txt', '/remote/file.txt');
      
      expect(mockClient.put).toHaveBeenCalledWith('/local/file.txt', '/remote/file.txt');
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Upload successful'));
    });

    test('should handle upload failure', async () => {
      mockClient.put.mockRejectedValueOnce(new Error('Upload failed'));
      mockClient.stat.mockResolvedValueOnce({ isDirectory: true });
      
      await expect(sftpClient.uploadFile('/local/file.txt', '/remote/file.txt')).rejects.toThrow('Failed to upload file /local/file.txt: Upload failed');
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Upload failed'));
    });

    test('should create remote directory if needed', async () => {
      mockClient.put.mockResolvedValueOnce();
      mockClient.stat.mockRejectedValueOnce(new Error('Not found'));
      mockClient.mkdir.mockResolvedValueOnce();
      
      await sftpClient.uploadFile('/local/file.txt', '/remote/subdir/file.txt');
      
      expect(mockClient.mkdir).toHaveBeenCalledWith('/remote/subdir', true);
      expect(mockClient.put).toHaveBeenCalledWith('/local/file.txt', '/remote/subdir/file.txt');
    });
  });

  describe('downloadFile', () => {
    test('should download file successfully', async () => {
      mockClient.get.mockResolvedValueOnce();
      fs.mkdir.mockResolvedValueOnce();
      
      await sftpClient.downloadFile('/remote/file.txt', '/local/file.txt');
      
      expect(fs.mkdir).toHaveBeenCalledWith('/local', { recursive: true });
      expect(mockClient.get).toHaveBeenCalledWith('/remote/file.txt', '/local/file.txt');
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Download successful'));
    });

    test('should handle download failure', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('Download failed'));
      fs.mkdir.mockResolvedValueOnce();
      
      await expect(sftpClient.downloadFile('/remote/file.txt', '/local/file.txt')).rejects.toThrow('Failed to download file /remote/file.txt: Download failed');
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Download failed'));
    });
  });

  describe('exists', () => {
    test('should return true when file exists', async () => {
      mockClient.stat.mockResolvedValueOnce({ isFile: true });
      
      const exists = await sftpClient.exists('/remote/file.txt');
      
      expect(exists).toBe(true);
      expect(mockClient.stat).toHaveBeenCalledWith('/remote/file.txt');
    });

    test('should return false when file does not exist', async () => {
      mockClient.stat.mockRejectedValueOnce(new Error('File not found'));
      
      const exists = await sftpClient.exists('/remote/file.txt');
      
      expect(exists).toBe(false);
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('File does not exist'));
    });
  });

  describe('ensureRemoteDir', () => {
    test('should skip root directory', async () => {
      await sftpClient.ensureRemoteDir('/');
      
      expect(mockClient.stat).not.toHaveBeenCalled();
      expect(mockClient.mkdir).not.toHaveBeenCalled();
    });

    test('should skip current directory', async () => {
      await sftpClient.ensureRemoteDir('.');
      
      expect(mockClient.stat).not.toHaveBeenCalled();
      expect(mockClient.mkdir).not.toHaveBeenCalled();
    });

    test('should return early if directory already exists', async () => {
      mockClient.stat.mockResolvedValueOnce({ isDirectory: true });
      
      await sftpClient.ensureRemoteDir('/remote/dir');
      
      expect(mockClient.stat).toHaveBeenCalledWith('/remote/dir');
      expect(mockClient.mkdir).not.toHaveBeenCalled();
    });

    test('should create directory if it does not exist', async () => {
      mockClient.stat.mockRejectedValueOnce(new Error('Not found'));
      mockClient.mkdir.mockResolvedValueOnce();
      
      await sftpClient.ensureRemoteDir('/remote/dir');
      
      expect(mockClient.mkdir).toHaveBeenCalledWith('/remote/dir', true);
    });

    test('should handle path that exists but is not a directory', async () => {
      mockClient.stat.mockResolvedValueOnce({ isDirectory: false });
      mockClient.mkdir.mockResolvedValueOnce();
      
      await sftpClient.ensureRemoteDir('/remote/dir');
      
      expect(mockClient.mkdir).toHaveBeenCalledWith('/remote/dir', true);
    });

    test('should handle mkdir failure', async () => {
      mockClient.stat.mockRejectedValueOnce(new Error('Not found'));
      mockClient.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(sftpClient.ensureRemoteDir('/remote/dir')).rejects.toThrow('Failed to create remote directory /remote/dir: Permission denied');
    });

    test('should ignore mkdir error if directory already exists', async () => {
      mockClient.stat.mockRejectedValueOnce(new Error('Not found'));
      mockClient.mkdir.mockRejectedValueOnce(new Error('Directory exists'));
      
      await sftpClient.ensureRemoteDir('/remote/dir');
      
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Directory creation ignored'));
    });
  });

  describe('listRemoteFiles', () => {
    test('should list files recursively', async () => {
      mockClient.list
        .mockResolvedValueOnce([
          { name: 'file1.txt', type: '-' },
          { name: 'subdir', type: 'd' }
        ])
        .mockResolvedValueOnce([
          { name: 'file2.txt', type: '-' }
        ]);
      
      const files = await sftpClient.listRemoteFiles('/remote');
      
      expect(files).toEqual(['/remote/file1.txt', '/remote/subdir/file2.txt']);
      expect(mockClient.list).toHaveBeenCalledWith('/remote');
      expect(mockClient.list).toHaveBeenCalledWith('/remote/subdir');
    });

    test('should handle list failure', async () => {
      mockClient.list.mockRejectedValueOnce(new Error('List failed'));
      
      await expect(sftpClient.listRemoteFiles('/remote')).rejects.toThrow('Failed to list remote files: List failed');
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('List files failed'));
    });

    test('should handle empty directory', async () => {
      mockClient.list.mockResolvedValueOnce([]);
      
      const files = await sftpClient.listRemoteFiles('/remote');
      
      expect(files).toEqual([]);
    });

    test('should handle mixed file types', async () => {
      mockClient.list.mockResolvedValueOnce([
        { name: 'file.txt', type: '-' },
        { name: 'link', type: 'l' },
        { name: 'device', type: 'c' },
        { name: 'dir', type: 'd' }
      ]).mockResolvedValueOnce([]);
      
      const files = await sftpClient.listRemoteFiles('/remote');
      
      expect(files).toEqual(['/remote/file.txt']);
    });
  });

  describe('deleteFile', () => {
    test('should delete file successfully', async () => {
      mockClient.delete.mockResolvedValueOnce();
      
      await sftpClient.deleteFile('/remote/file.txt');
      
      expect(mockClient.delete).toHaveBeenCalledWith('/remote/file.txt');
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Delete successful'));
    });

    test('should handle delete failure', async () => {
      mockClient.delete.mockRejectedValueOnce(new Error('Delete failed'));
      
      await expect(sftpClient.deleteFile('/remote/file.txt')).rejects.toThrow('Failed to delete file /remote/file.txt: Delete failed');
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Delete failed'));
    });
  });

  describe('disconnect', () => {
    test('should disconnect successfully', async () => {
      mockClient.end.mockResolvedValueOnce();
      
      await sftpClient.disconnect();
      
      expect(mockClient.end).toHaveBeenCalled();
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Disconnect successful'));
    });

    test('should handle disconnect failure gracefully', async () => {
      mockClient.end.mockRejectedValueOnce(new Error('Disconnect failed'));
      
      await sftpClient.disconnect();
      
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Disconnect error (ignored)'));
    });
  });
});
