/**
 * Tests for KeyManager service
 */

import '../../../__tests__/setup';
import KeyManager from '../../../src/services/crypto/KeyManager';

describe('KeyManager', () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    keyManager = new KeyManager();
  });

  describe('generateKeyPair', () => {
    it('should generate a valid Ed25519 key pair', async () => {
      const keyPair = await keyManager.generateKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });

    it('should generate different key pairs each time', async () => {
      const keyPair1 = await keyManager.generateKeyPair();
      const keyPair2 = await keyManager.generateKeyPair();

      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    });
  });

  describe('createIdentity', () => {
    it('should create identity from key pair', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const identity = keyManager.createIdentity(keyPair);

      expect(identity).toBeDefined();
      expect(identity.id).toBeTruthy();
      expect(identity.publicKey).toEqual(keyPair.publicKey);
      expect(identity.createdAt).toBeInstanceOf(Date);
    });

    it('should create base58 encoded ID', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const identity = keyManager.createIdentity(keyPair);

      // Base58 should only contain valid characters
      expect(identity.id).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
      // 32 bytes typically encode to ~44 characters in base58
      expect(identity.id.length).toBeGreaterThan(40);
      expect(identity.id.length).toBeLessThan(50);
    });
  });

  describe('signData and verifySignature', () => {
    it('should sign data and verify with correct key', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');

      const signature = await keyManager.signData(data, keyPair.privateKey);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // Ed25519 signature is 64 bytes

      const isValid = await keyManager.verifySignature(
        data,
        signature,
        keyPair.publicKey,
      );
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', async () => {
      const keyPair1 = await keyManager.generateKeyPair();
      const keyPair2 = await keyManager.generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');

      const signature = await keyManager.signData(data, keyPair1.privateKey);

      const isValid = await keyManager.verifySignature(
        data,
        signature,
        keyPair2.publicKey,
      );
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered data', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');
      const tamperedData = new TextEncoder().encode('Hello, World!!');

      const signature = await keyManager.signData(data, keyPair.privateKey);

      const isValid = await keyManager.verifySignature(
        tamperedData,
        signature,
        keyPair.publicKey,
      );
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered signature', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');

      const signature = await keyManager.signData(data, keyPair.privateKey);
      // Tamper with signature
      signature[0] = signature[0] ^ 1;

      const isValid = await keyManager.verifySignature(
        data,
        signature,
        keyPair.publicKey,
      );
      expect(isValid).toBe(false);
    });
  });

  describe('publicKeyToUserId and userIdToPublicKey', () => {
    it('should convert public key to user ID and back', async () => {
      const keyPair = await keyManager.generateKeyPair();

      const userId = keyManager.publicKeyToUserId(keyPair.publicKey);
      expect(userId).toBeTruthy();
      expect(typeof userId).toBe('string');

      const publicKey = keyManager.userIdToPublicKey(userId);
      expect(publicKey).toEqual(keyPair.publicKey);
    });

    it('should handle round-trip conversion', async () => {
      const original = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        original[i] = i * 8;
      }

      const userId = keyManager.publicKeyToUserId(original);
      const recovered = keyManager.userIdToPublicKey(userId);

      expect(recovered).toEqual(original);
    });
  });

  describe('serializeKeyPair and deserializeKeyPair', () => {
    it('should serialize key pair to hex strings', async () => {
      const keyPair = await keyManager.generateKeyPair();

      const serialized = keyManager.serializeKeyPair(keyPair);

      expect(serialized).toBeDefined();
      expect(typeof serialized.publicKey).toBe('string');
      expect(typeof serialized.privateKey).toBe('string');
      expect(serialized.publicKey).toMatch(/^[0-9a-f]+$/);
      expect(serialized.privateKey).toMatch(/^[0-9a-f]+$/);
      expect(serialized.publicKey.length).toBe(64); // 32 bytes = 64 hex chars
      expect(serialized.privateKey.length).toBe(64);
    });

    it('should deserialize hex strings back to key pair', async () => {
      const original = await keyManager.generateKeyPair();

      const serialized = keyManager.serializeKeyPair(original);
      const deserialized = keyManager.deserializeKeyPair(serialized);

      expect(deserialized.publicKey).toEqual(original.publicKey);
      expect(deserialized.privateKey).toEqual(original.privateKey);
    });

    it('should maintain functionality after serialization', async () => {
      const original = await keyManager.generateKeyPair();
      const data = new TextEncoder().encode('Test data');

      // Sign with original
      const signature = await keyManager.signData(data, original.privateKey);

      // Serialize and deserialize
      const serialized = keyManager.serializeKeyPair(original);
      const deserialized = keyManager.deserializeKeyPair(serialized);

      // Verify with deserialized
      const isValid = await keyManager.verifySignature(
        data,
        signature,
        deserialized.publicKey,
      );
      expect(isValid).toBe(true);

      // Sign with deserialized
      const newSignature = await keyManager.signData(data, deserialized.privateKey);
      const isNewValid = await keyManager.verifySignature(
        data,
        newSignature,
        original.publicKey,
      );
      expect(isNewValid).toBe(true);
    });
  });

  describe('ECDH key exchange', () => {
    it('should generate ECDH key pair', async () => {
      const keyPair = await keyManager.generateECDHKeyPair();

      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey.length).toBe(32); // secp256k1 private key
      expect(keyPair.publicKey.length).toBe(33); // compressed public key
    });

    it('should generate different ECDH key pairs', async () => {
      const keyPair1 = await keyManager.generateECDHKeyPair();
      const keyPair2 = await keyManager.generateECDHKeyPair();

      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    });

    it('should derive same shared secret from both sides', async () => {
      // Alice generates her key pair
      const aliceKeyPair = await keyManager.generateECDHKeyPair();

      // Bob generates his key pair
      const bobKeyPair = await keyManager.generateECDHKeyPair();

      // Alice derives shared secret with Bob's public key
      const aliceSharedSecret = await keyManager.deriveSharedSecret(
        aliceKeyPair.privateKey,
        bobKeyPair.publicKey,
      );

      // Bob derives shared secret with Alice's public key
      const bobSharedSecret = await keyManager.deriveSharedSecret(
        bobKeyPair.privateKey,
        aliceKeyPair.publicKey,
      );

      // Both should have the same shared secret
      expect(aliceSharedSecret).toEqual(bobSharedSecret);
      expect(aliceSharedSecret.length).toBe(32); // 256-bit secret
    });

    it('should derive different secrets for different key pairs', async () => {
      const alice = await keyManager.generateECDHKeyPair();
      const bob = await keyManager.generateECDHKeyPair();
      const charlie = await keyManager.generateECDHKeyPair();

      const aliceBobSecret = await keyManager.deriveSharedSecret(
        alice.privateKey,
        bob.publicKey,
      );

      const aliceCharlieSecret = await keyManager.deriveSharedSecret(
        alice.privateKey,
        charlie.publicKey,
      );

      expect(aliceBobSecret).not.toEqual(aliceCharlieSecret);
    });
  });
});