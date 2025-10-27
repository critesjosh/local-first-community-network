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
import IdentityService from '../IdentityService';
import KeyManager from '../crypto/KeyManager';
import {sha256} from '@noble/hashes/sha2.js';

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
      console.log(`[RESTPostStorage] Fetched ${data.posts.length} posts`);
      return data.posts as EncryptedEvent[];
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
}

export default RESTPostStorage;
