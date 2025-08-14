const core = require('@actions/core');
const path = require('path');
const FtpClient = require('./ftp-client');
const SftpClient = require('./sftp-client');
const FileScanner = require('./file-scanner');
const StateManager = require('./state-manager');

async function run() {
  try {
    // Get inputs
    const host = core.getInput('host', { required: true });
    const port = parseInt(core.getInput('port') || '21');
    const username = core.getInput('username', { required: true });
    const password = core.getInput('password');
    const privateKey = core.getInput('private-key') || core.getInput('private_key');
    const protocol = core.getInput('protocol') || 'ftp';
    const localPath = core.getInput('local-path') || core.getInput('local_path') || './';
    const remotePath = core.getInput('remote-path') || core.getInput('remote_path') || '/';
    const exclude = core.getInput('exclude');
    const dryRun = core.getInput('dry-run') === 'true' || core.getInput('dry_run') === 'true';
    const deleteOrphaned = core.getInput('delete-orphaned') === 'true' || core.getInput('delete_orphaned') === 'true';
    const stateFilePath = core.getInput('state-file-path') || core.getInput('state_file_path') || '.ftp-sync-state.json';
    const forceFullSync = core.getInput('force-full-sync') === 'true' || core.getInput('force_full_sync') === 'true';
    
    core.info(`Starting ${protocol.toUpperCase()} sync from ${localPath} to ${remotePath}`);
    
    // Validate inputs
    if (protocol === 'sftp' && !privateKey && !password) {
      throw new Error('SFTP requires either a password or private key');
    }

    // Initialize state manager
    const stateManager = new StateManager(stateFilePath);

    // Scan local files
    const fileScanner = new FileScanner();
    const localFiles = await fileScanner.scanFiles(localPath, exclude);
    core.info(`Found ${localFiles.length} local files to analyze`);

    // Build local state with MD5 hashes
    core.info('Calculating MD5 checksums for local files...');
    const localState = await stateManager.buildLocalState(localFiles);
    core.info('Local state analysis complete');

    // Create client based on protocol
    let client;
    if (protocol === 'sftp') {
      client = new SftpClient({
        host,
        port,
        username,
        password,
        privateKey
      });
    } else {
      client = new FtpClient({
        host,
        port,
        username,
        password
      });
    }

    // Connect to server
    await client.connect();
    core.info(`Connected to ${protocol.toUpperCase()} server ${host}:${port}`);

    let filesUploaded = 0;
    let filesDeleted = 0;
    let comparison;

    try {
      // Get remote state (unless forcing full sync)
      let remoteState = null;
      if (!forceFullSync) {
        core.info('Downloading remote state file...');
        remoteState = await stateManager.downloadRemoteState(client, remotePath);
        if (remoteState) {
          core.info(`Remote state found with ${Object.keys(remoteState.files).length} files`);
        } else {
          core.info('No remote state found, performing full sync');
        }
      } else {
        core.info('Force full sync enabled, ignoring remote state');
      }

      // Compare states to determine what needs to be synced
      comparison = stateManager.compareStates(localState, remoteState);
      const summary = stateManager.generateSyncSummary(comparison, forceFullSync);
      
      core.info(`Sync analysis: ${summary.summary}`);
      core.info(`Plan: Upload ${summary.toUpload} files, Delete ${summary.toDelete} files`);

      // Upload changed/new files
      for (const fileInfo of comparison.filesToUpload) {
        const localFilePath = fileInfo.localPath;
        const remoteFilePath = path.posix.join(remotePath, fileInfo.remotePath);
        
        if (dryRun) {
          core.info(`[DRY RUN] Would upload (${fileInfo.action}): ${localFilePath} -> ${remoteFilePath}`);
        } else {
          await client.uploadFile(localFilePath, remoteFilePath);
          core.info(`Uploaded (${fileInfo.action}): ${localFilePath} -> ${remoteFilePath}`);
          filesUploaded++;
        }
      }

      // Handle orphaned files deletion
      if (deleteOrphaned && comparison.filesToDelete.length > 0) {
        for (const remoteFile of comparison.filesToDelete) {
          const fullRemotePath = path.posix.join(remotePath, remoteFile);
          
          if (dryRun) {
            core.info(`[DRY RUN] Would delete orphaned file: ${fullRemotePath}`);
          } else {
            await client.deleteFile(fullRemotePath);
            core.info(`Deleted orphaned file: ${fullRemotePath}`);
            filesDeleted++;
          }
        }
      }

      // Upload updated state file (unless dry run)
      if (!dryRun) {
        core.info('Uploading updated state file...');
        await stateManager.uploadState(client, localState, remotePath);
        core.info('State file updated successfully');
      }

      // Set outputs
      core.setOutput('files-uploaded', filesUploaded.toString());
      core.setOutput('files-deleted', filesDeleted.toString());
      core.setOutput('sync-status', 'success');

      core.info(`Sync completed successfully. Uploaded: ${filesUploaded}, Deleted: ${filesDeleted}`);

    } finally {
      await client.disconnect();
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    core.setOutput('sync-status', 'failed');
  }
}

run();
