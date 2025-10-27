/**
 * Tests for ThreadEncryptionService (Shared Thread Key Encryption)
 */

import ThreadEncryptionService from '../../../src/services/crypto/ThreadEncryptionService';
import ECDHService from '../../../src/services/crypto/ECDH';
import {Connection, Thread, ThreadReply, EncryptedThread} from '../../../src/types/models';
import * as ed25519 from '@noble/ed25519';
import * as base58 from '../../../src/utils/base58';

describe('ThreadEncryptionService', () => {
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

  afterEach(() => {
    // Clear thread key cache after each test
    ThreadEncryptionService.clearCache();
  });

  describe('Thread Creation and Encryption', () => {
    it('should create encrypted thread with wrapped keys for participants', async () => {
      const thread: Thread = {
        id: 'thread-123',
        rootPostId: 'post-456',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey), base58.encode(charliePublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      // Verify structure
      expect(encryptedThread.id).toBe(thread.id);
      expect(encryptedThread.rootPostId).toBe(thread.rootPostId);
      expect(encryptedThread.authorId).toBe(thread.authorId);
      expect(encryptedThread.timestamp).toBe(thread.createdAt.getTime());
      expect(encryptedThread.wrappedThreadKeys).toBeDefined();

      // Should have wrapped keys for author + 2 participants = 3 total
      const wrappedKeyCount = Object.keys(encryptedThread.wrappedThreadKeys).length;
      expect(wrappedKeyCount).toBeGreaterThanOrEqual(2); // At least Bob and Charlie

      // Each wrapped key should have both key and IV
      Object.values(encryptedThread.wrappedThreadKeys).forEach(wrappedKey => {
        expect(wrappedKey.wrappedKey).toBeTruthy();
        expect(wrappedKey.keyWrapIV).toBeTruthy();
        // Base64 strings
        expect(typeof wrappedKey.wrappedKey).toBe('string');
        expect(typeof wrappedKey.keyWrapIV).toBe('string');
      });
    });

    it('should use HMAC-based recipient lookup IDs for privacy', async () => {
      const thread: Thread = {
        id: 'thread-789',
        rootPostId: 'post-789',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      // Recipient lookup IDs should not directly reveal participant identities
      const lookupIds = Object.keys(encryptedThread.wrappedThreadKeys);
      lookupIds.forEach(lookupId => {
        // Should be base64-encoded HMAC
        expect(lookupId.length).toBeGreaterThan(20);
        // Should not match any participant ID directly
        expect(lookupId).not.toBe(base58.encode(bobPublicKey));
        expect(lookupId).not.toBe(base58.encode(charliePublicKey));
      });
    });
  });

  describe('Thread Key Decryption', () => {
    let encryptedThread: EncryptedThread;

    beforeEach(async () => {
      const thread: Thread = {
        id: 'thread-decrypt-test',
        rootPostId: 'post-decrypt-test',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey), base58.encode(charliePublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );
    });

    it('should allow Bob to decrypt thread key', async () => {
      const threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      expect(threadKey).toBeDefined();
      expect(threadKey).toBeInstanceOf(Uint8Array);
      expect(threadKey.length).toBe(32); // 256-bit key
    });

    it('should allow Charlie to decrypt thread key', async () => {
      const threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        charlieConnections,
      );

      expect(threadKey).toBeDefined();
      expect(threadKey).toBeInstanceOf(Uint8Array);
      expect(threadKey.length).toBe(32);
    });

    it('should cache thread key after first decryption', async () => {
      // First decryption
      const threadKey1 = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      // Get cached key
      const cachedKey = ThreadEncryptionService.getCachedThreadKey(encryptedThread.id);

      expect(cachedKey).toBeDefined();
      expect(cachedKey).toEqual(threadKey1);

      // Second decryption should use cache (same reference)
      const threadKey2 = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      expect(threadKey2).toEqual(threadKey1);
    });

    it('should fail for user not in participant list', async () => {
      // Dave is not a participant
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
        ThreadEncryptionService.decryptThreadKey(encryptedThread, daveConnections),
      ).rejects.toThrow('Thread key not available for current user');
    });
  });

  describe('Thread Reply Encryption and Decryption', () => {
    let threadKey: Uint8Array;
    let encryptedThread: EncryptedThread;

    beforeEach(async () => {
      const thread: Thread = {
        id: 'thread-reply-test',
        rootPostId: 'post-reply-test',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      // Bob decrypts the thread key
      threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );
    });

    it('should encrypt reply with shared thread key', async () => {
      const reply: ThreadReply = {
        id: 'reply-1',
        threadId: 'thread-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'This is a test reply',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        threadKey,
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

    it('should decrypt reply with shared thread key', async () => {
      const originalReply: ThreadReply = {
        id: 'reply-2',
        threadId: 'thread-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Hello from Bob!',
        createdAt: new Date(),
      };

      // Encrypt
      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        originalReply,
        threadKey,
      );

      // Decrypt
      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply,
        threadKey,
      );

      expect(decryptedReply.id).toBe(originalReply.id);
      expect(decryptedReply.threadId).toBe(originalReply.threadId);
      expect(decryptedReply.authorId).toBe(originalReply.authorId);
      expect(decryptedReply.content).toBe(originalReply.content);
      expect(decryptedReply.createdAt.getTime()).toBe(originalReply.createdAt.getTime());
    });

    it('should allow any participant to encrypt and decrypt replies', async () => {
      // Bob creates a reply
      const bobReply: ThreadReply = {
        id: 'reply-bob',
        threadId: 'thread-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Reply from Bob',
        createdAt: new Date(),
      };

      const encryptedBobReply = await ThreadEncryptionService.encryptThreadReply(
        bobReply,
        threadKey,
      );

      // Alice decrypts Bob's reply using same thread key
      const aliceThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        aliceConnections,
      );

      const decryptedBobReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedBobReply,
        aliceThreadKey,
      );

      expect(decryptedBobReply.content).toBe(bobReply.content);
    });

    it('should handle unicode and special characters in replies', async () => {
      const reply: ThreadReply = {
        id: 'reply-unicode',
        threadId: 'thread-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: 'Hello 世界! 🌍 Special chars: @#$%^&*()',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        threadKey,
      );

      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply,
        threadKey,
      );

      expect(decryptedReply.content).toBe(reply.content);
    });

    it('should handle empty reply content', async () => {
      const reply: ThreadReply = {
        id: 'reply-empty',
        threadId: 'thread-reply-test',
        authorId: base58.encode(bobPublicKey),
        content: '',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        threadKey,
      );

      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedReply,
        threadKey,
      );

      expect(decryptedReply.content).toBe('');
    });
  });

  describe('Cache Management', () => {
    it('should clear thread key cache', async () => {
      const thread: Thread = {
        id: 'thread-cache-test',
        rootPostId: 'post-cache-test',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      // Decrypt to cache the key
      await ThreadEncryptionService.decryptThreadKey(encryptedThread, bobConnections);

      // Verify key is cached
      expect(ThreadEncryptionService.getCachedThreadKey(thread.id)).toBeDefined();

      // Clear cache
      ThreadEncryptionService.clearCache();

      // Verify key is no longer cached
      expect(ThreadEncryptionService.getCachedThreadKey(thread.id)).toBeUndefined();
    });

    it('should return undefined for non-existent cached key', () => {
      const cachedKey = ThreadEncryptionService.getCachedThreadKey('non-existent-thread');
      expect(cachedKey).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when encrypting with invalid thread key', async () => {
      const reply: ThreadReply = {
        id: 'reply-error',
        threadId: 'thread-error',
        authorId: base58.encode(bobPublicKey),
        content: 'Test',
        createdAt: new Date(),
      };

      const invalidKey = new Uint8Array(16); // Wrong size (should be 32)

      await expect(
        ThreadEncryptionService.encryptThreadReply(reply, invalidKey),
      ).rejects.toThrow();
    });

    it('should throw error when decrypting with wrong thread key', async () => {
      const thread: Thread = {
        id: 'thread-wrong-key',
        rootPostId: 'post-wrong-key',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      const correctKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      const reply: ThreadReply = {
        id: 'reply-wrong-key',
        threadId: thread.id,
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

  describe('Performance', () => {
    it('should efficiently handle threads with many participants', async () => {
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

      const thread: Thread = {
        id: 'thread-perf-test',
        rootPostId: 'post-perf-test',
        authorId: base58.encode(alicePublicKey),
        participants: participants.map(p => p.userId),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const startTime = Date.now();
      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        participants,
      );
      const encryptionTime = Date.now() - startTime;

      // Should complete in reasonable time (< 1 second for 50 participants)
      expect(encryptionTime).toBeLessThan(1000);

      // Should have wrapped keys for all participants
      expect(Object.keys(encryptedThread.wrappedThreadKeys).length).toBeGreaterThanOrEqual(
        50,
      );
    });
  });
});
