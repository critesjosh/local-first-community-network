// Mock for @noble/ciphers/aes.js

// Mock GCM cipher
const mockGcm = jest.fn((key, nonce, aad) => ({
  encrypt: jest.fn((plaintext) => {
    // Simple mock: just return the plaintext with a fake tag
    const ciphertext = plaintext;
    return new Uint8Array([...ciphertext, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  }),
  decrypt: jest.fn((ciphertext) => {
    // Simple mock: remove last 16 bytes (auth tag) and return
    return ciphertext.slice(0, -16);
  }),
}));

export const gcm = mockGcm;
export const ghash = jest.fn();
export const polyval = jest.fn();
