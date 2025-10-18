/**
 * Crypto configuration for @noble libraries
 *
 * Polyfills crypto.subtle.digest for React Native using @noble/hashes.
 * This is critical for @noble/ed25519 which requires SHA-512.
 */

import {sha512} from '@noble/hashes/sha2.js';

// Polyfill crypto.subtle for @noble/ed25519
// The library checks for crypto.subtle and uses it for SHA-512 hashing
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {};
}

if (!globalThis.crypto.subtle) {
  (globalThis.crypto as any).subtle = {
    digest: async (algorithm: string | {name: string}, data: Uint8Array | ArrayBuffer) => {
      const algoName = typeof algorithm === 'string' ? algorithm : algorithm.name;
      
      if (algoName === 'SHA-512' || algoName === 'sha-512' || algoName === 'SHA512') {
        // Convert input to Uint8Array if it's an ArrayBuffer
        const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        
        // sha512 returns a Uint8Array, but crypto.subtle.digest must return an ArrayBuffer
        const hash = sha512(input);
        
        // Convert Uint8Array to ArrayBuffer
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
      }
      
      throw new Error(`Unsupported algorithm: ${algoName}`);
    }
  };
  
  console.log('[CryptoConfig] Polyfilled crypto.subtle.digest for React Native');
}

export {};
