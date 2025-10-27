/**
 * Integration Tests for Threading Feature
 * Tests the complete end-to-end flow of creating threads and posting replies
 */

import ThreadService from '../../src/services/ThreadService';
import ThreadEncryptionService from '../../src/services/crypto/ThreadEncryptionService';
import ECDHService from '../../src/services/crypto/ECDH';
import {Connection} from '../../src/types/models';
import * as ed25519 from '@noble/ed25519';
import * as base58 from '../../src/utils/base58';

describe('Threading Integration Tests', () => {
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

  afterEach(() => {
    ThreadEncryptionService.clearCache();
  });

  describe('Complete Thread Lifecycle', () => {
    it('should allow Alice to create thread, Bob to reply, and Charlie to read', async () => {
      // STEP 1: Alice creates a thread
      const participantIds = [base58.encode(bobPublicKey), base58.encode(charliePublicKey)];
      const thread = {
        id: 'thread-integration-1',
        rootPostId: 'post-integration-1',
        authorId: base58.encode(alicePublicKey),
        participants: participantIds,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      expect(encryptedThread).toBeDefined();
      expect(encryptedThread.id).toBe(thread.id);

      // STEP 2: Bob decrypts the thread key
      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      expect(bobThreadKey).toBeDefined();
      expect(bobThreadKey.length).toBe(32);

      // STEP 3: Bob posts a reply
      const bobReply = {
        id: 'reply-bob-1',
        threadId: thread.id,
        authorId: base58.encode(bobPublicKey),
        content: "Hey Alice! This thread feature is awesome!",
        createdAt: new Date(),
      };

      const encryptedBobReply = await ThreadEncryptionService.encryptThreadReply(
        bobReply,
        bobThreadKey,
      );

      expect(encryptedBobReply.encryptedContent).toBeTruthy();

      // STEP 4: Charlie decrypts the thread key
      const charlieThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        charlieConnections,
      );

      expect(charlieThreadKey).toBeDefined();

      // STEP 5: Charlie decrypts Bob's reply
      const decryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedBobReply,
        charlieThreadKey,
      );

      expect(decryptedReply.content).toBe(bobReply.content);
      expect(decryptedReply.authorId).toBe(bobReply.authorId);

      // STEP 6: Alice also decrypts Bob's reply
      const aliceThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        aliceConnections,
      );

      const aliceDecryptedReply = await ThreadEncryptionService.decryptThreadReply(
        encryptedBobReply,
        aliceThreadKey,
      );

      expect(aliceDecryptedReply.content).toBe(bobReply.content);
    });

    it('should support multi-reply conversation', async () => {
      // Create thread
      const thread = {
        id: 'thread-conversation',
        rootPostId: 'post-conversation',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey), base58.encode(charliePublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      // Get thread keys for all participants
      const aliceThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        aliceConnections,
      );
      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );
      const charlieThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        charlieConnections,
      );

      // Create multiple replies
      const replies = [];

      // Alice's reply
      const aliceReply = {
        id: 'reply-alice',
        threadId: thread.id,
        authorId: base58.encode(alicePublicKey),
        content: 'Welcome to the thread!',
        createdAt: new Date(),
      };
      replies.push(await ThreadEncryptionService.encryptThreadReply(aliceReply, aliceThreadKey));

      // Bob's reply
      const bobReply = {
        id: 'reply-bob',
        threadId: thread.id,
        authorId: base58.encode(bobPublicKey),
        content: 'Thanks Alice!',
        createdAt: new Date(),
      };
      replies.push(await ThreadEncryptionService.encryptThreadReply(bobReply, bobThreadKey));

      // Charlie's reply
      const charlieReply = {
        id: 'reply-charlie',
        threadId: thread.id,
        authorId: base58.encode(charliePublicKey),
        content: 'Great to be here!',
        createdAt: new Date(),
      };
      replies.push(
        await ThreadEncryptionService.encryptThreadReply(charlieReply, charlieThreadKey),
      );

      // All participants can decrypt all replies
      for (const encryptedReply of replies) {
        const aliceDecrypted = await ThreadEncryptionService.decryptThreadReply(
          encryptedReply,
          aliceThreadKey,
        );
        const bobDecrypted = await ThreadEncryptionService.decryptThreadReply(
          encryptedReply,
          bobThreadKey,
        );
        const charlieDecrypted = await ThreadEncryptionService.decryptThreadReply(
          encryptedReply,
          charlieThreadKey,
        );

        // All should decrypt to same content
        expect(aliceDecrypted.content).toBe(bobDecrypted.content);
        expect(bobDecrypted.content).toBe(charlieDecrypted.content);
      }
    });
  });

  describe('Security and Privacy', () => {
    it('should prevent non-participants from decrypting thread key', async () => {
      // Alice creates thread for Bob only (not Charlie)
      const thread = {
        id: 'thread-private',
        rootPostId: 'post-private',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]], // Only Alice-Bob connection
      );

      // Bob can decrypt
      await expect(
        ThreadEncryptionService.decryptThreadKey(encryptedThread, bobConnections),
      ).resolves.toBeDefined();

      // Charlie cannot decrypt
      await expect(
        ThreadEncryptionService.decryptThreadKey(encryptedThread, charlieConnections),
      ).rejects.toThrow('Thread key not available');
    });

    it('should prevent non-participants from reading replies', async () => {
      // Thread with Bob only
      const thread = {
        id: 'thread-exclusive',
        rootPostId: 'post-exclusive',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]],
      );

      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      // Bob posts a reply
      const bobReply = {
        id: 'reply-secret',
        threadId: thread.id,
        authorId: base58.encode(bobPublicKey),
        content: 'Secret message for Alice',
        createdAt: new Date(),
      };

      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        bobReply,
        bobThreadKey,
      );

      // Charlie tries to decrypt with wrong key
      const wrongKey = new Uint8Array(32);
      crypto.getRandomValues(wrongKey);

      await expect(
        ThreadEncryptionService.decryptThreadReply(encryptedReply, wrongKey),
      ).rejects.toThrow();
    });

    it('should not leak participant information in encrypted thread', async () => {
      const thread = {
        id: 'thread-privacy',
        rootPostId: 'post-privacy',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey), base58.encode(charliePublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        aliceConnections,
      );

      // Wrapped keys should use HMAC-based lookup IDs, not direct user IDs
      const lookupIds = Object.keys(encryptedThread.wrappedThreadKeys);

      for (const lookupId of lookupIds) {
        expect(lookupId).not.toBe(base58.encode(bobPublicKey));
        expect(lookupId).not.toBe(base58.encode(charliePublicKey));
        expect(lookupId).not.toBe(base58.encode(alicePublicKey));
      }
    });
  });

  describe('Performance and Efficiency', () => {
    it('should efficiently handle large thread conversations', async () => {
      const thread = {
        id: 'thread-large',
        rootPostId: 'post-large',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]],
      );

      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      // Create 100 replies
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const reply = {
          id: `reply-${i}`,
          threadId: thread.id,
          authorId: base58.encode(bobPublicKey),
          content: `Reply number ${i}`,
          createdAt: new Date(),
        };

        const encrypted = await ThreadEncryptionService.encryptThreadReply(
          reply,
          bobThreadKey,
        );
        const decrypted = await ThreadEncryptionService.decryptThreadReply(
          encrypted,
          bobThreadKey,
        );

        expect(decrypted.content).toBe(reply.content);
      }

      const duration = Date.now() - startTime;

      // 100 encrypt+decrypt cycles should complete in reasonable time
      // (< 1 second on most devices)
      expect(duration).toBeLessThan(1000);
    });

    it('should cache thread key for better performance', async () => {
      const thread = {
        id: 'thread-cache',
        rootPostId: 'post-cache',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]],
      );

      // First decryption
      const startTime1 = Date.now();
      const threadKey1 = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );
      const duration1 = Date.now() - startTime1;

      // Second decryption (should use cache)
      const startTime2 = Date.now();
      const threadKey2 = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );
      const duration2 = Date.now() - startTime2;

      // Cached lookup should be much faster
      expect(duration2).toBeLessThan(duration1);
      expect(threadKey1).toEqual(threadKey2);

      // Verify cache is being used
      const cachedKey = ThreadEncryptionService.getCachedThreadKey(thread.id);
      expect(cachedKey).toEqual(threadKey1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty thread content', async () => {
      const thread = {
        id: 'thread-empty',
        rootPostId: 'post-empty',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]],
      );

      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      const reply = {
        id: 'reply-empty',
        threadId: thread.id,
        authorId: base58.encode(bobPublicKey),
        content: '',
        createdAt: new Date(),
      };

      const encrypted = await ThreadEncryptionService.encryptThreadReply(reply, bobThreadKey);
      const decrypted = await ThreadEncryptionService.decryptThreadReply(
        encrypted,
        bobThreadKey,
      );

      expect(decrypted.content).toBe('');
    });

    it('should handle very long reply content', async () => {
      const thread = {
        id: 'thread-long',
        rootPostId: 'post-long',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]],
      );

      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      // 10KB of text
      const longContent = 'A'.repeat(10000);

      const reply = {
        id: 'reply-long',
        threadId: thread.id,
        authorId: base58.encode(bobPublicKey),
        content: longContent,
        createdAt: new Date(),
      };

      const encrypted = await ThreadEncryptionService.encryptThreadReply(reply, bobThreadKey);
      const decrypted = await ThreadEncryptionService.decryptThreadReply(
        encrypted,
        bobThreadKey,
      );

      expect(decrypted.content).toBe(longContent);
      expect(decrypted.content.length).toBe(10000);
    });

    it('should handle unicode and emojis in replies', async () => {
      const thread = {
        id: 'thread-unicode',
        rootPostId: 'post-unicode',
        authorId: base58.encode(alicePublicKey),
        participants: [base58.encode(bobPublicKey)],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        [aliceConnections[0]],
      );

      const bobThreadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        bobConnections,
      );

      const reply = {
        id: 'reply-unicode',
        threadId: thread.id,
        authorId: base58.encode(bobPublicKey),
        content: '你好世界 🌍 مرحبا بالعالم Привет мир 🎉😀',
        createdAt: new Date(),
      };

      const encrypted = await ThreadEncryptionService.encryptThreadReply(reply, bobThreadKey);
      const decrypted = await ThreadEncryptionService.decryptThreadReply(
        encrypted,
        bobThreadKey,
      );

      expect(decrypted.content).toBe(reply.content);
    });
  });
});
