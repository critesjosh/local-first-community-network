/**
 * Tests for EncryptionService (Hybrid Encryption)
 */

import EncryptionService from '../../../src/services/crypto/EncryptionService';
import ECDHService from '../../../src/services/crypto/ECDH';
import {Connection, Event} from '../../../src/types/models';
import * as ed25519 from '@noble/ed25519';

describe('EncryptionService - Hybrid Encryption', () => {
  let alicePrivateKey: Uint8Array;
  let alicePublicKey: Uint8Array;
  let bobPrivateKey: Uint8Array;
  let bobPublicKey: Uint8Array;
  let charliePrivateKey: Uint8Array;
  let charliePublicKey: Uint8Array;

  let aliceConnections: Connection[];
  let bobConnections: Connection[];

  beforeAll(async () => {
    // Generate test identities
    alicePrivateKey = ed25519.utils.randomSecretKey();
    alicePublicKey = await ed25519.getPublicKeyAsync(alicePrivateKey);
    bobPrivateKey = ed25519.utils.randomSecretKey();
    bobPublicKey = await ed25519.getPublicKeyAsync(bobPrivateKey);
    charliePrivateKey = ed25519.utils.randomSecretKey();
    charliePublicKey = await ed25519.getPublicKeyAsync(charliePrivateKey);

    // Alice's perspective: connections to Bob and Charlie
    const aliceBobSecret = await ECDHService.deriveSharedSecret(
      alicePrivateKey,
      bobPublicKey,
    );
    const aliceCharlieSecret = await ECDHService.deriveSharedSecret(
      alicePrivateKey,
      charliePublicKey,
    );

    aliceConnections = [
      {
        id: 'conn-alice-bob',
        userId: Buffer.from(bobPublicKey).toString('base64'),
        displayName: 'Bob',
        sharedSecret: aliceBobSecret,
        connectedAt: new Date(),
        trustLevel: 'verified',
      },
      {
        id: 'conn-alice-charlie',
        userId: Buffer.from(charliePublicKey).toString('base64'),
        displayName: 'Charlie',
        sharedSecret: aliceCharlieSecret,
        connectedAt: new Date(),
        trustLevel: 'verified',
      },
    ];

    // Bob's perspective: connection to Alice
    const bobAliceSecret = await ECDHService.deriveSharedSecret(
      bobPrivateKey,
      alicePublicKey,
    );

    bobConnections = [
      {
        id: 'conn-bob-alice',
        userId: Buffer.from(alicePublicKey).toString('base64'),
        displayName: 'Alice',
        sharedSecret: bobAliceSecret,
        connectedAt: new Date(),
        trustLevel: 'verified',
      },
    ];
  });

  describe('Hybrid Event Encryption', () => {
    it('should encrypt event with hybrid encryption structure', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-123',
        authorId: 'alice-id',
        title: 'Test Event',
        description: 'Secret meeting',
        datetime: new Date('2025-12-01T10:00:00Z'),
        location: 'Secret location',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Check structure
      expect(encrypted.id).toBe(event.id);
      expect(encrypted.authorId).toBe(event.authorId);
      expect(encrypted.timestamp).toBe(event.createdAt.getTime());
      expect(encrypted.encryptedContent).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.wrappedKeys).toBeTruthy();

      // Should have wrapped keys for each connection
      const wrappedKeysCount = Object.keys(encrypted.wrappedKeys).length;
      expect(wrappedKeysCount).toBe(aliceConnections.length);

      // Wrapped keys should use HMAC-based lookup IDs (not connection IDs)
      const wrappedKeyIds = Object.keys(encrypted.wrappedKeys);
      wrappedKeyIds.forEach(id => {
        expect(id).not.toBe('conn-alice-bob');
        expect(id).not.toBe('conn-alice-charlie');
        // Should be base64 HMAC output
        expect(() => Buffer.from(id, 'base64')).not.toThrow();
      });

      // Each wrapped key entry should have wrappedKey and keyWrapIV
      wrappedKeyIds.forEach(id => {
        expect(encrypted.wrappedKeys[id].wrappedKey).toBeTruthy();
        expect(encrypted.wrappedKeys[id].keyWrapIV).toBeTruthy();
      });
    });

    it('should encrypt content only once (efficiency test)', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-efficiency',
        authorId: 'alice-id',
        title: 'Efficiency Test',
        description: 'A' * 1000, // Large description
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // encryptedContent should be a single base64 string
      expect(typeof encrypted.encryptedContent).toBe('string');

      // Wrapped keys should be small (just 32-byte keys wrapped, not full content)
      const wrappedKeyIds = Object.keys(encrypted.wrappedKeys);
      wrappedKeyIds.forEach(id => {
        const wrappedKeyBytes = Buffer.from(
          encrypted.wrappedKeys[id].wrappedKey,
          'base64',
        );
        // Wrapped AES-256 key + GCM tag should be ~48 bytes, not 1000+ bytes
        expect(wrappedKeyBytes.length).toBeLessThan(100);
      });
    });

    it('should skip connections without shared secret', async () => {
      const invalidConnection: Connection = {
        id: 'conn-invalid',
        userId: 'invalid-user',
        displayName: 'Invalid',
        sharedSecret: undefined, // No shared secret
        connectedAt: new Date(),
        trustLevel: 'pending',
      };

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-skip',
        authorId: 'alice-id',
        title: 'Test',
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted = await EncryptionService.encryptEvent(event, [
        ...aliceConnections,
        invalidConnection,
      ]);

      // Should only have wrapped keys for valid connections
      expect(Object.keys(encrypted.wrappedKeys).length).toBe(
        aliceConnections.length,
      );
    });
  });

  describe('Hybrid Event Decryption', () => {
    it('should decrypt event encrypted for recipient', async () => {
      const originalEvent: Omit<Event, 'encryptedFor'> = {
        id: 'event-decrypt-test',
        authorId: 'alice-id',
        title: 'Secret Meeting',
        description: 'Confidential information',
        datetime: new Date('2025-12-01T15:00:00Z'),
        location: 'Room 101',
        photo: 'base64photodata',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Alice encrypts for her connections (including Bob)
      const encrypted = await EncryptionService.encryptEvent(
        originalEvent,
        aliceConnections,
      );

      // Bob decrypts using his connections (to Alice)
      const decrypted = await EncryptionService.decryptEvent(
        encrypted,
        bobConnections,
      );

      // Should match original
      expect(decrypted.id).toBe(originalEvent.id);
      expect(decrypted.authorId).toBe(originalEvent.authorId);
      expect(decrypted.title).toBe(originalEvent.title);
      expect(decrypted.description).toBe(originalEvent.description);
      expect(decrypted.datetime.toISOString()).toBe(
        originalEvent.datetime.toISOString(),
      );
      expect(decrypted.location).toBe(originalEvent.location);
      expect(decrypted.photo).toBe(originalEvent.photo);
    });

    it('should use HMAC-based connection matching (early termination)', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-hmac-match',
        authorId: 'alice-id',
        title: 'HMAC Test',
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Bob should be able to decrypt by computing HMAC and matching
      const decrypted = await EncryptionService.decryptEvent(
        encrypted,
        bobConnections,
      );

      expect(decrypted.title).toBe('HMAC Test');
    });

    it('should throw error if no connection can decrypt', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-no-match',
        authorId: 'alice-id',
        title: 'Private Event',
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Alice encrypts for Bob and Charlie only
      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Dave (unrelated user) tries to decrypt
      const davePrivateKey = ed25519.utils.randomSecretKey();
      const daveAliceSecret = await ECDHService.deriveSharedSecret(
        davePrivateKey,
        alicePublicKey,
      );

      const daveConnections: Connection[] = [
        {
          id: 'conn-dave-alice',
          userId: Buffer.from(alicePublicKey).toString('base64'),
          displayName: 'Alice',
          sharedSecret: daveAliceSecret,
          connectedAt: new Date(),
          trustLevel: 'verified',
        },
      ];

      // Should fail - Dave was not a recipient
      await expect(
        EncryptionService.decryptEvent(encrypted, daveConnections),
      ).rejects.toThrow('Event not encrypted for any of my connections');
    });

    it('should handle connection without shared secret', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-no-secret',
        authorId: 'alice-id',
        title: 'Test',
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Try to decrypt with connection missing shared secret
      const invalidConnections: Connection[] = [
        {
          id: 'conn-invalid',
          userId: 'user-id',
          displayName: 'Invalid',
          sharedSecret: undefined,
          connectedAt: new Date(),
          trustLevel: 'verified',
        },
      ];

      await expect(
        EncryptionService.decryptEvent(encrypted, invalidConnections),
      ).rejects.toThrow();
    });
  });

  describe('Round-trip Encryption/Decryption', () => {
    it('should successfully round-trip with multiple recipients', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-roundtrip',
        authorId: 'alice-id',
        title: 'Multi-Recipient Event',
        description: 'Everyone invited!',
        datetime: new Date('2025-12-25T12:00:00Z'),
        location: 'Community Center',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Alice encrypts for Bob and Charlie
      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Bob decrypts
      const bobDecrypted = await EncryptionService.decryptEvent(
        encrypted,
        bobConnections,
      );

      expect(bobDecrypted.title).toBe(event.title);
      expect(bobDecrypted.description).toBe(event.description);
      expect(bobDecrypted.location).toBe(event.location);

      // Charlie decrypts
      const charlieAliceSecret = await ECDHService.deriveSharedSecret(
        charliePrivateKey,
        alicePublicKey,
      );

      const charlieConnections: Connection[] = [
        {
          id: 'conn-charlie-alice',
          userId: Buffer.from(alicePublicKey).toString('base64'),
          displayName: 'Alice',
          sharedSecret: charlieAliceSecret,
          connectedAt: new Date(),
          trustLevel: 'verified',
        },
      ];

      const charlieDecrypted = await EncryptionService.decryptEvent(
        encrypted,
        charlieConnections,
      );

      expect(charlieDecrypted.title).toBe(event.title);
      expect(charlieDecrypted.description).toBe(event.description);
      expect(charlieDecrypted.location).toBe(event.location);

      // Both should decrypt to same content
      expect(bobDecrypted.title).toBe(charlieDecrypted.title);
      expect(bobDecrypted.description).toBe(charlieDecrypted.description);
    });
  });

  describe('Privacy and Security', () => {
    it('should not expose recipient identities in wrappedKeys', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-privacy',
        authorId: 'alice-id',
        title: 'Privacy Test',
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Wrapped keys should not contain connection IDs or user IDs
      const wrappedKeyIds = Object.keys(encrypted.wrappedKeys);

      wrappedKeyIds.forEach(id => {
        // Should not be connection IDs
        expect(id).not.toContain('conn-alice-bob');
        expect(id).not.toContain('conn-alice-charlie');

        // Should not be user identifiers
        const bobUserId = Buffer.from(bobPublicKey).toString('base64');
        const charlieUserId = Buffer.from(charliePublicKey).toString('base64');
        expect(id).not.toBe(bobUserId);
        expect(id).not.toBe(charlieUserId);

        // Should be opaque HMAC-based identifier
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(20); // HMAC output is substantial
      });
    });

    it('should produce deterministic wrapped keys for same event ID', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-deterministic',
        authorId: 'alice-id',
        title: 'Deterministic Test',
        datetime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encrypted1 = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );
      const encrypted2 = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Recipient lookup IDs should be deterministic
      const keys1 = Object.keys(encrypted1.wrappedKeys).sort();
      const keys2 = Object.keys(encrypted2.wrappedKeys).sort();

      expect(keys1).toEqual(keys2);
    });
  });

  describe('Message Encryption (for comparison)', () => {
    it('should encrypt and decrypt messages', async () => {
      const message = 'Secret message';
      const connection = aliceConnections[0];

      const encrypted = await EncryptionService.encryptMessage(
        message,
        connection,
        'msg-123',
        'conv-123',
        'alice-id',
        'bob-id',
      );

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();

      const decrypted = await EncryptionService.decryptMessage(
        encrypted,
        connection,
      );

      expect(decrypted).toBe(message);
    });
  });

  describe('Conversation ID Generation', () => {
    it('should generate deterministic conversation ID', () => {
      const id1 = EncryptionService.generateConversationId('alice', 'bob');
      const id2 = EncryptionService.generateConversationId('bob', 'alice');

      expect(id1).toBe(id2);
      expect(id1).toHaveLength(32);
    });
  });
});
