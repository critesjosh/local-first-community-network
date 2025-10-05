/**
 * Mock for @noble/secp256k1
 */

let keyCounter = 0;

const utils = {
  randomPrivateKey: jest.fn(() => {
    const privateKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      privateKey[i] = (i + keyCounter * 13) % 256;
    }
    keyCounter++;
    return privateKey;
  }),
};

const getPublicKey = jest.fn((privateKey, compressed = false) => {
  // Generate deterministic public key from private key
  const publicKey = new Uint8Array(compressed ? 33 : 65);

  if (compressed) {
    publicKey[0] = 0x02; // Compressed format prefix
    for (let i = 1; i < 33; i++) {
      publicKey[i] = privateKey[i - 1] ^ 0xAA;
    }
  } else {
    publicKey[0] = 0x04; // Uncompressed format prefix
    for (let i = 1; i < 33; i++) {
      publicKey[i] = privateKey[i - 1] ^ 0xAA;
    }
    for (let i = 33; i < 65; i++) {
      publicKey[i] = privateKey[i - 33] ^ 0x55;
    }
  }

  return publicKey;
});

const getSharedSecret = jest.fn((privateKeyA, publicKeyB, compressed = false) => {
  // Simulate ECDH shared secret derivation
  // In real implementation, this uses elliptic curve point multiplication
  // For testing, we'll create a deterministic secret based on both keys

  const sharedSecret = new Uint8Array(compressed ? 33 : 65);

  if (compressed) {
    sharedSecret[0] = 0x02; // Compressed format prefix
    // Mix the keys to create a "shared" secret
    for (let i = 1; i < 33; i++) {
      sharedSecret[i] = privateKeyA[i - 1] ^ publicKeyB[Math.min(i, publicKeyB.length - 1)];
    }
  } else {
    sharedSecret[0] = 0x04; // Uncompressed format prefix
    for (let i = 1; i < 33; i++) {
      sharedSecret[i] = privateKeyA[i - 1] ^ publicKeyB[Math.min(i, publicKeyB.length - 1)];
    }
    for (let i = 33; i < 65; i++) {
      sharedSecret[i] = privateKeyA[i - 33] ^ publicKeyB[Math.min(i, publicKeyB.length - 1)];
    }
  }

  return sharedSecret;
});

module.exports = {
  utils,
  getPublicKey,
  getSharedSecret,
};
