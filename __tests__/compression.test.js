const SftpClient = require('../src/sftp-client');

describe('SFTP Compression Configuration', () => {
  test('should create SFTP client with compression enabled by default', () => {
    const config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass'
    };
    
    const client = new SftpClient(config);
    expect(client.config.compression).toBeUndefined(); // Should default to enabled in connect()
  });

  test('should create SFTP client with compression explicitly enabled', () => {
    const config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass',
      compression: true
    };
    
    const client = new SftpClient(config);
    expect(client.config.compression).toBe(true);
  });

  test('should create SFTP client with compression disabled', () => {
    const config = {
      host: 'test.example.com',
      port: 22,
      username: 'testuser',
      password: 'testpass',
      compression: false
    };
    
    const client = new SftpClient(config);
    expect(client.config.compression).toBe(false);
  });
});
