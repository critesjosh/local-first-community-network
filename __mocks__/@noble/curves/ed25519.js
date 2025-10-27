/**
 * Mock for @noble/curves/ed25519 cryptographic library
 */

const utils = {
  randomSecretKey: jest.fn(() => {
    // Return a mock 32-byte secret key
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = Math.floor(Math.random() * 256);
    }
    return key;
  }),
  toMontgomerySecret: jest.fn((privateKey) => {
    // Mock conversion from Ed25519 private key to Curve25519
    // In reality this is a complex cryptographic operation
    // For testing, we'll just return a transformed version
    const montgomeryKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      montgomeryKey[i] = (privateKey[i] + 1) % 256;
    }
    return montgomeryKey;
  }),
  toMontgomery: jest.fn((publicKey) => {
    // Mock conversion from Ed25519 public key to Curve25519
    const montgomeryKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      montgomeryKey[i] = (publicKey[i] + 2) % 256;
    }
    return montgomeryKey;
  }),
};

const getPublicKey = jest.fn((privateKey) => {
  // Return a mock 32-byte public key derived from private key
  const publicKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = privateKey[i] ^ 0xFF;
  }
  return publicKey;
});

const ed25519 = {
  utils,
  getPublicKey,
};

const getSharedSecret = jest.fn((privateKey, publicKey) => {
  // Mock X25519 shared secret computation
  // In reality, this is the ECDH operation
  // For testing, derive a deterministic shared secret from both keys
  const sharedSecret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    sharedSecret[i] = (privateKey[i] + publicKey[i]) % 256;
  }
  return sharedSecret;
});

const x25519 = {
  getSharedSecret,
};

module.exports = {
  ed25519,
  x25519,
};
