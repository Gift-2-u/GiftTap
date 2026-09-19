// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Required for @solana-mobile/* package exports (MWA encoding subpath)
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
