/**
 * Integration Tests for Threading Feature (v2.1 - Event Key Reuse)
 *
 * Tests the complete end-to-end flow where:
 * - Thread ID = Event ID (no separate threads)
 * - Event keys are reused for reply encryption
 * - Every post automatically has a thread
 */

import ThreadEncryptionService from '../../src/services/crypto/ThreadEncryptionService';
import EncryptionService from '../../src/services/crypto/EncryptionService';
import ECDHService from '../../src/services/crypto/ECDH';
import IdentityService from '../../src/services/IdentityService';
import {Connection, Event} from '../../src/types/models';
import * as ed25519 from '@noble/ed25519';
import * as base58 from '../../src/utils/base58';

// Mock IdentityService
jest.mock('../../src/services/IdentityService');

describe('Threading Integration Tests (v2.1)', () => {
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
    // Generate identities for three users
    alicePrivateKey = ed25519.utils.randomSecretKey();
    alicePublicKey = await ed25519.getPublicKeyAsync(alicePrivateKey);
    bobPrivateKey = ed25519.utils.randomSecretKey();
    bobPublicKey = await ed25519.getPublicKeyAsync(bobPrivateKey);
    charliePrivateKey = ed25519.utils.randomSecretKey();
    charliePublicKey = await ed25519.getPublicKeyAsync(charliePrivateKey);

    // Setup ECDH connections
    const aliceBobSecret = await ECDHService.deriveSharedSecret(
      alicePrivateKey,
      bobPublicKey,
    );
    const aliceCharlieSecret = await ECDHService.deriveSharedSecret(
      alicePrivateKey,
      charliePublicKey,
    );
    const bobAliceSecret = await ECDHService.deriveSharedSecret(bobPrivateKey, alicePublicKey);
    const charlieAliceSecret = await ECDHService.deriveSharedSecret(
      charliePrivateKey,
      alicePublicKey,
    );

    aliceConnections = [
      {
        id: 'alice-bob',
        userId: base58.encode(bobPublicKey),
        displayName: 'Bob',
        sharedSecret: aliceBobSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
      {
        id: 'alice-charlie',
        userId: base58.encode(charliePublicKey),
        displayName: 'Charlie',
        sharedSecret: aliceCharlieSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];

    bobConnections = [
      {
        id: 'bob-alice',
        userId: base58.encode(alicePublicKey),
        displayName: 'Alice',
        sharedSecret: bobAliceSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];

    charlieConnections = [
      {
        id: 'charlie-alice',
        userId: base58.encode(alicePublicKey),
        displayName: 'Alice',
        sharedSecret: charlieAliceSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];
  });

  beforeEach(() => {
    // Mock IdentityService to return null (forces use of connections only)
    (IdentityService.getKeyPair as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    ThreadEncryptionService.clearCache();
    jest.clearAllMocks();
  });

  describe('Complete Thread Lifecycle (Event-Based)', () => {
    it('should allow Alice to create post, Bob to reply, and Charlie to read', async () => {
      // STEP 1: Alice creates a post (which automatically has a thread)
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-integration-1',
        authorId: base58.encode(alicePublicKey),
        content: 'Hey everyone! Check out this new feature.',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      expect(encryptedEvent).toBeDefined();
      expect(encryptedEvent.id).toBe(event.id);
      expect(encryptedEvent.wrappedKeys).toBeDefined();

      // STEP 2: Bob extracts the event key (which is the thread key)
      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      expect(bobEventKey).toBeDefined();
      expect(bobEventKey.length).toBe(32);

      // STEP 3: Bob posts a reply using the event key
      const bobReply = {
        id: 'reply-bob-1',
        threadId: event.id, // Thread ID = Event ID
        authorId: base58.encode(bobPublicKey),
        content: "Hey Alice! This thread feature is awesome!",
        createdAt: new Date(),
      };

      const encryptedBobReply = await ThreadEncryptionService.encryptThreadReply(
        bobReply,
        bobEventKey,
      );

      expect(encryptedBobReply.encryptedContent).toBeTruthy();

      // STEP 4: Charlie extracts the same event key
      const charlieEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        charlieConnections,
      );

      expect(charlieEventKey).toBeDefined();

      // STEP 5: Charlie decrypts Bob's reply using the event key
      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedBobReply,
        charlieEventKey,
      );

      expect(decryptedReply.content).toBe(bobReply.content);
      expect(decryptedReply.authorId).toBe(bobReply.authorId);

      // STEP 6: Alice also decrypts Bob's reply
      const aliceEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        aliceConnections,
      );

      const aliceDecryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedBobReply,
        aliceEventKey,
      );

      expect(aliceDecryptedReply.content).toBe(bobReply.content);
    });

    it('should support multi-reply conversation with event key reuse', async () => {
      // Alice creates a post
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-conversation',
        authorId: base58.encode(alicePublicKey),
        content: 'Starting a conversation!',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // All participants extract the event key (same key for everyone)
      const aliceEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        aliceConnections,
      );
      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );
      const charlieEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        charlieConnections,
      );

      // Create multiple replies using the same event key
      const replies = [];

      // Alice's reply
      const aliceReply = {
        id: 'reply-alice',
        threadId: event.id,
        authorId: base58.encode(alicePublicKey),
        content: 'Welcome to the thread!',
        createdAt: new Date(),
      };
      replies.push(await ThreadEncryptionService.encryptThreadReply(aliceReply, aliceEventKey));

      // Bob's reply
      const bobReply = {
        id: 'reply-bob',
        threadId: event.id,
        authorId: base58.encode(bobPublicKey),
        content: 'Thanks Alice!',
        createdAt: new Date(),
      };
      replies.push(await ThreadEncryptionService.encryptThreadReply(bobReply, bobEventKey));

      // Charlie's reply
      const charlieReply = {
        id: 'reply-charlie',
        threadId: event.id,
        authorId: base58.encode(charliePublicKey),
        content: 'Great to be here!',
        createdAt: new Date(),
      };
      replies.push(
        await ThreadEncryptionService.encryptThreadReply(charlieReply, charlieEventKey),
      );

      // All participants can decrypt all replies using their copy of the same event key
      for (const encryptedReply of replies) {
        const aliceDecrypted = await ThreadEncryptionService.decryptThreadReply(
          encryptedReply,
          aliceEventKey,
        );
        const bobDecrypted = await ThreadEncryptionService.decryptThreadReply(
          encryptedReply,
          bobEventKey,
        );
        const charlieDecrypted = await ThreadEncryptionService.decryptThreadReply(
          encryptedReply,
          charlieEventKey,
        );

        // All should decrypt to same content
        expect(aliceDecrypted.content).toBe(bobDecrypted.content);
        expect(bobDecrypted.content).toBe(charlieDecrypted.content);
      }
    });
  });

  describe('Security and Privacy', () => {
    it('should prevent non-recipients from extracting event key', async () => {
      // Alice creates post for Bob only (not Charlie)
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-private',
        authorId: base58.encode(alicePublicKey),
        content: 'Private message for Bob',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]], // Only Alice-Bob connection
      );

      // Bob can extract event key
      await expect(
        ThreadEncryptionService.decryptThreadKey(encryptedEvent, bobConnections),
      ).resolves.toBeDefined();

      // Charlie cannot extract event key
      await expect(
        ThreadEncryptionService.decryptThreadKey(encryptedEvent, charlieConnections),
      ).rejects.toThrow('Thread key not available');
    });

    it('should prevent non-recipients from reading replies', async () => {
      // Post with Bob only
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-exclusive',
        authorId: base58.encode(alicePublicKey),
        content: 'Exclusive post for Bob',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      // Bob posts a reply
      const bobReply = {
        id: 'reply-secret',
        threadId: event.id,
        authorId: base58.encode(bobPublicKey),
        content: 'Secret message for Alice',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        bobReply,
        bobEventKey,
      );

      // Charlie tries to decrypt with wrong key
      const wrongKey = new Uint8Array(32);
      crypto.getRandomValues(wrongKey);

      await expect(
        ThreadEncryptionService.decryptThreadReply(encryptedReply, wrongKey),
      ).rejects.toThrow();
    });

    it('should not leak recipient information in encrypted event', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-privacy',
        authorId: base58.encode(alicePublicKey),
        content: 'Testing privacy',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        aliceConnections,
      );

      // Wrapped keys should use HMAC-based lookup IDs, not direct user IDs
      const lookupIds = Object.keys(encryptedEvent.wrappedKeys);

      for (const lookupId of lookupIds) {
        expect(lookupId).not.toBe(base58.encode(bobPublicKey));
        expect(lookupId).not.toBe(base58.encode(charliePublicKey));
        expect(lookupId).not.toBe(base58.encode(alicePublicKey));
      }
    });
  });

  describe('Event Key Reuse Security', () => {
    it('should safely reuse event key for multiple replies', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-reuse',
        authorId: base58.encode(alicePublicKey),
        content: 'Testing event key reuse',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      // Create multiple replies with same event key
      const replies = [];
      for (let i = 0; i < 10; i++) {
        const reply = {
          id: `reply-${i}`,
          threadId: event.id,
          authorId: base58.encode(bobPublicKey),
          content: `Reply number ${i}`,
          createdAt: new Date(),
        };
        replies.push(await ThreadEncryptionService.encryptThreadReply(reply, bobEventKey));
      }

      // All IVs should be unique (critical for key reuse safety)
      const ivs = replies.map(r => r.iv);
      const uniqueIVs = new Set(ivs);
      expect(uniqueIVs.size).toBe(10);

      // All should decrypt correctly
      for (let i = 0; i < 10; i++) {
        const decrypted = await ThreadEncryptionService.decryptThreadReply(
          replies[i],
          bobEventKey,
        );
        expect(decrypted.content).toBe(`Reply number ${i}`);
      }
    });
  });

  describe('Performance and Efficiency', () => {
    it('should efficiently handle large thread conversations', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-large',
        authorId: base58.encode(alicePublicKey),
        content: 'Large conversation test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      // Create 100 replies
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const reply = {
          id: `reply-${i}`,
          threadId: event.id,
          authorId: base58.encode(bobPublicKey),
          content: `Reply number ${i}`,
          createdAt: new Date(),
        };

        const encrypted = await ThreadEncryptionService.encryptThreadReply(
          reply,
          bobEventKey,
        );
        const decrypted = await ThreadEncryptionService.decryptThreadReply(
          encrypted,
          bobEventKey,
        );

        expect(decrypted.content).toBe(reply.content);
      }

      const duration = Date.now() - startTime;

      // 100 encrypt+decrypt cycles should complete in reasonable time
      // (< 1 second on most devices)
      expect(duration).toBeLessThan(1000);
    });

    it('should cache event key for better performance', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-cache',
        authorId: base58.encode(alicePublicKey),
        content: 'Cache test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      // First extraction
      const startTime1 = Date.now();
      const eventKey1 = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );
      const duration1 = Date.now() - startTime1;

      // Second extraction (should use cache)
      const startTime2 = Date.now();
      const eventKey2 = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );
      const duration2 = Date.now() - startTime2;

      // Cached lookup should be much faster
      expect(duration2).toBeLessThan(duration1);
      expect(eventKey1).toEqual(eventKey2);

      // Verify cache is being used
      const cachedKey = ThreadEncryptionService.getCachedThreadKey(event.id);
      expect(cachedKey).toEqual(eventKey1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty reply content', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-empty',
        authorId: base58.encode(alicePublicKey),
        content: 'Original post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      const reply = {
        id: 'reply-empty',
        threadId: event.id,
        authorId: base58.encode(bobPublicKey),
        content: '',
        createdAt: new Date(),
      };

      const encrypted = await ThreadEncryptionService.encryptThreadReply(reply, bobEventKey);
      const decrypted = await ThreadEncryptionService.decryptThreadReply(
        encrypted,
        bobEventKey,
      );

      expect(decrypted.content).toBe('');
    });

    it('should handle very long reply content', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-long',
        authorId: base58.encode(alicePublicKey),
        content: 'Original post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      // 10KB of text
      const longContent = 'A'.repeat(10000);

      const reply = {
        id: 'reply-long',
        threadId: event.id,
        authorId: base58.encode(bobPublicKey),
        content: longContent,
        createdAt: new Date(),
      };

      const encrypted = await ThreadEncryptionService.encryptThreadReply(reply, bobEventKey);
      const decrypted = await ThreadEncryptionService.decryptThreadReply(
        encrypted,
        bobEventKey,
      );

      expect(decrypted.content).toBe(longContent);
      expect(decrypted.content.length).toBe(10000);
    });

    it('should handle unicode and emojis in replies', async () => {
      const event: Omit<Event, 'encryptedFor'> = {
        id: 'event-unicode',
        authorId: base58.encode(alicePublicKey),
        content: 'Original post',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        [aliceConnections[0]],
      );

      const bobEventKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        bobConnections,
      );

      const reply = {
        id: 'reply-unicode',
        threadId: event.id,
        authorId: base58.encode(bobPublicKey),
        content: '你好世界 🌍 مرحبا بالعالم Привет мир 🎉😀',
        createdAt: new Date(),
      };

      const encrypted = await ThreadEncryptionService.encryptThreadReply(reply, bobEventKey);
      const decrypted = await ThreadEncryptionService.decryptThreadReply(
        encrypted,
        bobEventKey,
      );

      expect(decrypted.content).toBe(reply.content);
    });
  });
});
