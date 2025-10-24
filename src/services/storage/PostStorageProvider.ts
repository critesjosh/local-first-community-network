/**
 * PostStorageProvider - Abstract interface for event/post storage
 *
 * This abstraction allows swapping storage backends without changing application code:
 * - MVP (Month 1): LocalPostStorage (SQLite Database)
 * - Post-MVP (Month 2+): RESTPostStorage (REST API) or OrbitDBPostStorage
 *
 * Design Pattern: Strategy Pattern for storage backend
 */

import {EncryptedEvent} from '../crypto/EncryptionService';
import {Event} from '../../types/models';

/**
 * Post storage provider interface
 *
 * All storage implementations must implement these methods
 */
export interface PostStorageProvider {
  /**
   * Publish an encrypted event
   *
   * @param encryptedEvent - The encrypted event to publish
   * @returns Promise that resolves when event is stored
   */
  publishPost(encryptedEvent: EncryptedEvent): Promise<void>;

  /**
   * Fetch encrypted events since a given timestamp
   *
   * @param since - Timestamp (milliseconds since epoch) to fetch events after
   * @param limit - Maximum number of events to fetch (optional)
   * @returns Promise with array of encrypted events
   */
  fetchPosts(since: number, limit?: number): Promise<EncryptedEvent[]>;

  /**
   * Subscribe to new posts from specific users
   *
   * This method enables real-time updates (polling for MVP, pub/sub later)
   *
   * @param userIds - Array of user IDs to subscribe to
   * @param callback - Callback function called when new posts arrive
   * @returns Unsubscribe function
   */
  subscribeToPosts(
    userIds: string[],
    callback: (post: EncryptedEvent) => void,
  ): () => void;

  /**
   * Get storage provider type
   *
   * Useful for debugging and feature flags
   */
  getProviderType(): 'local' | 'rest' | 'orbitdb';
}

/**
 * Storage provider configuration
 */
export interface StorageProviderConfig {
  type: 'local' | 'rest' | 'orbitdb';
  // REST-specific config
  apiUrl?: string;
  authToken?: string;
  // OrbitDB-specific config (Month 2+)
  ipfsGateway?: string;
  pinningService?: string;
}
