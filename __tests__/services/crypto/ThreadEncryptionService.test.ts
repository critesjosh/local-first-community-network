/**
 * Tests for ThreadEncryptionService (Event Key Reuse for Replies)
 *
 * v2.1 Architecture: Thread keys = Event keys
 * Event keys are extracted from posts and reused for reply encryption
 */

import ThreadEncryptionService from '../../../src/services/crypto/ThreadEncryptionService';
import EncryptionService from '../../../src/services/crypto/EncryptionService';
import ECDHService from '../../../src/services/crypto/ECDH';
import {Connection, Event, ThreadReply} from '../../../src/types/models';
import {EncryptedEvent} from '../../../src/services/crypto/EncryptionService';
import IdentityService from '../../../src/services/IdentityService';
import * as ed25519 from '@noble/ed25519';
import * as base58 from '../../../src/utils/base58';

// Mock IdentityService
jest.mock('../../../src/services/IdentityService');

describe('ThreadEncryptionService (v2.1 - Event Key Reuse)', () => {
  let alicePrivateKey: Uint8Array;
  let alicePublicKey: Uint8Array;
  let bobPrivateKey: Uint8Array;
  let bobPublicKey: Uint8Array;
  let charliePrivateKey: Uint8Array;
  let charliePublicKey: Uint8Array;

  let aliceConnections: Connection[];
  let bobConnections: Connection[];
  let charlieConnections: Connection[];

  beforeAll(async () => {
    // Generate test identities
    alicePrivateKey = ed25519.utils.randomSecretKey();
    alicePublicKey = await ed25519.getPublicKeyAsync(alicePrivateKey);
    bobPrivateKey = ed25519.utils.randomSecretKey();
    bobPublicKey = await ed25519.getPublicKeyAsync(bobPrivateKey);
    charliePrivateKey = ed25519.utils.randomSecretKey();
    charliePublicKey = await ed25519.getPublicKeyAsync(charliePrivateKey);

    // Alice's connections (to Bob and Charlie)
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
        userId: base58.encode(bobPublicKey),
        displayName: 'Bob',
        sharedSecret: aliceBobSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
      {
        id: 'conn-alice-charlie',
        userId: base58.encode(charliePublicKey),
        displayName: 'Charlie',
        sharedSecret: aliceCharlieSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];

    // Bob's connection (to Alice)
    const bobAliceSecret = await ECDHService.deriveSharedSecret(
      bobPrivateKey,
      alicePublicKey,
    );

    bobConnections = [
      {
        id: 'conn-bob-alice',
        userId: base58.encode(alicePublicKey),
        displayName: 'Alice',
        sharedSecret: bobAliceSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];

    // Charlie's connection (to Alice)
    const charlieAliceSecret = await ECDHService.deriveSharedSecret(
      charliePrivateKey,
      alicePublicKey,
    );

    charlieConnections = [
      {
        id: 'conn-charlie-alice',
        userId: base58.encode(alicePublicKey),
        displayName: 'Alice',
        sharedSecret: charlieAliceSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];
  });

  // Helper function to mock identity for encryption/decryption
  const mockIdentity = (publicKey: Uint8Array, privateKey: Uint8Array) => {
    (IdentityService.getKeyPair as jest.Mock).mockResolvedValue({
      publicKey,
      privateKey,
    });
  };

  beforeEach(() => {
    // Mock IdentityService to return null by default
    (IdentityService.getKeyPair as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    // Clear thread key cache after each test
    ThreadEncryptionService.clearCache();
    jest.clearAllMocks();
  });

  describe('Event Key Extraction for Replies', () => {
    it('should extract event key from wrappedKeys (Bob as recipient)', async () => {
      // Mock Alice's identity for event encryption
      (IdentityService.getKeyPair as jest.Mock).mockResolvedValue({
        publicKey: alicePublicKey,
        privateKey: alicePrivateKey,
      });

      // Alice creates a post
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-123',
        authorId: base58.encode(alicePublicKey),
        content: 'Test post content',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Mock Bob's identity for decryption (or null to force connections-only)
      (IdentityService.getKeyPair as jest.Mock).mockResolvedValue({
        publicKey: bobPublicKey,
        privateKey: bobPrivateKey,
      });

      // Bob extracts the event key
      const eventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      expect(eventKey).toBeDefined();
      expect(eventKey).toBeInstanceOf(Uint8Array);
      expect(eventKey.length).toBe(32); // 256-bit key
    });

    it('should extract event key from wrappedKeys (Charlie as recipient)', async () => {
      mockIdentity(alicePublicKey, alicePrivateKey);

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-456',
        authorId: base58.encode(alicePublicKey),
        content: 'Another test post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      mockIdentity(charliePublicKey, charliePrivateKey);

      // Charlie extracts the event key
      const eventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        charlieConnections,
      );

      expect(eventKey).toBeDefined();
      expect(eventKey).toBeInstanceOf(Uint8Array);
      expect(eventKey.length).toBe(32);
    });

    it('should cache event key after first extraction', async () => {
      mockIdentity(alicePublicKey, alicePrivateKey);

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-cache-test',
        authorId: base58.encode(alicePublicKey),
        content: 'Cache test post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      mockIdentity(bobPublicKey, bobPrivateKey);

      // First extraction
      const eventKey1 = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      // Get cached key
      const cachedKey = ThreadEncryptionService.getCachedThreadKey(encryptedEvent.id);

      expect(cachedKey).toBeDefined();
      expect(cachedKey).toEqual(eventKey1);

      // Second extraction should use cache
      const eventKey2 = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      expect(eventKey2).toEqual(eventKey1);
    });

    it('should fail for user not in recipient list', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-unauthorized',
        authorId: base58.encode(alicePublicKey),
        content: 'Private post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Dave is not a recipient
      const davePrivateKey = ed25519.utils.randomSecretKey();
      const davePublicKey = await ed25519.getPublicKeyAsync(davePrivateKey);

      const daveAliceSecret = await ECDHService.deriveSharedSecret(
        davePrivateKey,
        alicePublicKey,
      );

      const daveConnections: Connection[] = [
        {
          id: 'conn-dave-alice',
          userId: base58.encode(alicePublicKey),
          displayName: 'Alice',
          sharedSecret: daveAliceSecret,
          connectedAt: new Date(),
          status: 'mutual',
          trustLevel: 'verified',
        },
      ];

      await expect(
        ThreadEncryptionService.decryptThreadKey(encryptedEvent, daveConnections),
      ).rejects.toThrow('Thread key not available for current user');
    });
  });

  describe('Reply Encryption with Event Key', () => {
    let eventKey: Uint8Array;
    let encryptedEvent: EncryptedEvent;

    beforeEach(async () => {
      mockIdentity(alicePublicKey, alicePrivateKey);

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-reply-test',
        authorId: base58.encode(alicePublicKey),
        content: 'Original post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      mockIdentity(bobPublicKey, bobPrivateKey);

      // Bob extracts the event key
      eventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );
    });

    it('should encrypt reply with event key', async () => {
      const reply: ThreadReply = {
        id: 'reply-1',
        threadId: 'event-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'This is a test reply',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        eventKey,
      );

      expect(encryptedReply.id).toBe(reply.id);
      expect(encryptedReply.threadId).toBe(reply.threadId);
      expect(encryptedReply.authorId).toBe(reply.authorId);
      expect(encryptedReply.timestamp).toBe(reply.createdAt.getTime());
      expect(encryptedReply.encryptedContent).toBeTruthy();
      expect(encryptedReply.iv).toBeTruthy();

      // Content should be encrypted (not equal to plaintext)
      expect(encryptedReply.encryptedContent).not.toContain(reply.content);
    });

    it('should decrypt reply with event key', async () => {
      const originalReply: ThreadReply = {
        id: 'reply-2',
        threadId: 'event-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Hello from Bob!',
        createdAt: new Date(),
      };

      // Encrypt
      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        originalReply,
        eventKey,
      );

      // Decrypt
      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply,
        eventKey,
      );

      expect(decryptedReply.id).toBe(originalReply.id);
      expect(decryptedReply.threadId).toBe(originalReply.threadId);
      expect(decryptedReply.authorId).toBe(originalReply.authorId);
      expect(decryptedReply.content).toBe(originalReply.content);
      expect(decryptedReply.createdAt.getTime()).toBe(originalReply.createdAt.getTime());
    });

    it('should allow any recipient to encrypt and decrypt replies', async () => {
      // Bob creates a reply
      const bobReply: ThreadReply = {
        id: 'reply-bob',
        threadId: 'event-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Reply from Bob',
        createdAt: new Date(),
      };

      const encryptedBobReply = await ThreadEncryptionService.encryptThreadReply(
        bobReply,
        eventKey,
      );

      // Alice extracts the same event key and decrypts Bob's reply
      const aliceEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        aliceConnections,
      );

      const decryptedBobReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedBobReply,
        aliceEventKey,
      );

      expect(decryptedBobReply.content).toBe(bobReply.content);
    });

    it('should handle unicode and special characters in replies', async () => {
      const reply: ThreadReply = {
        id: 'reply-unicode',
        threadId: 'event-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Hello 世界! 🌍 Special chars: @#$%^&*()',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        eventKey,
      );

      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply,
        eventKey,
      );

      expect(decryptedReply.content).toBe(reply.content);
    });

    it('should handle empty reply content', async () => {
      const reply: ThreadReply = {
        id: 'reply-empty',
        threadId: 'event-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: '',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        eventKey,
      );

      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply,
        eventKey,
      );

      expect(decryptedReply.content).toBe('');
    });

    it('should use unique IVs for each reply encryption', async () => {
      const reply: ThreadReply = {
        id: 'reply-iv-test',
        threadId: 'event-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Same content',
        createdAt: new Date(),
      };

      // Encrypt same content twice
      const encryptedReply1 = await ThreadEncryptionService.encryptThreadReply(
        reply,
        eventKey,
      );

      const encryptedReply2 = await ThreadEncryptionService.encryptThreadReply(
        {...reply, id: 'reply-iv-test-2'},
        eventKey,
      );

      // IVs should be different
      expect(encryptedReply1.iv).not.toBe(encryptedReply2.iv);

      // Both should decrypt correctly
      const decrypted1 = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply1,
        eventKey,
      );
      const decrypted2 = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply2,
        eventKey,
      );

      expect(decrypted1.content).toBe(reply.content);
      expect(decrypted2.content).toBe(reply.content);
    });
  });

  describe('Cache Management', () => {
    it('should clear event key cache', async () => {
      mockIdentity(alicePublicKey, alicePrivateKey);

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-clear-cache',
        authorId: base58.encode(alicePublicKey),
        content: 'Cache clear test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      mockIdentity(bobPublicKey, bobPrivateKey);

      // Extract to cache the key
      await ThreadEncryptionService.decryptThreadKey(encryptedEvent, bobConnections);

      // Verify key is cached
      expect(ThreadEncryptionService.getCachedThreadKey(event.id)).toBeDefined();

      // Clear cache
      ThreadEncryptionService.clearCache();

      // Verify key is no longer cached
      expect(ThreadEncryptionService.getCachedThreadKey(event.id)).toBeUndefined();
    });

    it('should return undefined for non-existent cached key', () => {
      const cachedKey = ThreadEncryptionService.getCachedThreadKey('non-existent-event');
      expect(cachedKey).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when encrypting with invalid event key', async () => {
      const reply: ThreadReply = {
        id: 'reply-error',
        threadId: 'event-error',
        authorId: base58.encode(bobPublicKey),
        content: 'Test',
        createdAt: new Date(),
      };

      const invalidKey = new Uint8Array(16); // Wrong size (should be 32)

      await expect(
        ThreadEncryptionService.encryptThreadReply(reply, invalidKey),
      ).rejects.toThrow();
    });

    it('should throw error when decrypting with wrong event key', async () => {
      mockIdentity(alicePublicKey, alicePrivateKey);

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-wrong-key',
        authorId: base58.encode(alicePublicKey),
        content: 'Original post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      mockIdentity(bobPublicKey, bobPrivateKey);

      const correctKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      const reply: ThreadReply = {
        id: 'reply-wrong-key',
        threadId: event.id,
        authorId: base58.encode(bobPublicKey),
        content: 'Secret message',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        correctKey,
      );

      // Try to decrypt with wrong key
      const wrongKey = new Uint8Array(32);
      crypto.getRandomValues(wrongKey);

      await expect(
        ThreadEncryptionService.decryptThreadReply(encryptedReply, wrongKey),
      ).rejects.toThrow();
    });
  });

  describe('Event Key Reuse Security', () => {
    it('should safely reuse event key for multiple replies with unique IVs', async () => {
      mockIdentity(alicePublicKey, alicePrivateKey);

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-reuse-test',
        authorId: base58.encode(alicePublicKey),
        content: 'Original post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      mockIdentity(bobPublicKey, bobPrivateKey);

      // Extract event key
      const eventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      // Create 10 replies with same event key
      const replies: ThreadReply[] = [];
      for (let i = 0; i < 10; i++) {
        replies.push({
          id: `reply-${i}`,
          threadId: event.id,
          authorId: base58.encode(bobPublicKey),
          content: `Reply ${i}`,
          createdAt: new Date(),
        });
      }

      // Encrypt all replies with same key
      const encryptedReplies = await Promise.all(
        replies.map(reply => ThreadEncryptionService.encryptThreadReply(reply, eventKey)),
      );

      // All IVs should be unique
      const ivs = encryptedReplies.map(r => r.iv);
      const uniqueIVs = new Set(ivs);
      expect(uniqueIVs.size).toBe(10);

      // All should decrypt correctly
      const decryptedReplies = await Promise.all(
        encryptedReplies.map(encrypted =>
          ThreadEncryptionService.decryptThreadReply(encrypted, eventKey),
        ),
      );

      decryptedReplies.forEach((decrypted, i) => {
        expect(decrypted.content).toBe(`Reply ${i}`);
      });
    });
  });

  describe('Performance', () => {
    it('should efficiently handle events with many recipients', async () => {
      // Create 50 connections
      const participants: Connection[] = [];
      for (let i = 0; i < 50; i++) {
        const privateKey = ed25519.utils.randomSecretKey();
        const publicKey = await ed25519.getPublicKeyAsync(privateKey);
        const sharedSecret = await ECDHService.deriveSharedSecret(
          alicePrivateKey,
          publicKey,
        );

        participants.push({
          id: `conn-${i}`,
          userId: base58.encode(publicKey),
          displayName: `User ${i}`,
          sharedSecret,
          connectedAt: new Date(),
          status: 'mutual',
          trustLevel: 'verified',
        });
      }

      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-perf-test',
        authorId: base58.encode(alicePublicKey),
        content: 'Performance test post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const startTime = Date.now();
      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        participants,
      );
      const encryptionTime = Date.now() - startTime;

      // Should complete in reasonable time (< 1 second for 50 participants)
      expect(encryptionTime).toBeLessThan(1000);

      // Should have wrapped keys for all participants
      expect(Object.keys(encryptedEvent.wrappedKeys).length).toBeGreaterThanOrEqual(
        50,
      );
    });
  });
});
