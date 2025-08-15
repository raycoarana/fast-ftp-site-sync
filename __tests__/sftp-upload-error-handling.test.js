const SftpClient = require('../src/sftp-client');
const fs = require('fs').promises;
const path = require('path');

// Mock the ssh2-sftp-client
jest.mock('ssh2-sftp-client');
const MockSftpClient = require('ssh2-sftp-client');

describe('SFTP Upload Error Handling', () => {
  let sftpClient;
  let mockClient;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock client instance
    mockClient = {
      connect: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      stat: jest.fn(),
      mkdir: jest.fn(),
      end: jest.fn()
    };
    
    // Mock the constructor to return our mock client
    MockSftpClient.mockImplementation(() => mockClient);
    
    // Create SFTP client instance
    sftpClient = new SftpClient({
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass'
    });
  });

  test('should handle Write stream error by deleting and retrying', async () => {
    const localPath = '/local/test.txt';
    const remotePath = '/remote/test.txt';
    
    // Mock stat to return directory info for ensureRemoteDir
    mockClient.stat
      .mockResolvedValueOnce({ isDirectory: () => true }) // For directory check
      .mockResolvedValueOnce({ isFile: () => true }); // For file exists check
    
    // First put call fails with Write stream error
    mockClient.put
      .mockRejectedValueOnce(new Error('_put: Write stream error: Failure /remote/test.txt'))
      .mockResolvedValueOnce(); // Second put call succeeds
    
    // Delete succeeds
    mockClient.delete.mockResolvedValueOnce();

    await sftpClient.uploadFile(localPath, remotePath);

    // Verify the sequence of calls
    expect(mockClient.put).toHaveBeenCalledTimes(2);
    expect(mockClient.put).toHaveBeenCalledWith(localPath, remotePath, { 
      writeStreamOptions: { flags: 'w' } 
    });
    expect(mockClient.delete).toHaveBeenCalledWith(remotePath);
  });

  test('should handle Write stream error when file does not exist', async () => {
    const localPath = '/local/test.txt';
    const remotePath = '/remote/test.txt';
    
    // Mock stat to return directory info for ensureRemoteDir, then fail for file exists
    mockClient.stat
      .mockResolvedValueOnce({ isDirectory: () => true }) // For directory check
      .mockRejectedValueOnce(new Error('No such file')); // File doesn't exist
    
    // First put call fails with Write stream error
    mockClient.put
      .mockRejectedValueOnce(new Error('_put: Write stream error: Failure /remote/test.txt'))
      .mockResolvedValueOnce(); // Second put call succeeds

    await sftpClient.uploadFile(localPath, remotePath);

    // Verify the sequence of calls
    expect(mockClient.put).toHaveBeenCalledTimes(2);
    expect(mockClient.delete).not.toHaveBeenCalled(); // Should not try to delete non-existent file
  });

  test('should throw error if retry also fails', async () => {
    const localPath = '/local/test.txt';
    const remotePath = '/remote/test.txt';
    
    // Mock stat to return directory info for ensureRemoteDir
    mockClient.stat
      .mockResolvedValueOnce({ isDirectory: () => true }) // For directory check
      .mockResolvedValueOnce({ isFile: () => true }); // For file exists check
    
    // Both put calls fail
    mockClient.put
      .mockRejectedValueOnce(new Error('_put: Write stream error: Failure /remote/test.txt'))
      .mockRejectedValueOnce(new Error('Still failing'));
    
    // Delete succeeds
    mockClient.delete.mockResolvedValueOnce();

    await expect(sftpClient.uploadFile(localPath, remotePath))
      .rejects.toThrow('Failed to upload file /local/test.txt after retry: Still failing');

    expect(mockClient.put).toHaveBeenCalledTimes(2);
    expect(mockClient.delete).toHaveBeenCalledWith(remotePath);
  });

  test('should use writeStreamOptions with flags w for overwrite', async () => {
    const localPath = '/local/test.txt';
    const remotePath = '/remote/test.txt';
    
    // Mock stat to return directory info for ensureRemoteDir
    mockClient.stat.mockResolvedValueOnce({ isDirectory: () => true });
    
    // Put succeeds on first try
    mockClient.put.mockResolvedValueOnce();

    await sftpClient.uploadFile(localPath, remotePath);

    expect(mockClient.put).toHaveBeenCalledWith(localPath, remotePath, { 
      writeStreamOptions: { flags: 'w' } 
    });
  });
});
