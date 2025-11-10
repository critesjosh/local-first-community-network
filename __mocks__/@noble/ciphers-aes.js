// Mock for @noble/ciphers/aes.js

// Store encrypted data with their keys for validation
const encryptionMap = new Map();

// Helper to create a key fingerprint
function keyFingerprint(key) {
  return Array.from(key).join(',');
}

// Mock GCM cipher
const mockGcm = jest.fn((key, nonce, aad) => {
  // Validate key size - we only support AES-256 (32 bytes)
  if (key.length !== 32) {
    throw new Error(`Invalid key size: ${key.length}. Expected 32 bytes for AES-256.`);
  }

  const keyFp = keyFingerprint(key);

  return {
    encrypt: jest.fn((plaintext) => {
      // XOR plaintext with key for simple deterministic encryption
      const ciphertext = new Uint8Array(plaintext.length);
      for (let i = 0; i < plaintext.length; i++) {
        ciphertext[i] = plaintext[i] ^ key[i % key.length];
      }

      // Add auth tag (hash of key + ciphertext + nonce)
      const authTag = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        authTag[i] = (key[i % key.length] + ciphertext[i % ciphertext.length] + nonce[i % nonce.length]) % 256;
      }

      const result = new Uint8Array([...ciphertext, ...authTag]);

      // Store the mapping for decryption validation
      const ctFp = Array.from(result).join(',');
      encryptionMap.set(ctFp, keyFp);

      return result;
    }),
    decrypt: jest.fn((ciphertext) => {
      // Extract auth tag
      const ct = ciphertext.slice(0, -16);
      const authTag = ciphertext.slice(-16);

      // Verify auth tag
      const expectedAuthTag = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        expectedAuthTag[i] = (key[i % key.length] + ct[i % ct.length] + nonce[i % nonce.length]) % 256;
      }

      // Check if auth tag matches
      for (let i = 0; i < 16; i++) {
        if (authTag[i] !== expectedAuthTag[i]) {
          throw new Error('Authentication failed: wrong key or corrupted ciphertext');
        }
      }

      // XOR ciphertext with key to get plaintext
      const plaintext = new Uint8Array(ct.length);
      for (let i = 0; i < ct.length; i++) {
        plaintext[i] = ct[i] ^ key[i % key.length];
      }

      return plaintext;
    }),
  };
});

export const gcm = mockGcm;
export const ghash = jest.fn();
export const polyval = jest.fn();
