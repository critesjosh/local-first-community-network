/**
 * Tests for ThreadService (v2.1 - Event-Based Threading)
 *
 * v2.1: Thread ID = Event ID
 * No separate thread creation - threads are automatic
 */

import ThreadService from '../../src/services/ThreadService';
import ThreadEncryptionService from '../../src/services/crypto/ThreadEncryptionService';
import PostStorageService from '../../src/services/storage/PostStorageService';
import ConnectionService from '../../src/services/ConnectionService';
import IdentityService from '../../src/services/IdentityService';
import Database from '../../src/services/storage/Database';
import {Connection, EncryptedThreadReply} from '../../src/types/models';
import {EncryptedEvent} from '../../src/services/crypto/EncryptionService';
import * as ed25519 from '@noble/ed25519';
import * as base58 from '../../src/utils/base58';

// Mock dependencies
jest.mock('../../src/services/storage/PostStorageService');
jest.mock('../../src/services/ConnectionService');
jest.mock('../../src/services/IdentityService');
jest.mock('../../src/services/storage/Database');

describe('ThreadService (v2.1)', () => {
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
      } as Connection,
      {
        id: 'conn-2',
        userId: base58.encode(charliePublicKey),
        displayName: 'Charlie',
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      } as Connection,
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

  describe('postReply', () => {
    const eventId = 'event-123';
    const replyContent = 'Test reply content';
    let mockEncryptedEvent: EncryptedEvent;
    let mockEventKey: Uint8Array;

    beforeEach(async () => {
      // Create a mock encrypted event (contains thread key in wrappedKeys)
      mockEventKey = new Uint8Array(32);
      crypto.getRandomValues(mockEventKey);

      mockEncryptedEvent = {
        id: eventId,
        authorId: base58.encode(alicePublicKey),
        timestamp: Date.now(),
        encryptedContent: 'encrypted-content',
        iv: 'content-iv',
        wrappedKeys: {
          'lookup-id-1': {
            wrappedKey: 'wrapped-key-1',
            keyWrapIV: 'key-wrap-iv-1',
          },
        },
      };

      (Database.getEncryptedEvent as jest.Mock).mockResolvedValue(mockEncryptedEvent);
      (PostStorageService.postThreadReply as jest.Mock).mockResolvedValue(undefined);

      // Mock ThreadEncryptionService.decryptThreadKey to extract event key
      jest.spyOn(ThreadEncryptionService, 'decryptThreadKey').mockResolvedValue(mockEventKey);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should post reply to event thread', async () => {
      const reply = await ThreadService.postReply(eventId, replyContent);

      expect(reply.id).toBeDefined();
      expect(reply.threadId).toBe(eventId); // Thread ID = Event ID
      expect(reply.authorId).toBe(base58.encode(alicePublicKey));
      expect(reply.content).toBe(replyContent);
      expect(reply.createdAt).toBeInstanceOf(Date);

      // Verify event key was extracted
      expect(ThreadEncryptionService.decryptThreadKey).toHaveBeenCalledWith(
        mockEncryptedEvent,
        mockConnections,
      );

      // Verify PostStorageService.postThreadReply was called
      expect(PostStorageService.postThreadReply).toHaveBeenCalledTimes(1);
      const encryptedReply = (PostStorageService.postThreadReply as jest.Mock).mock
        .calls[0][0];
      expect(encryptedReply.threadId).toBe(eventId);
      expect(encryptedReply.encryptedContent).toBeDefined();
    });

    it('should throw error when event not found', async () => {
      (Database.getEncryptedEvent as jest.Mock).mockResolvedValue(null);

      await expect(ThreadService.postReply(eventId, replyContent)).rejects.toThrow(
        'Failed to post reply',
      );
    });

    it('should throw error when no identity exists', async () => {
      (IdentityService.getKeyPair as jest.Mock).mockResolvedValue(null);

      await expect(ThreadService.postReply(eventId, replyContent)).rejects.toThrow(
        'Failed to post reply',
      );
    });

    it('should extract event key from wrappedKeys', async () => {
      await ThreadService.postReply(eventId, replyContent);

      // Verify we extracted the key from the event's wrappedKeys (not separate thread keys)
      expect(ThreadEncryptionService.decryptThreadKey).toHaveBeenCalledWith(
        expect.objectContaining({
          id: eventId,
          wrappedKeys: expect.any(Object),
        }),
        mockConnections,
      );
    });
  });

  describe('getReplies', () => {
    const eventId = 'event-456';
    let mockEncryptedEvent: EncryptedEvent;
    let mockEncryptedReplies: EncryptedThreadReply[];
    let mockEventKey: Uint8Array;

    beforeEach(() => {
      mockEventKey = new Uint8Array(32);
      crypto.getRandomValues(mockEventKey);

      mockEncryptedEvent = {
        id: eventId,
        authorId: base58.encode(alicePublicKey),
        timestamp: Date.now(),
        encryptedContent: 'encrypted-content',
        iv: 'content-iv',
        wrappedKeys: {
          'lookup-id-1': {
            wrappedKey: 'wrapped-key-1',
            keyWrapIV: 'key-wrap-iv-1',
          },
        },
      };

      mockEncryptedReplies = [
        {
          id: 'reply-1',
          threadId: eventId,
          authorId: base58.encode(bobPublicKey),
          timestamp: Date.now(),
          encryptedContent: 'encrypted-content-1',
          iv: 'iv-1',
        },
        {
          id: 'reply-2',
          threadId: eventId,
          authorId: base58.encode(charliePublicKey),
          timestamp: Date.now(),
          encryptedContent: 'encrypted-content-2',
          iv: 'iv-2',
        },
      ];

      (Database.getEncryptedEvent as jest.Mock).mockResolvedValue(mockEncryptedEvent);
      (PostStorageService.fetchThreadReplies as jest.Mock).mockResolvedValue(
        mockEncryptedReplies,
      );

      // Mock encryption service
      jest.spyOn(ThreadEncryptionService, 'decryptThreadKey').mockResolvedValue(mockEventKey);
      jest.spyOn(ThreadEncryptionService, 'decryptThreadReply').mockImplementation(
        async (encryptedReply, _eventKey) => ({
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

    it('should fetch and decrypt all replies for an event', async () => {
      const replies = await ThreadService.getReplies(eventId);

      expect(replies).toHaveLength(2);
      expect(replies[0].content).toBe('Decrypted: reply-1');
      expect(replies[1].content).toBe('Decrypted: reply-2');

      // Verify event key was extracted from event
      expect(ThreadEncryptionService.decryptThreadKey).toHaveBeenCalledWith(
        mockEncryptedEvent,
        mockConnections,
      );
    });

    it('should return empty array when event not found', async () => {
      (Database.getEncryptedEvent as jest.Mock).mockResolvedValue(null);

      const replies = await ThreadService.getReplies(eventId);

      expect(replies).toEqual([]);
    });

    it('should return empty array when no replies exist', async () => {
      (PostStorageService.fetchThreadReplies as jest.Mock).mockResolvedValue([]);

      const replies = await ThreadService.getReplies(eventId);

      expect(replies).toEqual([]);
    });

    it('should skip replies that fail to decrypt', async () => {
      // Make second reply fail to decrypt
      jest.spyOn(ThreadEncryptionService, 'decryptThreadReply').mockImplementation(
        async (encryptedReply, _eventKey) => {
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

      const replies = await ThreadService.getReplies(eventId);

      // Should only have the first reply that decrypted successfully
      expect(replies).toHaveLength(1);
      expect(replies[0].id).toBe('reply-1');
    });

    it('should use event key for all reply decryptions', async () => {
      await ThreadService.getReplies(eventId);

      // Verify all replies were decrypted with the same event key
      expect(ThreadEncryptionService.decryptThreadReply).toHaveBeenCalledTimes(2);
      expect(ThreadEncryptionService.decryptThreadReply).toHaveBeenNthCalledWith(
        1,
        mockEncryptedReplies[0],
        mockEventKey,
      );
      expect(ThreadEncryptionService.decryptThreadReply).toHaveBeenNthCalledWith(
        2,
        mockEncryptedReplies[1],
        mockEventKey,
      );
    });
  });

  describe('getReplyCount', () => {
    it('should return number of replies for event', async () => {
      const eventId = 'event-count';

      (Database.getThreadReplyCount as jest.Mock).mockResolvedValue(3);

      const count = await ThreadService.getReplyCount(eventId);

      expect(count).toBe(3);
      expect(Database.getThreadReplyCount).toHaveBeenCalledWith(eventId);
    });

    it('should return 0 for event with no replies', async () => {
      (Database.getThreadReplyCount as jest.Mock).mockResolvedValue(0);

      const count = await ThreadService.getReplyCount('empty-event');

      expect(count).toBe(0);
    });

    it('should return 0 on error', async () => {
      (Database.getThreadReplyCount as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      const count = await ThreadService.getReplyCount('error-event');

      expect(count).toBe(0);
    });
  });
});
