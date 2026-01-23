const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate a unique build hash using timestamp and random bytes
const timestamp = Date.now().toString(36);
const random = crypto.randomBytes(4).toString('hex');
const hash = `${timestamp}-${random}`;
const buildTime = new Date().toISOString();

const versionData = {
  hash,
  buildTime
};

// Write to public directory so it's included in the build (for server to read)
const publicPath = path.join(__dirname, '..', 'public', 'build-version.json');
fs.writeFileSync(publicPath, JSON.stringify(versionData, null, 2));

// Write to src directory as importable module (for frontend to import at build time)
const srcPath = path.join(__dirname, '..', 'src', 'buildVersion.js');
fs.writeFileSync(srcPath, `// Auto-generated at build time - do not edit
export const BUILD_HASH = '${hash}';
export const BUILD_TIME = '${buildTime}';
`);

// Update service worker cache name with build hash
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(
  /const CACHE_NAME = '[^']+';/,
  `const CACHE_NAME = 'hdhr-monitor-${hash}';`
);
fs.writeFileSync(swPath, swContent);

console.log(`Build version generated: ${hash}`);
