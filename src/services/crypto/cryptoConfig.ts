/**
 * Crypto configuration for @noble libraries
 *
 * Configures @noble/ed25519 and @noble/secp256k1 to use expo-crypto
 * for secure random number generation.
 *
 * This must be imported before any cryptographic operations.
 */

import * as ed from '@noble/ed25519';
import * as secp from '@noble/secp256k1';

// Note: With react-native-get-random-values polyfill imported in index.js,
// the @noble libraries will automatically use crypto.getRandomValues()
// which is now available globally.

// For versions of @noble that support the etc.randomBytes API, configure them
// to use expo-crypto for additional async random generation if needed
try {
  // Only configure if the API exists
  if (ed.etc && typeof ed.etc === 'object') {
    const Crypto = require('expo-crypto');
    const getSecureRandomBytes = async (length: number): Promise<Uint8Array> => {
      const bytes = await Crypto.getRandomBytesAsync(length);
      return new Uint8Array(bytes);
    };
    
    ed.etc.randomBytes = getSecureRandomBytes;
    console.log('[CryptoConfig] Configured @noble/ed25519 to use expo-crypto');
  }
  
  if (secp.etc && typeof secp.etc === 'object') {
    const Crypto = require('expo-crypto');
    const getSecureRandomBytes = async (length: number): Promise<Uint8Array> => {
      const bytes = await Crypto.getRandomBytesAsync(length);
      return new Uint8Array(bytes);
    };
    
    secp.etc.randomBytes = getSecureRandomBytes;
    console.log('[CryptoConfig] Configured @noble/secp256k1 to use expo-crypto');
  }
} catch (error) {
  // In test environment or if expo-crypto is not available, 
  // the polyfill from react-native-get-random-values will be used
  console.log('[CryptoConfig] Using react-native-get-random-values polyfill');
}

export {};
