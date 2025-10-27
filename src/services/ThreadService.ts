/**
 * ThreadService - High-level service for managing thread replies
 *
 * Thread keys are embedded in posts (events). Every post automatically
 * has a thread key that anyone who can read the post can use to post replies.
 *
 * Provides convenient methods for posting and reading thread replies
 * with automatic encryption and storage handling.
 *
 * Usage:
 * ```typescript
 * import ThreadService from './services/ThreadService';
 *
 * // Post a reply (eventId is the thread ID)
 * await ThreadService.postReply(eventId, content);
 *
 * // Get all replies for a post
 * const replies = await ThreadService.getReplies(eventId);
 * ```
 */

import {v4 as uuidv4} from 'uuid';
import {ThreadReply} from '../types/models';
import ThreadEncryptionService from './crypto/ThreadEncryptionService';
import PostStorageService from './storage/PostStorageService';
import ConnectionService from './ConnectionService';
import IdentityService from './IdentityService';
import Database from './storage/Database';
import * as base58 from '../utils/base58';

class ThreadService {
  /**
   * Post a reply to an event's thread
   *
   * Thread keys are embedded in events, so we fetch the event to get the thread key.
   * The eventId serves as the threadId.
   *
   * @param eventId - The event ID (also the thread ID)
   * @param content - The reply content (plaintext)
   * @returns The created reply
   */
  async postReply(eventId: string, content: string): Promise<ThreadReply> {
    try {
      console.log(`[ThreadService] Posting reply to event ${eventId}`);

      // Get current user's identity
      const keyPair = await IdentityService.getKeyPair();
      if (!keyPair) {
        throw new Error('No identity found. Please create an identity first.');
      }

      const authorId = base58.encode(keyPair.publicKey);

      // Fetch the encrypted event to get the thread key
      const encryptedEvent = await Database.getEncryptedEvent(eventId);
      if (!encryptedEvent) {
        throw new Error('Event not found');
      }

      // Decrypt the thread key from the event
      const connections = await ConnectionService.getConnections();
      const threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        connections,
      );

      // Create reply
      const reply: ThreadReply = {
        id: uuidv4(),
        threadId: eventId, // Thread ID is the event ID
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
   * Get all replies for an event (decrypted)
   *
   * @param eventId - The event ID (thread ID)
   * @returns Array of decrypted replies
   */
  async getReplies(eventId: string): Promise<ThreadReply[]> {
    try {
      console.log(`[ThreadService] Fetching replies for event ${eventId}`);

      // Fetch encrypted event to get thread key
      const encryptedEvent = await Database.getEncryptedEvent(eventId);
      if (!encryptedEvent) {
        console.log(`[ThreadService] Event ${eventId} not found`);
        return [];
      }

      // Fetch encrypted replies
      const encryptedReplies = await PostStorageService.fetchThreadReplies(eventId);

      if (encryptedReplies.length === 0) {
        return [];
      }

      // Decrypt thread key from event
      const connections = await ConnectionService.getConnections();
      const threadKey = await ThreadEncryptionService.decryptThreadKey(
        encryptedEvent,
        connections,
      );

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

      console.log(`[ThreadService] Fetched ${replies.length} replies`);
      return replies;
    } catch (error) {
      console.error('[ThreadService] Error getting replies:', error);
      throw new Error('Failed to get replies');
    }
  }

  /**
   * Get reply count for an event
   *
   * @param eventId - The event ID (thread ID)
   * @returns Number of replies
   */
  async getReplyCount(eventId: string): Promise<number> {
    try {
      const count = await Database.getThreadReplyCount(eventId);
      return count;
    } catch (error) {
      console.error('[ThreadService] Error getting reply count:', error);
      return 0;
    }
  }
}

export default new ThreadService();
