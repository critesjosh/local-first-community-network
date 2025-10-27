/**
 * PostStorageService - Central service for managing post storage
 *
 * This service provides a single point of access to the post storage provider.
 * It handles provider selection and configuration.
 *
 * Usage:
 * ```typescript
 * import PostStorageService from './services/storage/PostStorageService';
 *
 * // Publish a post
 * await PostStorageService.publishPost(encryptedEvent);
 *
 * // Fetch posts
 * const posts = await PostStorageService.fetchPosts(Date.now() - 86400000);
 * ```
 */

import {PostStorageProvider, StorageProviderConfig} from './PostStorageProvider';
import LocalPostStorage from './LocalPostStorage';
import RESTPostStorage from './RESTPostStorage';
import {EncryptedEvent} from '../crypto/EncryptionService';
import {EncryptedThreadReply} from '../../types/models';

class PostStorageService {
  private provider: PostStorageProvider;
  private config: StorageProviderConfig;

  constructor() {
    // Default to local storage for MVP
    this.config = {type: 'local'};
    this.provider = LocalPostStorage;
  }

  /**
   * Initialize storage provider with configuration
   *
   * Call this during app initialization to set up the storage backend
   *
   * @param config - Storage provider configuration
   */
  initialize(config: StorageProviderConfig): void {
    this.config = config;

    switch (config.type) {
      case 'local':
        this.provider = LocalPostStorage;
        console.log('[PostStorageService] Using LocalPostStorage (SQLite)');
        break;

      case 'rest':
        if (!config.apiUrl) {
          throw new Error('REST storage requires apiUrl in config');
        }
        this.provider = new RESTPostStorage(config);
        console.log('[PostStorageService] Using RESTPostStorage:', config.apiUrl);
        break;

      case 'orbitdb':
        // TODO (Month 2): Implement OrbitDBPostStorage
        throw new Error('OrbitDB storage not yet implemented (Month 2)');

      default:
        throw new Error(`Unknown storage provider type: ${config.type}`);
    }
  }

  /**
   * Get current storage provider
   */
  getProvider(): PostStorageProvider {
    return this.provider;
  }

  /**
   * Publish an encrypted event
   */
  async publishPost(encryptedEvent: EncryptedEvent): Promise<void> {
    return this.provider.publishPost(encryptedEvent);
  }

  /**
   * Fetch encrypted events since a given timestamp
   */
  async fetchPosts(since: number, limit?: number): Promise<EncryptedEvent[]> {
    return this.provider.fetchPosts(since, limit);
  }

  /**
   * Subscribe to new posts
   */
  subscribeToPosts(
    userIds: string[],
    callback: (post: EncryptedEvent) => void,
  ): () => void {
    return this.provider.subscribeToPosts(userIds, callback);
  }

  /**
   * Post a reply to a thread
   */
  async postThreadReply(encryptedReply: EncryptedThreadReply): Promise<void> {
    return this.provider.postThreadReply(encryptedReply);
  }

  /**
   * Fetch replies for a thread
   */
  async fetchThreadReplies(threadId: string): Promise<EncryptedThreadReply[]> {
    return this.provider.fetchThreadReplies(threadId);
  }

  /**
   * Get current provider type
   */
  getProviderType(): 'local' | 'rest' | 'orbitdb' {
    return this.provider.getProviderType();
  }
}

// Export singleton instance
export default new PostStorageService();
