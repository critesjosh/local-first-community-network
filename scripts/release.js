#!/usr/bin/env node

/**
 * Release Script for Local Community Network
 * 
 * Usage:
 * node scripts/release.js ota          - Deploy OTA update
 * node scripts/release.js patch        - Create patch release (1.0.0 → 1.0.1)
 * node scripts/release.js minor        - Create minor release (1.0.0 → 1.1.0)
 * node scripts/release.js major        - Create major release (1.0.0 → 2.0.0)
 * node scripts/release.js hotfix       - Emergency OTA hotfix
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const releaseType = process.argv[2];

if (!releaseType) {
  console.error('❌ Please specify release type: ota, patch, minor, major, or hotfix');
  process.exit(1);
}

const validTypes = ['ota', 'patch', 'minor', 'major', 'hotfix'];
if (!validTypes.includes(releaseType)) {
  console.error(`❌ Invalid release type. Must be one of: ${validTypes.join(', ')}`);
  process.exit(1);
}

// Get current version
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const currentVersion = packageJson.version;

console.log(`🚀 Starting ${releaseType} release from version ${currentVersion}`);

try {
  switch (releaseType) {
    case 'ota':
      console.log('📱 Deploying OTA update...');
      execSync('yarn update:production', { stdio: 'inherit' });
      console.log('✅ OTA update deployed successfully!');
      break;

    case 'hotfix':
      console.log('🚨 Deploying emergency hotfix...');
      execSync('yarn hotfix', { stdio: 'inherit' });
      console.log('✅ Hotfix deployed successfully!');
      break;

    case 'patch':
    case 'minor':
    case 'major':
      console.log(`📦 Creating ${releaseType} release...`);
      
      // Bump version
      console.log(`📈 Bumping ${releaseType} version...`);
      execSync(`yarn version:${releaseType}`, { stdio: 'inherit' });
      
      // Build for production
      console.log('🔨 Building for production...');
      execSync('yarn build:ios:production', { stdio: 'inherit' });
      
      // Submit to app store
      console.log('📤 Submitting to App Store...');
      execSync('yarn submit:ios', { stdio: 'inherit' });
      
      console.log(`✅ ${releaseType} release completed successfully!`);
      console.log('📱 App will be available after App Store review (1-7 days)');
      break;

    default:
      console.error(`❌ Unknown release type: ${releaseType}`);
      process.exit(1);
  }

  console.log('\n🎉 Release process completed!');
  
  if (releaseType === 'ota' || releaseType === 'hotfix') {
    console.log('📱 Users will receive the update immediately');
  } else {
    console.log('📱 Users will receive the update after App Store review');
  }

} catch (error) {
  console.error('❌ Release failed:', error.message);
  process.exit(1);
}
