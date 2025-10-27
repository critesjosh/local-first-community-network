/**
 * ThreadEncryptionService - Handles encryption/decryption of threads and replies
 *
 * Implements shared thread key approach:
 * - Thread creation: Generate shared thread key, wrap it for each participant
 * - Reply encryption: Encrypt with shared thread key (no per-recipient wrapping)
 * - Decryption: Unwrap thread key once, use for all replies
 *
 * Benefits:
 * - Very efficient for threads with many replies (only root needs key wrapping)
 * - Group chat-like model (thread participants don't need connections with each other)
 * - Simpler encryption for replies (just symmetric AES)
 */

import * as Crypto from 'expo-crypto';
import { Thread, ThreadReply, EncryptedThread, EncryptedThreadReply, Connection } from '../../types/models';
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
   * Create an encrypted thread with shared thread key
   *
   * Flow:
   * 1. Generate random thread key (will be shared by all participants)
   * 2. Wrap thread key for each participant using ECDH-derived connection keys
   * 3. Return encrypted thread structure
   *
   * The thread key is wrapped using the same hybrid encryption as events,
   * but the key will be reused for all replies in the thread.
   *
   * @param thread - The thread metadata
   * @param participants - List of connections who can participate in the thread
   * @returns Encrypted thread with wrapped keys
   */
  async createEncryptedThread(
    thread: Thread,
    participants: Connection[],
  ): Promise<EncryptedThread> {
    try {
      console.log(`[ThreadEncryptionService] Creating thread ${thread.id} with ${participants.length} participants`);

      // 1. Generate random thread key (shared by all participants)
      const threadKey = await generateRandomKey();

      // Cache the thread key for this thread
      this.threadKeyCache.set(thread.id, threadKey);

      // 2. Wrap thread key for each participant
      const wrappedThreadKeys: EncryptedThread['wrappedThreadKeys'] = {};

      // 3. Wrap thread key for author (so they can decrypt thread replies)
      const keyPair = await IdentityService.getKeyPair();
      if (keyPair) {
        try {
          const authorSharedSecret = await ECDHService.deriveSharedSecret(
            keyPair.privateKey,
            keyPair.publicKey,
          );

          const authorLookupId = ECDHService.generateRecipientLookupId(
            authorSharedSecret,
            thread.id,
          );

          const authorKey = ECDHService.deriveConnectionKey(authorSharedSecret);
          const authorKeyWrapIV = await generateIV();

          const authorWrappedKeyBytes = await encryptAESGCM(
            threadKey,
            authorKey,
            authorKeyWrapIV,
          );

          wrappedThreadKeys[authorLookupId] = {
            wrappedKey: Buffer.from(authorWrappedKeyBytes).toString('base64'),
            keyWrapIV: Buffer.from(authorKeyWrapIV).toString('base64'),
          };

          console.log(`[ThreadEncryptionService] Wrapped thread key for author (self)`);
        } catch (error) {
          console.error('Error wrapping thread key for author:', error);
        }
      }

      // 4. Wrap thread key for each participant
      for (const participant of participants) {
        console.log(`[ThreadEncryptionService] Wrapping thread key for: ${participant.displayName}`);

        // Derive shared secret on the fly if not cached
        let sharedSecret = participant.sharedSecret;

        if (!sharedSecret) {
          try {
            const keyPair = await IdentityService.getKeyPair();
            if (!keyPair) {
              console.warn(`Skipping participant ${participant.id} - no key pair available`);
              continue;
            }

            const theirPublicKey = base58.decode(participant.userId);
            sharedSecret = await ECDHService.deriveSharedSecret(
              keyPair.privateKey,
              theirPublicKey,
            );

            console.log(`[ThreadEncryptionService] Derived shared secret for ${participant.displayName}`);
          } catch (error) {
            console.error(`Error deriving shared secret for ${participant.id}:`, error);
            continue;
          }
        }

        // Generate recipient lookup ID
        const recipientLookupId = ECDHService.generateRecipientLookupId(
          sharedSecret,
          thread.id,
        );

        // Derive encryption key from shared secret
        const connectionKey = ECDHService.deriveConnectionKey(sharedSecret);

        // Generate IV for key wrapping
        const keyWrapIV = await generateIV();

        // Wrap the thread key with participant's key
        const wrappedKeyBytes = await encryptAESGCM(
          threadKey,
          connectionKey,
          keyWrapIV,
        );

        wrappedThreadKeys[recipientLookupId] = {
          wrappedKey: Buffer.from(wrappedKeyBytes).toString('base64'),
          keyWrapIV: Buffer.from(keyWrapIV).toString('base64'),
        };
      }

      return {
        id: thread.id,
        rootPostId: thread.rootPostId,
        authorId: thread.authorId,
        timestamp: thread.createdAt.getTime(),
        wrappedThreadKeys,
      };
    } catch (error) {
      console.error('Error creating encrypted thread:', error);
      throw new Error('Failed to create encrypted thread');
    }
  }

  /**
   * Decrypt thread key for the current user
   *
   * Flow:
   * 1. Check cache first
   * 2. Try to unwrap as author (self)
   * 3. Try each connection to find matching wrapped key
   * 4. Cache the decrypted thread key
   *
   * @param encryptedThread - The encrypted thread
   * @param connections - All my connections
   * @returns Decrypted thread key
   */
  async decryptThreadKey(
    encryptedThread: EncryptedThread,
    connections: Connection[],
  ): Promise<Uint8Array> {
    try {
      // Check cache first
      const cachedKey = this.threadKeyCache.get(encryptedThread.id);
      if (cachedKey) {
        console.log(`[ThreadEncryptionService] Using cached thread key for ${encryptedThread.id}`);
        return cachedKey;
      }

      let threadKey: Uint8Array | null = null;

      // 1. Try to decrypt as the author (if this is our own thread)
      const keyPair = await IdentityService.getKeyPair();
      if (keyPair) {
        try {
          const authorSharedSecret = await ECDHService.deriveSharedSecret(
            keyPair.privateKey,
            keyPair.publicKey,
          );

          const authorLookupId = ECDHService.generateRecipientLookupId(
            authorSharedSecret,
            encryptedThread.id,
          );

          const authorWrappedKeyData = encryptedThread.wrappedThreadKeys[authorLookupId];
          if (authorWrappedKeyData) {
            const authorKey = ECDHService.deriveConnectionKey(authorSharedSecret);
            const wrappedKeyBytes = Buffer.from(authorWrappedKeyData.wrappedKey, 'base64');
            const keyWrapIVBytes = Buffer.from(authorWrappedKeyData.keyWrapIV, 'base64');

            threadKey = await decryptAESGCM(wrappedKeyBytes, authorKey, keyWrapIVBytes);
            console.log(`[ThreadEncryptionService] Decrypted thread key as author (self)`);
          }
        } catch (error) {
          console.log(`[ThreadEncryptionService] Not the author, checking connections...`);
        }
      }

      // 2. Try each connection to find who can decrypt
      if (!threadKey) {
        console.log(`[ThreadEncryptionService] Attempting to decrypt thread ${encryptedThread.id} with ${connections.length} connections`);

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
            encryptedThread.id,
          );

          // Check if this connection can decrypt
          const wrappedKeyData = encryptedThread.wrappedThreadKeys[recipientLookupId];
          if (!wrappedKeyData) {
            continue;
          }

          // Found a match! Unwrap the thread key
          const connectionKey = ECDHService.deriveConnectionKey(sharedSecret);
          const wrappedKeyBytes = Buffer.from(wrappedKeyData.wrappedKey, 'base64');
          const keyWrapIVBytes = Buffer.from(wrappedKeyData.keyWrapIV, 'base64');

          threadKey = await decryptAESGCM(wrappedKeyBytes, connectionKey, keyWrapIVBytes);
          console.log(`[ThreadEncryptionService] Decrypted thread key using connection ${connection.displayName}`);
          break;
        }
      }

      if (!threadKey) {
        throw new Error('Thread key not available for current user');
      }

      // Cache the decrypted thread key
      this.threadKeyCache.set(encryptedThread.id, threadKey);

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
