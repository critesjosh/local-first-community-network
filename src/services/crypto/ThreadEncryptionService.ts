/**
 * ThreadEncryptionService - Handles encryption/decryption of thread replies
 *
 * Thread keys are now embedded in posts (EncryptedEvent.wrappedThreadKeys).
 * Anyone who can decrypt a post can also decrypt its thread key and post replies.
 *
 * This service handles:
 * - Extracting thread keys from events
 * - Reply encryption: Encrypt with shared thread key (no per-recipient wrapping)
 * - Reply decryption: Decrypt with cached thread key
 *
 * Benefits:
 * - 1 thread per post automatically (no separate thread creation)
 * - Anyone who can see post can participate in thread
 * - Very efficient for threads with many replies
 */

import * as Crypto from 'expo-crypto';
import { ThreadReply, EncryptedThreadReply, Connection } from '../../types/models';
import { EncryptedEvent } from './EncryptionService';
import { gcm } from '@noble/ciphers/aes.js';
import ECDHService from './ECDH';
import IdentityService from '../IdentityService';
import * as base58 from '../../utils/base58';

// Use expo-crypto for secure random bytes
const randomBytes = async (size: number): Promise<Uint8Array> => {
  const bytes = await Crypto.getRandomBytesAsync(size);
  return new Uint8Array(bytes);
};

/**
 * Generate a random encryption key
 */
async function generateRandomKey(): Promise<Uint8Array> {
  return await randomBytes(32); // 256 bits for AES-256
}

/**
 * Generate a random IV for AES-GCM
 */
async function generateIV(): Promise<Uint8Array> {
  return await randomBytes(12); // 96 bits recommended for GCM
}

/**
 * Encrypt data using AES-256-GCM
 */
async function encryptAESGCM(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  try {
    const aes = gcm(key, iv);
    const ciphertext = aes.encrypt(plaintext);
    return ciphertext;
  } catch (error) {
    console.error('AES-GCM encryption error:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
async function decryptAESGCM(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  try {
    const aes = gcm(key, iv);
    const plaintext = aes.decrypt(ciphertext);
    return plaintext;
  } catch (error) {
    console.error('AES-GCM decryption error:', error);
    throw new Error('Decryption failed');
  }
}

class ThreadEncryptionService {
  // Cache decrypted thread keys to avoid re-decryption
  private threadKeyCache: Map<string, Uint8Array> = new Map();

  /**
   * Decrypt thread key (event key) from an event
   *
   * Thread key = Event key (same key used for both post content and replies).
   * Anyone who can decrypt the event can also use the key for replies.
   *
   * Flow:
   * 1. Check cache first
   * 2. Try to unwrap as author (self)
   * 3. Try each connection to find matching wrapped key
   * 4. Cache the decrypted key
   *
   * @param encryptedEvent - The encrypted event containing wrapped keys
   * @param connections - All my connections
   * @returns Decrypted event key (reused as thread key)
   */
  async decryptThreadKey(
    encryptedEvent: EncryptedEvent,
    connections: Connection[],
  ): Promise<Uint8Array> {
    try {
      // Check cache first
      const cachedKey = this.threadKeyCache.get(encryptedEvent.id);
      if (cachedKey) {
        console.log(`[ThreadEncryptionService] Using cached thread key for ${encryptedEvent.id}`);
        return cachedKey;
      }

      let threadKey: Uint8Array | null = null;

      // 1. Try to decrypt as the author (if this is our own post)
      const keyPair = await IdentityService.getKeyPair();
      if (keyPair) {
        try {
          const authorSharedSecret = await ECDHService.deriveSharedSecret(
            keyPair.privateKey,
            keyPair.publicKey,
          );

          const authorLookupId = ECDHService.generateRecipientLookupId(
            authorSharedSecret,
            encryptedEvent.id,
          );

          const authorWrappedKeyData = encryptedEvent.wrappedKeys[authorLookupId];
          if (authorWrappedKeyData) {
            const authorKey = ECDHService.deriveConnectionKey(authorSharedSecret);
            const wrappedKeyBytes = Buffer.from(authorWrappedKeyData.wrappedKey, 'base64');
            const keyWrapIVBytes = Buffer.from(authorWrappedKeyData.keyWrapIV, 'base64');

            threadKey = await decryptAESGCM(wrappedKeyBytes, authorKey, keyWrapIVBytes);
            console.log(`[ThreadEncryptionService] Decrypted event key as author (self) - reusing for replies`);
          }
        } catch (error) {
          console.log(`[ThreadEncryptionService] Not the author, checking connections...`);
        }
      }

      // 2. Try each connection to find who can decrypt
      if (!threadKey) {
        console.log(`[ThreadEncryptionService] Attempting to decrypt thread key from event ${encryptedEvent.id} with ${connections.length} connections`);

        for (const connection of connections) {
          // Derive shared secret on the fly if not cached
          let sharedSecret = connection.sharedSecret;

          if (!sharedSecret) {
            try {
              const keyPair = await IdentityService.getKeyPair();
              if (!keyPair) {
                continue;
              }

              const theirPublicKey = base58.decode(connection.userId);
              sharedSecret = await ECDHService.deriveSharedSecret(
                keyPair.privateKey,
                theirPublicKey,
              );
            } catch (error) {
              console.error(`[ThreadEncryptionService] Error deriving shared secret:`, error);
              continue;
            }
          }

          // Generate recipient lookup ID
          const recipientLookupId = ECDHService.generateRecipientLookupId(
            sharedSecret,
            encryptedEvent.id,
          );

          // Check if this connection can decrypt
          const wrappedKeyData = encryptedEvent.wrappedKeys[recipientLookupId];
          if (!wrappedKeyData) {
            continue;
          }

          // Found a match! Unwrap the event key (reused as thread key)
          const connectionKey = ECDHService.deriveConnectionKey(sharedSecret);
          const wrappedKeyBytes = Buffer.from(wrappedKeyData.wrappedKey, 'base64');
          const keyWrapIVBytes = Buffer.from(wrappedKeyData.keyWrapIV, 'base64');

          threadKey = await decryptAESGCM(wrappedKeyBytes, connectionKey, keyWrapIVBytes);
          console.log(`[ThreadEncryptionService] Decrypted event key using connection ${connection.displayName} - reusing for replies`);
          break;
        }
      }

      if (!threadKey) {
        throw new Error('Thread key not available for current user');
      }

      // Cache the decrypted thread key
      this.threadKeyCache.set(encryptedEvent.id, threadKey);

      return threadKey;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Thread key not available')) {
        throw error;
      }
      console.error('Error decrypting thread key:', error);
      throw new Error('Failed to decrypt thread key');
    }
  }

  /**
   * Encrypt a reply using the shared thread key
   *
   * Much simpler than event encryption - just uses the shared thread key directly.
   * No per-recipient key wrapping needed!
   *
   * @param reply - The reply to encrypt
   * @param threadKey - The shared thread key (from decryptThreadKey)
   * @returns Encrypted reply
   */
  async encryptThreadReply(
    reply: ThreadReply,
    threadKey: Uint8Array,
  ): Promise<EncryptedThreadReply> {
    try {
      console.log(`[ThreadEncryptionService] Encrypting reply ${reply.id} for thread ${reply.threadId}`);

      // Generate IV for this reply
      const iv = await generateIV();

      // Encrypt reply content with shared thread key
      const plaintext = new TextEncoder().encode(reply.content);
      const encryptedContentBytes = await encryptAESGCM(plaintext, threadKey, iv);

      return {
        id: reply.id,
        threadId: reply.threadId,
        authorId: reply.authorId,
        timestamp: reply.createdAt.getTime(),
        encryptedContent: Buffer.from(encryptedContentBytes).toString('base64'),
        iv: Buffer.from(iv).toString('base64'),
      };
    } catch (error) {
      console.error('Error encrypting thread reply:', error);
      throw new Error('Failed to encrypt thread reply');
    }
  }

  /**
   * Decrypt a reply using the shared thread key
   *
   * @param encryptedReply - The encrypted reply
   * @param threadKey - The shared thread key (from decryptThreadKey)
   * @returns Decrypted reply
   */
  async decryptThreadReply(
    encryptedReply: EncryptedThreadReply,
    threadKey: Uint8Array,
  ): Promise<ThreadReply> {
    try {
      // Decrypt reply content
      const encryptedContentBytes = Buffer.from(encryptedReply.encryptedContent, 'base64');
      const ivBytes = Buffer.from(encryptedReply.iv, 'base64');

      const plaintextBytes = await decryptAESGCM(
        encryptedContentBytes,
        threadKey,
        ivBytes,
      );

      const content = new TextDecoder().decode(plaintextBytes);

      return {
        id: encryptedReply.id,
        threadId: encryptedReply.threadId,
        authorId: encryptedReply.authorId,
        content,
        createdAt: new Date(encryptedReply.timestamp),
      };
    } catch (error) {
      console.error('Error decrypting thread reply:', error);
      throw new Error('Failed to decrypt thread reply');
    }
  }

  /**
   * Clear cached thread keys (useful when user logs out)
   */
  clearCache(): void {
    this.threadKeyCache.clear();
  }

  /**
   * Get cached thread key if available
   */
  getCachedThreadKey(threadId: string): Uint8Array | undefined {
    return this.threadKeyCache.get(threadId);
  }
}

export default new ThreadEncryptionService();
