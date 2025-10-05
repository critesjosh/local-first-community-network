module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/setup\\.ts$',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-keychain|react-native-sqlite-storage|@noble/ed25519|@noble/secp256k1|@noble/hashes|@react-native-community|react-native-image-picker)/)',
  ],
  moduleNameMapper: {
    '@noble/ed25519': '<rootDir>/__mocks__/@noble/ed25519.js',
    '@react-native-community/datetimepicker': '<rootDir>/__mocks__/@react-native-community/datetimepicker.js',
    'react-native-image-picker': '<rootDir>/__mocks__/react-native-image-picker.js',
  },
};
