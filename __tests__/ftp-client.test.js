// Mock basic-ftp
const mockClient = {
  access: jest.fn(),
  close: jest.fn(),
  uploadFrom: jest.fn(),
  downloadTo: jest.fn(),
  size: jest.fn(),
  pwd: jest.fn(),
  cd: jest.fn(),
  clearWorkingDir: jest.fn(),
  list: jest.fn(),
  remove: jest.fn(),
  removeDir: jest.fn(),
  send: jest.fn()
};

const MockFtpClient = jest.fn().mockImplementation(() => mockClient);

jest.mock('basic-ftp', () => ({
  Client: MockFtpClient
}));

// Mock fs.promises separately
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn()
  }
}));

const FtpClient = require('../src/ftp-client');
const fs = require('fs').promises;

describe('FtpClient', () => {
  let ftpClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create FTP client instance
    const config = {
      host: 'test.example.com',
      port: 21,
      username: 'testuser',
      password: 'testpass'
    };
    
    ftpClient = new FtpClient(config);
  });

  describe('constructor', () => {
    test('should create instance with config', () => {
      const config = {
        host: 'test.com',
        port: 21,
        username: 'user',
        password: 'pass'
      };
      
      const client = new FtpClient(config);
      
      expect(client.config).toEqual(config);
      expect(client.timeout).toBe(10000); // Default timeout
      expect(MockFtpClient).toHaveBeenCalled();
    });

    test('should create instance with custom timeout', () => {
      const config = {
        host: 'test.com',
        port: 21,
        username: 'user',
        password: 'pass',
        timeout: 5000 // Custom 5-second timeout
      };
      
      const client = new FtpClient(config);
      
      expect(client.config).toEqual(config);
      expect(client.timeout).toBe(5000); // Custom timeout
      expect(MockFtpClient).toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    test('should connect successfully', async () => {
      mockClient.access.mockResolvedValueOnce();
      
      await ftpClient.connect();
      
      expect(mockClient.access).toHaveBeenCalledWith({
        host: 'test.example.com',
        port: 21,
        user: 'testuser',
        password: 'testpass',
        secure: false
      });
    });

    test('should handle connection failure', async () => {
      mockClient.access.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(ftpClient.connect()).rejects.toThrow('Failed to connect to FTP server: Connection failed');
      expect(mockClient.close).toHaveBeenCalled();
    });

    test('should handle connection timeout', async () => {
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Mock a connection that never resolves
      mockClient.access.mockImplementationOnce(() => new Promise(() => {}));
      
      // Start the connection attempt
      const connectPromise = ftpClient.connect();
      
      // Fast-forward time by the default timeout (10 seconds)
      jest.advanceTimersByTime(10000);
      
      // Check that it rejects with timeout error
      await expect(connectPromise).rejects.toThrow('Connection timeout after 10 seconds');
      expect(mockClient.close).toHaveBeenCalled();
      
      // Restore real timers
      jest.useRealTimers();
    });

    test('should handle connection timeout with custom timeout value', async () => {
      // Create FTP client with custom 3-second timeout
      const customConfig = {
        host: 'test.example.com',
        port: 21,
        username: 'testuser',
        password: 'testpass',
        timeout: 3000 // 3 seconds
      };
      const customFtpClient = new FtpClient(customConfig);
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Mock a connection that never resolves
      mockClient.access.mockImplementationOnce(() => new Promise(() => {}));
      
      // Start the connection attempt
      const connectPromise = customFtpClient.connect();
      
      // Fast-forward time by the custom timeout (3 seconds)
      jest.advanceTimersByTime(3000);
      
      // Check that it rejects with custom timeout error
      await expect(connectPromise).rejects.toThrow('Connection timeout after 3 seconds');
      expect(mockClient.close).toHaveBeenCalled();
      
      // Restore real timers
      jest.useRealTimers();
    });

    test('should handle MKD error that is not about existing directory', async () => {
      mockClient.cd.mockRejectedValueOnce(new Error('Directory does not exist')).mockResolvedValueOnce();
      const error = new Error('Permission denied');
      error.code = 550;
      error.message = 'Permission denied';
      mockClient.send.mockRejectedValueOnce(error);
      
      await expect(ftpClient.ensureRemoteDir('testdir')).rejects.toThrow('Failed to create remote directory testdir: Permission denied');
    });
  });

  describe('uploadFile', () => {
    test('should upload file to root directory', async () => {
      mockClient.pwd.mockResolvedValueOnce('/');
      mockClient.uploadFrom.mockResolvedValueOnce();
      
      await ftpClient.uploadFile('/local/file.txt', 'file.txt');
      
      expect(mockClient.uploadFrom).toHaveBeenCalledWith('/local/file.txt', 'file.txt');
      expect(mockClient.cd).not.toHaveBeenCalled();
    });

    test('should upload file to subdirectory', async () => {
      mockClient.pwd.mockResolvedValueOnce('/').mockResolvedValueOnce('/subdir');
      mockClient.cd.mockResolvedValueOnce().mockResolvedValueOnce();
      mockClient.uploadFrom.mockResolvedValueOnce();
      mockClient.send.mockResolvedValueOnce(); // For MKD command
      
      await ftpClient.uploadFile('/local/file.txt', 'subdir/file.txt');
      
      expect(mockClient.cd).toHaveBeenCalledWith('subdir');
      expect(mockClient.uploadFrom).toHaveBeenCalledWith('/local/file.txt', 'file.txt');
      expect(mockClient.cd).toHaveBeenCalledWith('/'); // Return to original dir
    });

    test('should handle upload failure', async () => {
      mockClient.pwd.mockResolvedValueOnce('/');
      mockClient.uploadFrom.mockRejectedValueOnce(new Error('Upload failed'));
      
      await expect(ftpClient.uploadFile('/local/file.txt', 'file.txt')).rejects.toThrow('Failed to upload file /local/file.txt: Upload failed');
    });

    test('should handle directory creation during upload', async () => {
      mockClient.pwd.mockResolvedValueOnce('/').mockResolvedValueOnce('/deep/nested');
      mockClient.cd
        .mockRejectedValueOnce(new Error('Directory does not exist')) // deep
        .mockRejectedValueOnce(new Error('Directory does not exist')) // deep/nested
        .mockResolvedValueOnce(); // Return to root after upload
      mockClient.uploadFrom.mockResolvedValueOnce();
      mockClient.send
        .mockResolvedValueOnce() // MKD deep
        .mockResolvedValueOnce(); // MKD deep/nested
      
      await ftpClient.uploadFile('/local/file.txt', 'deep/nested/file.txt');
      
      expect(mockClient.send).toHaveBeenCalledWith('MKD deep');
      expect(mockClient.send).toHaveBeenCalledWith('MKD deep/nested');
      expect(mockClient.cd).toHaveBeenCalledWith('deep/nested');
      expect(mockClient.uploadFrom).toHaveBeenCalledWith('/local/file.txt', 'file.txt');
    });

    test('should handle directory creation failure gracefully', async () => {
      mockClient.pwd.mockResolvedValueOnce('/').mockResolvedValueOnce('/subdir');
      mockClient.cd.mockResolvedValueOnce().mockResolvedValueOnce();
      mockClient.uploadFrom.mockResolvedValueOnce();
      mockClient.send.mockRejectedValueOnce(new Error('MKD failed')); // Directory might already exist
      
      await ftpClient.uploadFile('/local/file.txt', 'subdir/file.txt');
      
      expect(mockClient.uploadFrom).toHaveBeenCalledWith('/local/file.txt', 'file.txt');
    });
  });

  describe('downloadFile', () => {
    test('should download file successfully', async () => {
      mockClient.downloadTo.mockResolvedValueOnce();
      fs.mkdir.mockResolvedValueOnce();
      
      await ftpClient.downloadFile('/remote/file.txt', '/local/file.txt');
      
      expect(fs.mkdir).toHaveBeenCalledWith('/local', { recursive: true });
      expect(mockClient.downloadTo).toHaveBeenCalledWith('/local/file.txt', '/remote/file.txt');
    });

    test('should handle download failure', async () => {
      mockClient.downloadTo.mockRejectedValueOnce(new Error('Download failed'));
      fs.mkdir.mockResolvedValueOnce();
      
      await expect(ftpClient.downloadFile('/remote/file.txt', '/local/file.txt')).rejects.toThrow('Failed to download file /remote/file.txt: Download failed');
    });
  });

  describe('exists', () => {
    test('should return true when file exists', async () => {
      mockClient.size.mockResolvedValueOnce(1024);
      
      const exists = await ftpClient.exists('/remote/file.txt');
      
      expect(exists).toBe(true);
      expect(mockClient.size).toHaveBeenCalledWith('/remote/file.txt');
    });

    test('should return false when file does not exist', async () => {
      mockClient.size.mockRejectedValueOnce(new Error('File not found'));
      
      const exists = await ftpClient.exists('/remote/file.txt');
      
      expect(exists).toBe(false);
    });
  });

  describe('ensureRemoteDir', () => {
    test('should skip root directory', async () => {
      await ftpClient.ensureRemoteDir('/');
      
      expect(mockClient.send).not.toHaveBeenCalled();
    });

    test('should skip current directory', async () => {
      await ftpClient.ensureRemoteDir('.');
      
      expect(mockClient.send).not.toHaveBeenCalled();
    });

    test('should skip empty directory', async () => {
      await ftpClient.ensureRemoteDir('');
      
      expect(mockClient.send).not.toHaveBeenCalled();
    });

    test('should create single directory', async () => {
      mockClient.cd.mockRejectedValueOnce(new Error('Directory does not exist')).mockResolvedValueOnce();
      mockClient.send.mockResolvedValueOnce();
      
      await ftpClient.ensureRemoteDir('testdir');
      
      expect(mockClient.cd).toHaveBeenCalledWith('testdir');
      expect(mockClient.send).toHaveBeenCalledWith('MKD testdir');
    });

    test('should throw error for non-recoverable MKD failures', async () => {
      mockClient.cd.mockRejectedValueOnce(new Error('Directory does not exist'));
      const error = new Error('Permission denied');
      error.code = 550;
      error.message = 'Permission denied'; // Does NOT contain 'exists'
      mockClient.send.mockRejectedValueOnce(error);
      
      // This SHOULD throw because it's not a "directory exists" error
      // Note: Jest mock may not preserve the exact error message, so we check for the wrapper message
      await expect(ftpClient.ensureRemoteDir('testdir')).rejects.toThrow('Failed to create remote directory testdir:');
    });

    test('should skip creating directory if it already exists', async () => {
      // Mock that cd to directory succeeds (directory exists), then cd back to root
      mockClient.cd.mockResolvedValueOnce().mockResolvedValueOnce(); // cd to existingdir, then cd to /
      
      await ftpClient.ensureRemoteDir('existingdir');
      
      expect(mockClient.cd).toHaveBeenCalledWith('existingdir');
      expect(mockClient.cd).toHaveBeenCalledWith('/');
      expect(mockClient.send).not.toHaveBeenCalled();
    });
  });

  describe('listRemoteFiles', () => {
    test('should list files recursively', async () => {
      mockClient.list
        .mockResolvedValueOnce([
          { name: 'file1.txt', type: 1, isFile: true, isDirectory: false },
          { name: 'subdir', type: 2, isFile: false, isDirectory: true }
        ])
        .mockResolvedValueOnce([
          { name: 'file2.txt', type: 1, isFile: true, isDirectory: false }
        ]);
      
      const files = await ftpClient.listRemoteFiles('/remote');
      
      expect(files).toEqual(['/remote/file1.txt', '/remote/subdir/file2.txt']);
      expect(mockClient.list).toHaveBeenCalledWith('/remote');
      expect(mockClient.list).toHaveBeenCalledWith('/remote/subdir');
    });

    test('should handle list failure', async () => {
      mockClient.list.mockRejectedValueOnce(new Error('List failed'));
      
      await expect(ftpClient.listRemoteFiles('/remote')).rejects.toThrow('Failed to list remote files: List failed');
    });

    test('should handle empty directory', async () => {
      mockClient.list.mockResolvedValueOnce([]);
      
      const files = await ftpClient.listRemoteFiles('/remote');
      
      expect(files).toEqual([]);
    });

    test('should handle mixed file types', async () => {
      mockClient.list.mockResolvedValueOnce([
        { name: 'file.txt', type: 1, isFile: true, isDirectory: false },
        { name: 'link', type: 3, isFile: false, isDirectory: false },
        { name: 'dir', type: 2, isFile: false, isDirectory: true }
      ]).mockResolvedValueOnce([]);
      
      const files = await ftpClient.listRemoteFiles('/remote');
      
      expect(files).toEqual(['/remote/file.txt']);
    });
  });

  describe('deleteFile', () => {
    test('should delete file successfully', async () => {
      mockClient.remove.mockResolvedValueOnce();
      
      await ftpClient.deleteFile('/remote/file.txt');
      
      expect(mockClient.remove).toHaveBeenCalledWith('/remote/file.txt');
    });

    test('should handle delete failure', async () => {
      mockClient.remove.mockRejectedValueOnce(new Error('Delete failed'));
      
      await expect(ftpClient.deleteFile('/remote/file.txt')).rejects.toThrow('Failed to delete file /remote/file.txt: Delete failed');
    });
  });

  describe('disconnect', () => {
    test('should disconnect successfully', async () => {
      mockClient.close.mockResolvedValueOnce();
      
      await ftpClient.disconnect();
      
      expect(mockClient.close).toHaveBeenCalled();
    });

    test('should handle disconnect gracefully even if it fails', async () => {
      mockClient.close.mockImplementationOnce(() => {
        throw new Error('Close failed');
      });
      
      // Should not throw - disconnect should be safe to call
      await ftpClient.disconnect();
      
      expect(mockClient.close).toHaveBeenCalled();
    });
  });
});
