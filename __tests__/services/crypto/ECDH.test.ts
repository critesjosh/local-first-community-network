/**
 * Tests for ECDH service
 */

import ECDHService from '../../../src/services/crypto/ECDH';
import * as ed25519 from '@noble/ed25519';

describe('ECDHService', () => {
  let alicePrivateKey: Uint8Array;
  let alicePublicKey: Uint8Array;
  let bobPrivateKey: Uint8Array;
  let bobPublicKey: Uint8Array;

  beforeAll(async () => {
    // Generate test key pairs
    alicePrivateKey = ed25519.utils.randomSecretKey();
    alicePublicKey = await ed25519.getPublicKeyAsync(alicePrivateKey);
    bobPrivateKey = ed25519.utils.randomSecretKey();
    bobPublicKey = await ed25519.getPublicKeyAsync(bobPrivateKey);
  });

  describe('deriveSharedSecret', () => {
    it('should derive same shared secret for both parties', async () => {
      const aliceShared = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );
      const bobShared = await ECDHService.deriveSharedSecret(
        bobPrivateKey,
        alicePublicKey,
      );

      expect(aliceShared).toEqual(bobShared);
      expect(aliceShared).toHaveLength(32);
    });

    it('should produce different secrets for different key pairs', async () => {
      const charliePrivateKey = ed25519.utils.randomSecretKey();
      const charliePublicKey = await ed25519.getPublicKeyAsync(charliePrivateKey);

      const aliceBobShared = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );
      const aliceCharlieShared = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        charliePublicKey,
      );

      expect(aliceBobShared).not.toEqual(aliceCharlieShared);
    });
  });

  describe('deriveConnectionKey', () => {
    it('should derive deterministic connection key from shared secret', async () => {
      const sharedSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );

      const key1 = ECDHService.deriveConnectionKey(sharedSecret);
      const key2 = ECDHService.deriveConnectionKey(sharedSecret);

      expect(key1).toEqual(key2);
      expect(key1).toHaveLength(32);
    });

    it('should derive different keys for different info strings', () => {
      const sharedSecret = new Uint8Array(32).fill(1);

      const encKey = ECDHService.deriveConnectionKey(
        sharedSecret,
        undefined,
        'encryption-key-v1',
      );
      const authKey = ECDHService.deriveConnectionKey(
        sharedSecret,
        undefined,
        'auth-key-v1',
      );

      expect(encKey).not.toEqual(authKey);
    });
  });

  describe('deriveMultipleKeys', () => {
    it('should derive separate encryption and auth keys', async () => {
      const sharedSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );

      const keys = ECDHService.deriveMultipleKeys(sharedSecret);

      expect(keys.encryptionKey).toHaveLength(32);
      expect(keys.authKey).toHaveLength(32);
      expect(keys.encryptionKey).not.toEqual(keys.authKey);
    });
  });

  describe('generateRecipientLookupId', () => {
    it('should generate deterministic HMAC-based lookup ID', async () => {
      const sharedSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );
      const postId = 'test-post-123';

      const lookupId1 = ECDHService.generateRecipientLookupId(sharedSecret, postId);
      const lookupId2 = ECDHService.generateRecipientLookupId(sharedSecret, postId);

      expect(lookupId1).toBe(lookupId2);
      expect(typeof lookupId1).toBe('string');
      expect(lookupId1.length).toBeGreaterThan(0);
    });

    it('should generate different lookup IDs for different post IDs', async () => {
      const sharedSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );

      const lookupId1 = ECDHService.generateRecipientLookupId(
        sharedSecret,
        'post-1',
      );
      const lookupId2 = ECDHService.generateRecipientLookupId(
        sharedSecret,
        'post-2',
      );

      expect(lookupId1).not.toBe(lookupId2);
    });

    it('should generate different lookup IDs for different shared secrets', async () => {
      const postId = 'test-post-123';

      const aliceBobSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );

      const charliePrivateKey = ed25519.utils.randomSecretKey();
      const charliePublicKey = await ed25519.getPublicKeyAsync(charliePrivateKey);
      const aliceCharlieSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        charliePublicKey,
      );

      const lookupId1 = ECDHService.generateRecipientLookupId(
        aliceBobSecret,
        postId,
      );
      const lookupId2 = ECDHService.generateRecipientLookupId(
        aliceCharlieSecret,
        postId,
      );

      expect(lookupId1).not.toBe(lookupId2);
    });

    it('should generate base64-compatible lookup IDs', async () => {
      const sharedSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );
      const postId = 'test-post-123';

      const lookupId = ECDHService.generateRecipientLookupId(sharedSecret, postId);

      // Should be valid base64 and decodable
      expect(() => Buffer.from(lookupId, 'base64')).not.toThrow();
      const decoded = Buffer.from(lookupId, 'base64');
      expect(decoded.length).toBeGreaterThan(0);
    });

    it('should work as object key (privacy test)', async () => {
      const sharedSecret = await ECDHService.deriveSharedSecret(
        alicePrivateKey,
        bobPublicKey,
      );
      const postId = 'test-post-123';

      const lookupId = ECDHService.generateRecipientLookupId(sharedSecret, postId);

      // Should be usable as object key
      const wrappedKeys: {[key: string]: string} = {};
      wrappedKeys[lookupId] = 'encrypted-key-data';

      expect(wrappedKeys[lookupId]).toBe('encrypted-key-data');
      // Lookup ID should not reveal connection identity
      expect(lookupId).not.toContain('alice');
      expect(lookupId).not.toContain('bob');
    });
  });

  describe('generateEphemeralKeyPair', () => {
    it('should generate valid key pair', async () => {
      const keyPair = await ECDHService.generateEphemeralKeyPair();

      expect(keyPair.privateKey).toHaveLength(32);
      expect(keyPair.publicKey).toHaveLength(32);
    });

    it('should generate different keys each time', async () => {
      const keyPair1 = await ECDHService.generateEphemeralKeyPair();
      const keyPair2 = await ECDHService.generateEphemeralKeyPair();

      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
    });
  });
});
