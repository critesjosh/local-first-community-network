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
  randomSecretKey: jest.fn(() => {
    // Return a mock 32-byte secret key
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = Math.floor(Math.random() * 256);
    }
    return key;
  }),
};

// Counter for deterministic key generation in tests
let keyCounter = 0;

const keygenAsync = jest.fn(async () => {
  // Generate deterministic mock key pair for testing
  const secretKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    secretKey[i] = (i + keyCounter) % 256;
  }
  keyCounter++;

  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = secretKey[i] ^ 0xFF;
  }

  return { secretKey, publicKey };
});

const keygen = jest.fn(() => {
  // Generate deterministic mock key pair synchronously
  const secretKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    secretKey[i] = (i + keyCounter) % 256;
  }
  keyCounter++;

  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = secretKey[i] ^ 0xFF;
  }

  return { secretKey, publicKey };
});

const getPublicKey = jest.fn(async (privateKey) => {
  // Return a mock 32-byte public key derived from private key
  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = privateKey[i] ^ 0xFF; // Simple transformation for testing
  }
  return publicKey;
});

// Alias for getPublicKeyAsync (same as getPublicKey)
const getPublicKeyAsync = getPublicKey;

const sign = jest.fn(async (message, privateKey) => {
  // Return a mock 64-byte signature based on message and private key
  const signature = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    signature[i] = (message[i % message.length] + privateKey[i % 32]) % 256;
  }
  return signature;
});

const verify = jest.fn(async (signature, message, publicKey) => {
  // Mock verification that checks signature validity
  if (signature.length !== 64) return false;
  if (publicKey.length !== 32) return false;

  // Derive private key from public key (reverse the XOR from keygen)
  const privateKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    privateKey[i] = publicKey[i] ^ 0xFF;
  }

  // Recompute expected signature
  const expectedSignature = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    expectedSignature[i] = (message[i % message.length] + privateKey[i % 32]) % 256;
  }

  // Compare all 64 bytes of signature to be thorough
  for (let i = 0; i < 64; i++) {
    if (signature[i] !== expectedSignature[i]) {
      return false;
    }
  }
  return true;
});

module.exports = {
  utils,
  getPublicKey,
  getPublicKeyAsync,
  sign,
  verify,
  keygen,
  keygenAsync,
};