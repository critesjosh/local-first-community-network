// Set up global crypto object for compatibility
// React Native should have crypto.subtle via Hermes, but ensure it's accessible
if (typeof global.crypto !== 'object') {
  global.crypto = {};
}

// Ensure crypto is available globally (not just global.crypto)
if (typeof crypto === 'undefined' && typeof global.crypto !== 'undefined') {
  global.crypto = crypto || global.crypto;
}

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
