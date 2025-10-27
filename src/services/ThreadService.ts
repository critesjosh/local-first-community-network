/**
 * ThreadService - High-level service for managing threads
 *
 * Provides convenient methods for creating threads and posting replies
 * with automatic encryption and storage handling.
 *
 * Usage:
 * ```typescript
 * import ThreadService from './services/ThreadService';
 *
 * // Create a thread
 * const thread = await ThreadService.createThread(eventId, participants);
 *
 * // Post a reply
 * await ThreadService.postReply(threadId, content);
 *
 * // Get thread with replies
 * const conversation = await ThreadService.getThreadWithReplies(threadId);
 * ```
 */

import {v4 as uuidv4} from 'uuid';
import {Thread, ThreadReply, Connection, EncryptedThread, EncryptedThreadReply} from '../types/models';
import ThreadEncryptionService from './crypto/ThreadEncryptionService';
import PostStorageService from './storage/PostStorageService';
import ConnectionService from './ConnectionService';
import IdentityService from './IdentityService';
import * as base58 from '../utils/base58';

class ThreadService {
  /**
   * Create a new thread
   *
   * @param rootPostId - The ID of the post that starts the thread
   * @param participantUserIds - Array of user IDs who can participate
   * @returns The created thread
   */
  async createThread(
    rootPostId: string,
    participantUserIds: string[],
  ): Promise<Thread> {
    try {
      console.log(`[ThreadService] Creating thread for post ${rootPostId} with ${participantUserIds.length} participants`);

      // Get current user's identity
      const keyPair = await IdentityService.getKeyPair();
      if (!keyPair) {
        throw new Error('No identity found. Please create an identity first.');
      }

      const authorId = base58.encode(keyPair.publicKey);

      // Get connections for the participants
      const allConnections = await ConnectionService.getConnections();
      const participantConnections = allConnections.filter(conn =>
        participantUserIds.includes(conn.userId)
      );

      if (participantConnections.length !== participantUserIds.length) {
        console.warn(`[ThreadService] Not all participants are connections. Expected ${participantUserIds.length}, found ${participantConnections.length}`);
      }

      // Create thread metadata
      const thread: Thread = {
        id: uuidv4(),
        rootPostId,
        authorId,
        participants: participantUserIds,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Encrypt thread and wrap keys for participants
      const encryptedThread = await ThreadEncryptionService.createEncryptedThread(
        thread,
        participantConnections,
      );

      // Store the encrypted thread
      await PostStorageService.createThread(encryptedThread);

      console.log(`[ThreadService] Thread ${thread.id} created successfully`);
      return thread;
    } catch (error) {
      console.error('[ThreadService] Error creating thread:', error);
      throw new Error('Failed to create thread');
    }
  }

  /**
   * Post a reply to a thread
   *
   * @param threadId - The thread ID
   * @param content - The reply content (plaintext)
   * @returns The created reply
   */
  async postReply(threadId: string, content: string): Promise<ThreadReply> {
    try {
      console.log(`[ThreadService] Posting reply to thread ${threadId}`);

      // Get current user's identity
      const keyPair = await IdentityService.getKeyPair();
      if (!keyPair) {
        throw new Error('No identity found. Please create an identity first.');
      }

      const authorId = base58.encode(keyPair.publicKey);

      // Fetch the encrypted thread to get the thread key
      const encryptedThread = await PostStorageService.fetchThread(threadId);
      if (!encryptedThread) {
        throw new Error('Thread not found');
      }

      // Decrypt the thread key
      const connections = await ConnectionService.getConnections();
      const threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        connections,
      );

      // Create reply
      const reply: ThreadReply = {
        id: uuidv4(),
        threadId,
        authorId,
        content,
        createdAt: new Date(),
      };

      // Encrypt the reply with shared thread key
      const encryptedReply = await ThreadEncryptionService.encryptThreadReply(
        reply,
        threadKey,
      );

      // Store the encrypted reply
      await PostStorageService.postThreadReply(encryptedReply);

      console.log(`[ThreadService] Reply ${reply.id} posted successfully`);
      return reply;
    } catch (error) {
      console.error('[ThreadService] Error posting reply:', error);
      throw new Error('Failed to post reply');
    }
  }

  /**
   * Get a thread with all its replies (decrypted)
   *
   * @param threadId - The thread ID
   * @returns Object with thread metadata and decrypted replies
   */
  async getThreadWithReplies(
    threadId: string,
  ): Promise<{thread: Thread | null; replies: ThreadReply[]}> {
    try {
      console.log(`[ThreadService] Fetching thread ${threadId} with replies`);

      // Fetch encrypted thread
      const encryptedThread = await PostStorageService.fetchThread(threadId);
      if (!encryptedThread) {
        console.log(`[ThreadService] Thread ${threadId} not found`);
        return {thread: null, replies: []};
      }

      // Fetch encrypted replies
      const encryptedReplies = await PostStorageService.fetchThreadReplies(threadId);

      // Decrypt thread key
      const connections = await ConnectionService.getConnections();
      const threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedThread,
        connections,
      );

      // Reconstruct thread metadata
      const thread: Thread = {
        id: encryptedThread.id,
        rootPostId: encryptedThread.rootPostId,
        authorId: encryptedThread.authorId,
        participants: [], // We don't store this in encrypted form
        createdAt: new Date(encryptedThread.timestamp),
        updatedAt: new Date(encryptedThread.timestamp),
      };

      // Decrypt all replies
      const replies: ThreadReply[] = [];
      for (const encryptedReply of encryptedReplies) {
        try {
          const reply = await ThreadEncryptionService.decryptThreadReply(
            encryptedReply,
            threadKey,
          );
          replies.push(reply);
        } catch (error) {
          console.error(`[ThreadService] Failed to decrypt reply ${encryptedReply.id}:`, error);
          // Skip replies we can't decrypt
        }
      }

      console.log(`[ThreadService] Fetched thread with ${replies.length} replies`);
      return {thread, replies};
    } catch (error) {
      console.error('[ThreadService] Error getting thread with replies:', error);
      throw new Error('Failed to get thread with replies');
    }
  }

  /**
   * Get all threads (just metadata, no replies)
   *
   * @param since - Timestamp to fetch threads after (default: 0)
   * @param limit - Maximum number of threads to fetch
   * @returns Array of thread metadata
   */
  async getThreads(since: number = 0, limit?: number): Promise<Thread[]> {
    try {
      console.log(`[ThreadService] Fetching threads since ${new Date(since).toISOString()}`);

      const encryptedThreads = await PostStorageService.fetchThreads(since, limit);

      const threads: Thread[] = encryptedThreads.map(encryptedThread => ({
        id: encryptedThread.id,
        rootPostId: encryptedThread.rootPostId,
        authorId: encryptedThread.authorId,
        participants: [],
        createdAt: new Date(encryptedThread.timestamp),
        updatedAt: new Date(encryptedThread.timestamp),
      }));

      console.log(`[ThreadService] Fetched ${threads.length} threads`);
      return threads;
    } catch (error) {
      console.error('[ThreadService] Error getting threads:', error);
      throw new Error('Failed to get threads');
    }
  }

  /**
   * Check if a post has a thread
   *
   * @param postId - The post ID
   * @returns Thread if exists, null otherwise
   */
  async getThreadForPost(postId: string): Promise<Thread | null> {
    try {
      // For now, we assume thread ID = post ID (root post)
      // In a more complex implementation, you might need a separate mapping
      const encryptedThread = await PostStorageService.fetchThread(postId);

      if (!encryptedThread) {
        return null;
      }

      return {
        id: encryptedThread.id,
        rootPostId: encryptedThread.rootPostId,
        authorId: encryptedThread.authorId,
        participants: [],
        createdAt: new Date(encryptedThread.timestamp),
        updatedAt: new Date(encryptedThread.timestamp),
      };
    } catch (error) {
      console.error('[ThreadService] Error getting thread for post:', error);
      return null;
    }
  }

  /**
   * Get reply count for a thread
   *
   * @param threadId - The thread ID
   * @returns Number of replies
   */
  async getReplyCount(threadId: string): Promise<number> {
    try {
      const encryptedReplies = await PostStorageService.fetchThreadReplies(threadId);
      return encryptedReplies.length;
    } catch (error) {
      console.error('[ThreadService] Error getting reply count:', error);
      return 0;
    }
  }
}

export default new ThreadService();
