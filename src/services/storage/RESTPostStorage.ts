/**
 * RESTPostStorage - REST API storage implementation (Month 2+)
 *
 * This will be implemented in Month 2 to sync encrypted events with a backend server.
 * For now, this is a stub that throws "not implemented" errors.
 *
 * Backend API Endpoints (to be implemented):
 * - POST /api/posts - Upload encrypted event
 * - GET /api/posts?since={timestamp}&limit={limit} - Fetch events
 *
 * The server stores encrypted blobs and cannot decrypt content.
 */

import {PostStorageProvider, StorageProviderConfig} from './PostStorageProvider';
import {EncryptedEvent} from '../crypto/EncryptionService';

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
   * TODO (Week 3): Implement POST /api/posts
   * - Sign request with user's private key
   * - Upload encrypted event blob
   * - Handle network errors and retries
   */
  async publishPost(encryptedEvent: EncryptedEvent): Promise<void> {
    console.log('[RESTPostStorage] Publishing post to API:', this.config.apiUrl);

    // TODO: Implement actual REST API call
    throw new Error('RESTPostStorage.publishPost not yet implemented (Week 3)');

    /*
    // Future implementation:
    const response = await fetch(`${this.config.apiUrl}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.authToken}`,
      },
      body: JSON.stringify(encryptedEvent),
    });

    if (!response.ok) {
      throw new Error(`Failed to publish post: ${response.statusText}`);
    }

    console.log('[RESTPostStorage] Post published successfully');
    */
  }

  /**
   * Fetch encrypted events from REST API
   *
   * TODO (Week 3): Implement GET /api/posts
   * - Authenticate request
   * - Fetch encrypted events since timestamp
   * - Cache locally for offline access
   */
  async fetchPosts(since: number, limit?: number): Promise<EncryptedEvent[]> {
    console.log('[RESTPostStorage] Fetching posts from API:', this.config.apiUrl);

    // TODO: Implement actual REST API call
    throw new Error('RESTPostStorage.fetchPosts not yet implemented (Week 3)');

    /*
    // Future implementation:
    const url = new URL(`${this.config.apiUrl}/api/posts`);
    url.searchParams.set('since', since.toString());
    if (limit) {
      url.searchParams.set('limit', limit.toString());
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch posts: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[RESTPostStorage] Fetched ${data.posts.length} posts');
    return data.posts;
    */
  }

  /**
   * Subscribe to new posts (polling implementation)
   *
   * TODO (Week 3): Implement polling with exponential backoff
   * TODO (Month 3): Replace with WebSocket or Server-Sent Events
   */
  subscribeToPosts(
    userIds: string[],
    callback: (post: EncryptedEvent) => void,
  ): () => void {
    console.log('[RESTPostStorage] Subscribing to posts (not yet implemented)');

    // TODO: Implement polling logic
    throw new Error('RESTPostStorage.subscribeToPosts not yet implemented (Week 3)');

    /*
    // Future implementation with polling:
    const subscriptionId = `subscription-${Date.now()}`;
    let lastCheck = Date.now();

    const intervalId = setInterval(async () => {
      try {
        const newEvents = await this.fetchPosts(lastCheck);
        for (const event of newEvents) {
          callback(event);
        }
        lastCheck = Date.now();
      } catch (error) {
        console.error('[RESTPostStorage] Error polling:', error);
      }
    }, 30000); // 30 second polling interval

    this.subscriptions.set(subscriptionId, intervalId);

    return () => {
      const interval = this.subscriptions.get(subscriptionId);
      if (interval) {
        clearInterval(interval);
        this.subscriptions.delete(subscriptionId);
      }
    };
    */
  }

  /**
   * Get provider type
   */
  getProviderType(): 'rest' {
    return 'rest';
  }
}

export default RESTPostStorage;
