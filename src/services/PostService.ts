/**
 * PostService - High-level service for post operations
 */

import IdentityService from './IdentityService';
import KeyManager from './crypto/KeyManager';
import PostStorageService from './storage/PostStorageService';
import Database from './storage/Database';
import {sha256} from '@noble/hashes/sha2.js';

const keyManager = new KeyManager();

class PostService {
  /**
   * Delete a post (soft delete - preserves threads)
   *
   * This marks the post as deleted locally and on the server.
   * Thread replies are preserved.
   */
  async deletePost(postId: string): Promise<void> {
    try {
      // Get user's identity for signing
      const keyPair = await IdentityService.getKeyPair();
      if (!keyPair) {
        throw new Error('No identity found. Cannot delete post.');
      }

      // Only delete posts via REST API if using REST storage
      const providerType = PostStorageService.getProviderType();

      if (providerType === 'rest') {
        // Call backend DELETE endpoint with signature
        const config = (PostStorageService as any).config;
        const apiUrl = config.apiUrl;

        if (!apiUrl) {
          throw new Error('No API URL configured for REST storage');
        }

        // Create timestamp for signature
        const timestamp = Date.now();

        // Create message to sign: postId:timestamp
        const message = `${postId}:${timestamp}`;
        const messageBytes = new TextEncoder().encode(message);

        // Sign with Ed25519
        const signature = await keyManager.signData(messageBytes, keyPair.privateKey);
        const signatureHex = Buffer.from(signature).toString('hex');

        // Call DELETE endpoint
        const response = await fetch(`${apiUrl}/api/posts/${postId}`, {
          method: 'DELETE',
          headers: {
            'X-Signature': signatureHex,
            'X-Timestamp': timestamp.toString(),
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            `Failed to delete post: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
          );
        }

        console.log('[PostService] Post deleted on server:', postId);
      }

      // Soft delete locally (works for both REST and local storage)
      await Database.softDeleteEvent(postId);

      console.log('[PostService] Post deleted locally:', postId);
    } catch (error) {
      console.error('[PostService] Error deleting post:', error);
      throw error;
    }
  }
}

export default new PostService();
