const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the packages directory for changes
config.watchFolders = [
  path.resolve(__dirname, 'packages'),
];

// Resolve symlinked modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, 'packages/rn-bluetooth/node_modules'),
];

module.exports = config;
