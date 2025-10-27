/**
 * LocalPostStorage - SQLite database storage implementation (MVP)
 *
 * This is the MVP storage provider that stores encrypted events locally
 * using SQLite via the Database service. No server required.
 *
 * For Month 2+, this can be replaced with RESTPostStorage or OrbitDBPostStorage
 */

import {PostStorageProvider} from './PostStorageProvider';
import {EncryptedEvent} from '../crypto/EncryptionService';
import {EncryptedThread, EncryptedThreadReply} from '../../types/models';
import Database from './Database';

class LocalPostStorage implements PostStorageProvider {
  private subscriptions: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Publish an encrypted event to local SQLite database
   */
  async publishPost(encryptedEvent: EncryptedEvent): Promise<void> {
    await Database.saveEncryptedEvent(encryptedEvent);
    console.log(`[LocalPostStorage] Published event ${encryptedEvent.id} locally`);
  }

  /**
   * Fetch encrypted events from local database
   */
  async fetchPosts(since: number, limit?: number): Promise<EncryptedEvent[]> {
    const events = await Database.getEncryptedEvents(since, limit);
    console.log(`[LocalPostStorage] Fetched ${events.length} events since ${new Date(since).toISOString()}`);
    return events;
  }

  /**
   * Subscribe to new posts (polling implementation for MVP)
   *
   * For MVP, this polls the database every 10 seconds.
   * For Month 2+, REST backend can use WebSocket or Server-Sent Events
   *
   * @param userIds - User IDs to monitor (not used in local storage)
   * @param callback - Callback when new posts found
   * @returns Unsubscribe function
   */
  subscribeToPosts(
    userIds: string[],
    callback: (post: EncryptedEvent) => void,
  ): () => void {
    const subscriptionId = `subscription-${Date.now()}`;
    let lastCheck = Date.now();

    // Poll database every 10 seconds for new events
    const intervalId = setInterval(async () => {
      try {
        const newEvents = await this.fetchPosts(lastCheck);

        for (const event of newEvents) {
          callback(event);
        }

        lastCheck = Date.now();
      } catch (error) {
        console.error('[LocalPostStorage] Error polling for new events:', error);
      }
    }, 10000); // 10 second polling interval

    this.subscriptions.set(subscriptionId, intervalId);

    console.log(`[LocalPostStorage] Subscribed to posts (polling every 10s)`);

    // Return unsubscribe function
    return () => {
      const interval = this.subscriptions.get(subscriptionId);
      if (interval) {
        clearInterval(interval);
        this.subscriptions.delete(subscriptionId);
        console.log(`[LocalPostStorage] Unsubscribed from posts`);
      }
    };
  }

  /**
   * Get provider type
   */
  getProviderType(): 'local' {
    return 'local';
  }

  /**
   * Create a thread in local database
   */
  async createThread(encryptedThread: EncryptedThread): Promise<void> {
    await Database.saveEncryptedThread(encryptedThread);
    console.log(`[LocalPostStorage] Created thread ${encryptedThread.id} locally`);
  }

  /**
   * Fetch a thread by ID from local database
   */
  async fetchThread(threadId: string): Promise<EncryptedThread | null> {
    const thread = await Database.getEncryptedThread(threadId);
    console.log(`[LocalPostStorage] Fetched thread ${threadId}: ${thread ? 'found' : 'not found'}`);
    return thread;
  }

  /**
   * Fetch threads from local database
   */
  async fetchThreads(since: number, limit?: number): Promise<EncryptedThread[]> {
    const threads = await Database.getEncryptedThreads(limit, 0);
    // Filter by timestamp
    const filtered = threads.filter(t => t.timestamp >= since);
    console.log(`[LocalPostStorage] Fetched ${filtered.length} threads since ${new Date(since).toISOString()}`);
    return filtered;
  }

  /**
   * Post a reply to a thread in local database
   */
  async postThreadReply(encryptedReply: EncryptedThreadReply): Promise<void> {
    await Database.saveEncryptedThreadReply(encryptedReply);
    console.log(`[LocalPostStorage] Posted reply ${encryptedReply.id} to thread ${encryptedReply.threadId} locally`);
  }

  /**
   * Fetch replies for a thread from local database
   */
  async fetchThreadReplies(threadId: string): Promise<EncryptedThreadReply[]> {
    const replies = await Database.getEncryptedThreadReplies(threadId);
    console.log(`[LocalPostStorage] Fetched ${replies.length} replies for thread ${threadId}`);
    return replies;
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup(): void {
    for (const [id, interval] of this.subscriptions.entries()) {
      clearInterval(interval);
      this.subscriptions.delete(id);
    }
    console.log('[LocalPostStorage] Cleaned up all subscriptions');
  }
}

export default new LocalPostStorage();
