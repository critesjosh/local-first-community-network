/**
 * RESTPostStorage - REST API storage implementation
 *
 * Syncs encrypted events with backend server using signature-based authentication.
 *
 * Backend API Endpoints:
 * - POST /api/posts - Upload encrypted event (requires Ed25519 signature)
 * - GET /api/posts?since={timestamp}&limit={limit} - Fetch events
 *
 * The server stores encrypted blobs and cannot decrypt content.
 */

import {PostStorageProvider, StorageProviderConfig} from './PostStorageProvider';
import {EncryptedEvent} from '../crypto/EncryptionService';
import {EncryptedThreadReply} from '../../types/models';
import IdentityService from '../IdentityService';
import KeyManager from '../crypto/KeyManager';
import {sha256} from '@noble/hashes/sha2.js';
import Database from './Database';

const keyManager = new KeyManager();

class RESTPostStorage implements PostStorageProvider {
  private config: StorageProviderConfig;
  private subscriptions: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: StorageProviderConfig) {
    this.config = config;

    if (!config.apiUrl) {
      throw new Error('RESTPostStorage requires apiUrl in config');
    }
  }

  /**
   * Publish an encrypted event to REST API
   *
   * Signs the request with Ed25519 private key for authentication:
   * - Signature: sign(`${authorId}:${timestamp}:${sha256(body)}`)
   * - Sent in X-Signature header
   */
  async publishPost(encryptedEvent: EncryptedEvent): Promise<void> {
    try {
      console.log('[RESTPostStorage] Publishing post to API:', this.config.apiUrl);

      // Get user's private key for signing
      const keyPair = await IdentityService.getKeyPair();
      if (!keyPair) {
        throw new Error('Cannot publish: No key pair available');
      }

      // Prepare request body
      const body = JSON.stringify(encryptedEvent);

      // Compute body hash
      const bodyBytes = new TextEncoder().encode(body);
      const bodyHash = Buffer.from(sha256(bodyBytes)).toString('hex');

      // Create timestamp
      const timestamp = Date.now();

      // Create message to sign: authorId:timestamp:bodyHash
      const message = `${encryptedEvent.authorId}:${timestamp}:${bodyHash}`;
      const messageBytes = new TextEncoder().encode(message);

      // Sign message with Ed25519 private key
      const signature = await keyManager.signData(messageBytes, keyPair.privateKey);
      const signatureHex = Buffer.from(signature).toString('hex');

      // Make request with signature
      const response = await fetch(`${this.config.apiUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signatureHex,
          'X-Timestamp': timestamp.toString(),
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to publish post: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const result = await response.json();
      console.log('[RESTPostStorage] Post published successfully:', result.postId);
    } catch (error) {
      console.error('[RESTPostStorage] Error publishing post:', error);
      throw error;
    }
  }

  /**
   * Fetch encrypted events from REST API
   *
   * No authentication required for GET (events are encrypted anyway)
   * Posts are automatically cached in local database for offline access
   */
  async fetchPosts(since: number, limit?: number): Promise<EncryptedEvent[]> {
    try {
      console.log('[RESTPostStorage] Fetching posts from API:', this.config.apiUrl);

      // Build URL with query parameters
      const url = new URL(`${this.config.apiUrl}/api/posts`);
      url.searchParams.set('since', since.toString());
      if (limit) {
        url.searchParams.set('limit', limit.toString());
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const posts = data.posts as EncryptedEvent[];
      console.log(`[RESTPostStorage] Fetched ${posts.length} posts`);

      // Cache posts in local database for offline access and thread operations
      for (const post of posts) {
        try {
          // Ensure wrappedKeys is properly formatted
          if (!post.wrappedKeys || typeof post.wrappedKeys !== 'object') {
            console.warn(`[RESTPostStorage] Post ${post.id} has invalid wrappedKeys, skipping cache`);
            continue;
          }
          await Database.saveEncryptedEvent(post);
        } catch (error) {
          console.error(`[RESTPostStorage] Failed to cache post ${post.id}:`, error);
          // Continue even if caching fails
        }
      }

      return posts;
    } catch (error) {
      console.error('[RESTPostStorage] Error fetching posts:', error);
      throw error;
    }
  }

  /**
   * Subscribe to new posts (polling implementation)
   *
   * Polls every 30 seconds for new events
   * TODO (Month 3): Replace with WebSocket or Server-Sent Events for real-time updates
   */
  subscribeToPosts(
    userIds: string[],
    callback: (post: EncryptedEvent) => void,
  ): () => void {
    console.log('[RESTPostStorage] Subscribing to posts (30s polling)');

    const subscriptionId = `subscription-${Date.now()}`;
    let lastCheck = Date.now();

    // Poll immediately, then every 30 seconds
    const poll = async () => {
      try {
        const newEvents = await this.fetchPosts(lastCheck);
        for (const event of newEvents) {
          // Filter to only events from specified users (if userIds provided)
          if (userIds.length === 0 || userIds.includes(event.authorId)) {
            callback(event);
          }
        }
        lastCheck = Date.now();
      } catch (error) {
        console.error('[RESTPostStorage] Error polling:', error);
        // Continue polling despite errors
      }
    };

    // Initial poll
    poll();

    // Set up interval for recurring polls
    const intervalId = setInterval(poll, 30000) as unknown as NodeJS.Timeout;
    this.subscriptions.set(subscriptionId, intervalId);

    // Return unsubscribe function
    return () => {
      const interval = this.subscriptions.get(subscriptionId);
      if (interval) {
        clearInterval(interval);
        this.subscriptions.delete(subscriptionId);
        console.log('[RESTPostStorage] Unsubscribed from posts');
      }
    };
  }

  /**
   * Get provider type
   */
  getProviderType(): 'rest' {
    return 'rest';
  }

  /**
   * Post a reply to a thread via REST API
   *
   * Signs the request with Ed25519 private key for authentication
   */
  async postThreadReply(encryptedReply: EncryptedThreadReply): Promise<void> {
    try {
      console.log('[RESTPostStorage] Posting thread reply via API:', this.config.apiUrl);

      const keyPair = await IdentityService.getKeyPair();
      if (!keyPair) {
        throw new Error('Cannot post reply: No key pair available');
      }

      const body = JSON.stringify(encryptedReply);
      const bodyBytes = new TextEncoder().encode(body);
      const bodyHash = Buffer.from(sha256(bodyBytes)).toString('hex');
      const timestamp = Date.now();
      const message = `${encryptedReply.authorId}:${timestamp}:${bodyHash}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = await keyManager.signData(messageBytes, keyPair.privateKey);
      const signatureHex = Buffer.from(signature).toString('hex');

      const response = await fetch(`${this.config.apiUrl}/api/threads/${encryptedReply.threadId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signatureHex,
          'X-Timestamp': timestamp.toString(),
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to post reply: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const result = await response.json();
      console.log('[RESTPostStorage] Reply posted successfully:', result.replyId);
    } catch (error) {
      console.error('[RESTPostStorage] Error posting reply:', error);
      throw error;
    }
  }

  /**
   * Fetch replies for a thread from REST API
   * Replies are automatically cached in local database for offline access
   */
  async fetchThreadReplies(threadId: string): Promise<EncryptedThreadReply[]> {
    try {
      console.log('[RESTPostStorage] Fetching thread replies from API:', threadId);

      const response = await fetch(`${this.config.apiUrl}/api/threads/${threadId}/replies`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch replies: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const replies = data.replies as EncryptedThreadReply[];
      console.log(`[RESTPostStorage] Fetched ${replies.length} replies`);

      // Cache replies in local database for offline access and reply counts
      for (const reply of replies) {
        try {
          await Database.saveEncryptedThreadReply(reply);
        } catch (error) {
          console.error(`[RESTPostStorage] Failed to cache reply ${reply.id}:`, error);
          // Continue even if caching fails
        }
      }

      return replies;
    } catch (error) {
      console.error('[RESTPostStorage] Error fetching replies:', error);
      throw error;
    }
  }
}

export default RESTPostStorage;
