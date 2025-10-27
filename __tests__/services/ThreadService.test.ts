/**
 * Tests for ThreadService (High-level Thread Operations)
 */

import ThreadService from '../../src/services/ThreadService';
import ThreadEncryptionService from '../../src/services/crypto/ThreadEncryptionService';
import PostStorageService from '../../src/services/storage/PostStorageService';
import ConnectionService from '../../src/services/ConnectionService';
import IdentityService from '../../src/services/IdentityService';
import {Connection, EncryptedThread, EncryptedThreadReply} from '../../src/types/models';
import * as ed25519 from '@noble/ed25519';
import * as base58 from '../../src/utils/base58';

// Mock dependencies
jest.mock('../../src/services/storage/PostStorageService');
jest.mock('../../src/services/ConnectionService');
jest.mock('../../src/services/IdentityService');

describe('ThreadService', () => {
  let alicePrivateKey: Uint8Array;
  let alicePublicKey: Uint8Array;
  let bobPublicKey: Uint8Array;
  let charliePublicKey: Uint8Array;

  let mockConnections: Connection[];

  beforeAll(async () => {
    // Generate test identities
    alicePrivateKey = ed25519.utils.randomSecretKey();
    alicePublicKey = await ed25519.getPublicKeyAsync(alicePrivateKey);
    const bobPrivateKey = ed25519.utils.randomSecretKey();
    bobPublicKey = await ed25519.getPublicKeyAsync(bobPrivateKey);
    const charliePrivateKey = ed25519.utils.randomSecretKey();
    charliePublicKey = await ed25519.getPublicKeyAsync(charliePrivateKey);

    mockConnections = [
      {
        id: 'conn-1',
        userId: base58.encode(bobPublicKey),
        displayName: 'Bob',
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
      {
        id: 'conn-2',
        userId: base58.encode(charliePublicKey),
        displayName: 'Charlie',
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      },
    ];
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    (IdentityService.getKeyPair as jest.Mock).mockResolvedValue({
      publicKey: alicePublicKey,
      privateKey: alicePrivateKey,
    });

    (ConnectionService.getConnections as jest.Mock).mockResolvedValue(mockConnections);
  });

  describe('createThread', () => {
    it('should create thread with specified participants', async () => {
      const rootPostId = 'post-123';
      const participantIds = [base58.encode(bobPublicKey), base58.encode(charliePublicKey)];

      (PostStorageService.createThread as jest.Mock).mockResolvedValue(undefined);

      const thread = await ThreadService.createThread(rootPostId, participantIds);

      // Verify thread properties
      expect(thread.id).toBeDefined();
      expect(thread.rootPostId).toBe(rootPostId);
      expect(thread.authorId).toBe(base58.encode(alicePublicKey));
      expect(thread.participants).toEqual(participantIds);
      expect(thread.createdAt).toBeInstanceOf(Date);
      expect(thread.updatedAt).toBeInstanceOf(Date);

      // Verify PostStorageService.createThread was called
      expect(PostStorageService.createThread).toHaveBeenCalledTimes(1);
      const encryptedThread = (PostStorageService.createThread as jest.Mock).mock.calls[0][0];
      expect(encryptedThread.id).toBe(thread.id);
      expect(encryptedThread.rootPostId).toBe(rootPostId);
      expect(encryptedThread.wrappedThreadKeys).toBeDefined();
    });

    it('should handle empty participant list', async () => {
      const rootPostId = 'post-empty';
      const participantIds: string[] = [];

      (PostStorageService.createThread as jest.Mock).mockResolvedValue(undefined);

      const thread = await ThreadService.createThread(rootPostId, participantIds);

      expect(thread.participants).toEqual([]);
      expect(PostStorageService.createThread).toHaveBeenCalled();
    });

    it('should throw error when no identity exists', async () => {
      (IdentityService.getKeyPair as jest.Mock).mockResolvedValue(null);

      await expect(
        ThreadService.createThread('post-123', [base58.encode(bobPublicKey)]),
      ).rejects.toThrow('No identity found');
    });

    it('should filter out non-existent connections', async () => {
      const rootPostId = 'post-filter';
      const participantIds = [
        base58.encode(bobPublicKey),
        'non-existent-user-id', // This won't match any connection
      ];

      (PostStorageService.createThread as jest.Mock).mockResolvedValue(undefined);

      await ThreadService.createThread(rootPostId, participantIds);

      // Should still create thread, but only encrypt for Bob (who exists in connections)
      expect(PostStorageService.createThread).toHaveBeenCalled();
    });
  });

  describe('postReply', () => {
    const threadId = 'thread-123';
    const replyContent = 'Test reply content';
    let mockEncryptedThread: EncryptedThread;
    let mockThreadKey: Uint8Array;

    beforeEach(async () => {
      // Create a real encrypted thread for testing
      mockThreadKey = new Uint8Array(32);
      crypto.getRandomValues(mockThreadKey);

      mockEncryptedThread = {
        id: threadId,
        rootPostId: 'post-123',
        authorId: base58.encode(alicePublicKey),
        timestamp: Date.now(),
        wrappedThreadKeys: {},
      };

      (PostStorageService.fetchThread as jest.Mock).mockResolvedValue(mockEncryptedThread);
      (PostStorageService.postThreadReply as jest.Mock).mockResolvedValue(undefined);

      // Mock ThreadEncryptionService.decryptThreadKey
      jest.spyOn(ThreadEncryptionService, 'decryptThreadKey').mockResolvedValue(mockThreadKey);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should post reply to thread', async () => {
      const reply = await ThreadService.postReply(threadId, replyContent);

      expect(reply.id).toBeDefined();
      expect(reply.threadId).toBe(threadId);
      expect(reply.authorId).toBe(base58.encode(alicePublicKey));
      expect(reply.content).toBe(replyContent);
      expect(reply.createdAt).toBeInstanceOf(Date);

      // Verify PostStorageService.postThreadReply was called
      expect(PostStorageService.postThreadReply).toHaveBeenCalledTimes(1);
      const encryptedReply = (PostStorageService.postThreadReply as jest.Mock).mock
        .calls[0][0];
      expect(encryptedReply.threadId).toBe(threadId);
      expect(encryptedReply.encryptedContent).toBeDefined();
    });

    it('should throw error when thread not found', async () => {
      (PostStorageService.fetchThread as jest.Mock).mockResolvedValue(null);

      await expect(ThreadService.postReply(threadId, replyContent)).rejects.toThrow(
        'Thread not found',
      );
    });

    it('should throw error when no identity exists', async () => {
      (IdentityService.getKeyPair as jest.Mock).mockResolvedValue(null);

      await expect(ThreadService.postReply(threadId, replyContent)).rejects.toThrow(
        'No identity found',
      );
    });
  });

  describe('getThreadWithReplies', () => {
    const threadId = 'thread-456';
    let mockEncryptedThread: EncryptedThread;
    let mockEncryptedReplies: EncryptedThreadReply[];
    let mockThreadKey: Uint8Array;

    beforeEach(() => {
      mockThreadKey = new Uint8Array(32);
      crypto.getRandomValues(mockThreadKey);

      mockEncryptedThread = {
        id: threadId,
        rootPostId: 'post-456',
        authorId: base58.encode(alicePublicKey),
        timestamp: Date.now(),
        wrappedThreadKeys: {},
      };

      mockEncryptedReplies = [
        {
          id: 'reply-1',
          threadId,
          authorId: base58.encode(bobPublicKey),
          timestamp: Date.now(),
          encryptedContent: 'encrypted-content-1',
          iv: 'iv-1',
        },
        {
          id: 'reply-2',
          threadId,
          authorId: base58.encode(charliePublicKey),
          timestamp: Date.now(),
          encryptedContent: 'encrypted-content-2',
          iv: 'iv-2',
        },
      ];

      (PostStorageService.fetchThread as jest.Mock).mockResolvedValue(mockEncryptedThread);
      (PostStorageService.fetchThreadReplies as jest.Mock).mockResolvedValue(
        mockEncryptedReplies,
      );

      // Mock encryption service
      jest.spyOn(ThreadEncryptionService, 'decryptThreadKey').mockResolvedValue(mockThreadKey);
      jest.spyOn(ThreadEncryptionService, 'decryptThreadReply').mockImplementation(
        async (encryptedReply, _threadKey) => ({
          id: encryptedReply.id,
          threadId: encryptedReply.threadId,
          authorId: encryptedReply.authorId,
          content: `Decrypted: ${encryptedReply.id}`,
          createdAt: new Date(encryptedReply.timestamp),
        }),
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should fetch and decrypt thread with replies', async () => {
      const result = await ThreadService.getThreadWithReplies(threadId);

      expect(result.thread).toBeDefined();
      expect(result.thread?.id).toBe(threadId);
      expect(result.thread?.rootPostId).toBe('post-456');

      expect(result.replies).toHaveLength(2);
      expect(result.replies[0].content).toBe('Decrypted: reply-1');
      expect(result.replies[1].content).toBe('Decrypted: reply-2');
    });

    it('should return null thread when not found', async () => {
      (PostStorageService.fetchThread as jest.Mock).mockResolvedValue(null);

      const result = await ThreadService.getThreadWithReplies(threadId);

      expect(result.thread).toBeNull();
      expect(result.replies).toEqual([]);
    });

    it('should skip replies that fail to decrypt', async () => {
      // Make second reply fail to decrypt
      jest.spyOn(ThreadEncryptionService, 'decryptThreadReply').mockImplementation(
        async (encryptedReply, _threadKey) => {
          if (encryptedReply.id === 'reply-2') {
            throw new Error('Decryption failed');
          }
          return {
            id: encryptedReply.id,
            threadId: encryptedReply.threadId,
            authorId: encryptedReply.authorId,
            content: `Decrypted: ${encryptedReply.id}`,
            createdAt: new Date(encryptedReply.timestamp),
          };
        },
      );

      const result = await ThreadService.getThreadWithReplies(threadId);

      // Should only have the first reply that decrypted successfully
      expect(result.replies).toHaveLength(1);
      expect(result.replies[0].id).toBe('reply-1');
    });
  });

  describe('getThreads', () => {
    it('should fetch all threads', async () => {
      const mockEncryptedThreads: EncryptedThread[] = [
        {
          id: 'thread-1',
          rootPostId: 'post-1',
          authorId: base58.encode(alicePublicKey),
          timestamp: Date.now(),
          wrappedThreadKeys: {},
        },
        {
          id: 'thread-2',
          rootPostId: 'post-2',
          authorId: base58.encode(bobPublicKey),
          timestamp: Date.now(),
          wrappedThreadKeys: {},
        },
      ];

      (PostStorageService.fetchThreads as jest.Mock).mockResolvedValue(
        mockEncryptedThreads,
      );

      const threads = await ThreadService.getThreads();

      expect(threads).toHaveLength(2);
      expect(threads[0].id).toBe('thread-1');
      expect(threads[1].id).toBe('thread-2');
    });

    it('should filter threads by timestamp', async () => {
      const since = Date.now() - 86400000; // 24 hours ago

      await ThreadService.getThreads(since);

      expect(PostStorageService.fetchThreads).toHaveBeenCalledWith(since, undefined);
    });

    it('should limit number of threads fetched', async () => {
      await ThreadService.getThreads(0, 10);

      expect(PostStorageService.fetchThreads).toHaveBeenCalledWith(0, 10);
    });
  });

  describe('getThreadForPost', () => {
    it('should return thread for post', async () => {
      const postId = 'post-789';
      const mockThread: EncryptedThread = {
        id: postId,
        rootPostId: postId,
        authorId: base58.encode(alicePublicKey),
        timestamp: Date.now(),
        wrappedThreadKeys: {},
      };

      (PostStorageService.fetchThread as jest.Mock).mockResolvedValue(mockThread);

      const thread = await ThreadService.getThreadForPost(postId);

      expect(thread).toBeDefined();
      expect(thread?.id).toBe(postId);
      expect(thread?.rootPostId).toBe(postId);
    });

    it('should return null when thread does not exist', async () => {
      (PostStorageService.fetchThread as jest.Mock).mockResolvedValue(null);

      const thread = await ThreadService.getThreadForPost('non-existent');

      expect(thread).toBeNull();
    });
  });

  describe('getReplyCount', () => {
    it('should return number of replies for thread', async () => {
      const threadId = 'thread-count';
      const mockReplies: EncryptedThreadReply[] = [
        {
          id: 'reply-1',
          threadId,
          authorId: base58.encode(bobPublicKey),
          timestamp: Date.now(),
          encryptedContent: 'content-1',
          iv: 'iv-1',
        },
        {
          id: 'reply-2',
          threadId,
          authorId: base58.encode(charliePublicKey),
          timestamp: Date.now(),
          encryptedContent: 'content-2',
          iv: 'iv-2',
        },
        {
          id: 'reply-3',
          threadId,
          authorId: base58.encode(alicePublicKey),
          timestamp: Date.now(),
          encryptedContent: 'content-3',
          iv: 'iv-3',
        },
      ];

      (PostStorageService.fetchThreadReplies as jest.Mock).mockResolvedValue(mockReplies);

      const count = await ThreadService.getReplyCount(threadId);

      expect(count).toBe(3);
    });

    it('should return 0 for thread with no replies', async () => {
      (PostStorageService.fetchThreadReplies as jest.Mock).mockResolvedValue([]);

      const count = await ThreadService.getReplyCount('empty-thread');

      expect(count).toBe(0);
    });

    it('should return 0 on error', async () => {
      (PostStorageService.fetchThreadReplies as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      const count = await ThreadService.getReplyCount('error-thread');

      expect(count).toBe(0);
    });
  });
});
