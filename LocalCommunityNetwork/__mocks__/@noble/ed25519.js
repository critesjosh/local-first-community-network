/**
 * Mock for @noble/ed25519 cryptographic library
 */

const utils = {
  randomPrivateKey: jest.fn(() => {
    // Return a mock 32-byte private key
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = Math.floor(Math.random() * 256);
    }
    return key;
  }),
};

const getPublicKey = jest.fn(async (privateKey) => {
  // Return a mock 32-byte public key derived from private key
  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = privateKey[i] ^ 0xFF; // Simple transformation for testing
  }
  return publicKey;
});

const sign = jest.fn(async (message, privateKey) => {
  // Return a mock 64-byte signature
  const signature = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    signature[i] = (message[i % message.length] + privateKey[i % 32]) % 256;
  }
  return signature;
});

const verify = jest.fn(async (signature, message, publicKey) => {
  // Simple mock verification - always true for testing unless tampered
  if (signature.length !== 64) return false;
  if (publicKey.length !== 32) return false;

  // Simulate verification failure for tampered data
  const expectedFirstByte = (message[0] + (publicKey[0] ^ 0xFF)) % 256;
  return signature[0] === expectedFirstByte;
});

module.exports = {
  utils,
  getPublicKey,
  sign,
  verify,
};