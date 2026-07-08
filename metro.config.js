const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Also resolve from root node_modules as fallback for packages used by src/
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '..', 'node_modules'),
];

config.resolver.assetExts.push('html');

// Block web-only files that cannot be compiled for React Native
config.resolver.blockList = [
  /mobile\/src\/components\/ui\/.*/,
  /mobile\/src\/main\.tsx/,
  /mobile\/src\/App\.css/,
  /mobile\/src\/index\.css/,
  /mobile\/src\/vite-env\.d\.ts/,
];

module.exports = config;
