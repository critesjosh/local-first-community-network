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
import * as Crypto from 'expo-crypto';

// Configure @noble libraries to use expo-crypto for random bytes
const getSecureRandomBytes = async (length: number): Promise<Uint8Array> => {
  const bytes = await Crypto.getRandomBytesAsync(length);
  return new Uint8Array(bytes);
};

// Set up async random for both libraries
ed.etc.randomBytes = getSecureRandomBytes;
secp.etc.randomBytes = getSecureRandomBytes;

console.log('[CryptoConfig] Configured @noble libraries to use expo-crypto');

export {};
