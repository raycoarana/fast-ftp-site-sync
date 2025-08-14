const glob = require('glob');
const path = require('path');
const fs = require('fs').promises;
const { minimatch } = require('minimatch');

class FileScanner {
  async scanFiles(localPath, excludePattern) {
    try {
      const files = [];
      const excludePatterns = excludePattern ? excludePattern.split(',').map(p => p.trim()) : [];
      
      // Normalize local path
      const normalizedLocalPath = path.resolve(localPath);
      
      // Use glob to find all files recursively
      const pattern = path.join(normalizedLocalPath, '**/*');
      const foundFiles = await glob.glob(pattern, { 
        nodir: true,  // Only files, no directories
        dot: true     // Include hidden files
      });
      
      for (const filePath of foundFiles) {
        const relativePath = path.relative(normalizedLocalPath, filePath);
        
        // Check if file should be excluded
        if (this.shouldExclude(relativePath, excludePatterns)) {
          continue;
        }
        
        const stats = await fs.stat(filePath);
        
        files.push({
          path: filePath,
          relativePath: relativePath,
          remotePath: relativePath.replace(/\\/g, '/'), // Use forward slashes for remote paths
          size: stats.size,
          mtime: stats.mtime
        });
      }
      
      return files;
    } catch (error) {
      throw new Error(`Failed to scan files: ${error.message}`);
    }
  }
  
  shouldExclude(filePath, excludePatterns) {
    // Default exclusions
    const defaultExclusions = [
      '.git/**',
      '.github/**',
      'node_modules/**',
      '.DS_Store',
      'Thumbs.db',
      '*.tmp',
      '*.log'
    ];
    
    const allPatterns = [...defaultExclusions, ...excludePatterns];
    
    return allPatterns.some(pattern => {
      return minimatch(filePath, pattern) || minimatch(filePath, pattern.replace(/\\/g, '/'));
    });
  }
}

module.exports = FileScanner;
