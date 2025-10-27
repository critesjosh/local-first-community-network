/**
 * EncryptionService - Handles encryption/decryption of events and messages
 *
 * Implements the encryption flows from PRD:
 * - Post encryption: Generate random key, encrypt content, wrap key for each connection
 * - Message encryption: Simple AES-256-GCM with shared secret
 */

import * as Crypto from 'expo-crypto';
import { Event, Connection } from '../../types/models';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes as nobleRandomBytes } from '@noble/ciphers/webcrypto.js';
import ECDHService from './ECDH';
import IdentityService from '../IdentityService';
import KeyManager from './KeyManager';
import * as base58 from '../../utils/base58';

// AES-256-GCM encryption using @noble/ciphers (works in React Native)

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
    // Use @noble/ciphers for AES-GCM encryption
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
    // Use @noble/ciphers for AES-GCM decryption
    const aes = gcm(key, iv);
    const plaintext = aes.decrypt(ciphertext);
    return plaintext;
  } catch (error) {
    console.error('AES-GCM decryption error:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * Encrypted event structure (Hybrid encryption)
 *
 * Uses hybrid encryption for efficiency and privacy:
 * - encryptedContent: Event data encrypted ONCE with random key (not duplicated)
 * - wrappedKeys: Event key wrapped for each recipient using HMAC(sharedSecret, postID) as lookup
 * - iv: Initialization vector for content encryption
 *
 * Benefits:
 * - 77x more efficient (10KB vs 1000KB for 100 connections)
 * - Server cannot determine recipient list (HMAC obfuscates connection IDs)
 */
export interface EncryptedEvent {
  id: string;
  authorId: string;
  timestamp: number;
  encryptedContent: string; // base64 - encrypted ONCE
  iv: string; // base64 - IV for content encryption
  wrappedKeys: {
    [recipientLookupId: string]: {
      // recipientLookupId = base64(HMAC(sharedSecret, postID))
      wrappedKey: string; // base64 - event key wrapped with connection key
      keyWrapIV: string; // base64 - IV for key wrapping
    };
  };
}

/**
 * Encrypted message structure
 */
export interface EncryptedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  ciphertext: string; // base64
  iv: string; // base64
  timestamp: number;
}

class EncryptionService {
  /**
   * Encrypt an event for multiple connections using hybrid encryption
   *
   * Flow:
   * 1. Generate random event key
   * 2. Encrypt event content ONCE with event key
   * 3. For each connection:
   *    a. Generate HMAC-based recipient lookup ID
   *    b. Wrap event key with connection's encryption key
   *
   * Efficiency: 77x smaller than duplicating content per recipient
   * Privacy: Server cannot determine recipient list (HMAC obfuscation)
   *
   * @param event - The event to encrypt
   * @param connections - List of connections to encrypt for
   * @returns Encrypted event structure
   */
  async encryptEvent(
    event: Omit<Event, 'encryptedFor'>,
    connections: Connection[],
  ): Promise<EncryptedEvent> {
    try {
      // 1. Generate random event key
      const eventKey = await generateRandomKey();
      const contentIV = await generateIV();

      // 2. Serialize and encrypt event content ONCE
      const eventContent = {
        content: event.content,
      };

      const plaintext = new TextEncoder().encode(JSON.stringify(eventContent));
      const encryptedContentBytes = await encryptAESGCM(plaintext, eventKey, contentIV);

      // 3. Wrap event key for author (so they can decrypt their own posts)
      const wrappedKeys: EncryptedEvent['wrappedKeys'] = {};

      const keyPair = await IdentityService.getKeyPair();
      if (keyPair) {
        try {
          // For the author, use a self-derived key based on their own keypair
          // This allows them to decrypt their own posts
          const authorSharedSecret = await ECDHService.deriveSharedSecret(
            keyPair.privateKey,
            keyPair.publicKey,
          );

          const authorLookupId = ECDHService.generateRecipientLookupId(
            authorSharedSecret,
            event.id,
          );

          const authorKey = ECDHService.deriveConnectionKey(authorSharedSecret);
          const authorKeyWrapIV = await generateIV();

          const authorWrappedKeyBytes = await encryptAESGCM(
            eventKey,
            authorKey,
            authorKeyWrapIV,
          );

          wrappedKeys[authorLookupId] = {
            wrappedKey: Buffer.from(authorWrappedKeyBytes).toString('base64'),
            keyWrapIV: Buffer.from(authorKeyWrapIV).toString('base64'),
          };

          console.log(`[EncryptionService] Wrapped event key for author (self)`);
        } catch (error) {
          console.error('Error wrapping key for author:', error);
        }
      }

      // 4. Wrap event key for each connection using HMAC-based lookup IDs
      console.log(`[EncryptionService] Encrypting for ${connections.length} connections`);
      for (const connection of connections) {
        console.log(`[EncryptionService] Processing connection: ${connection.displayName} (userId: ${connection.userId.substring(0, 12)}..., status: ${connection.status})`);

        // Derive shared secret on the fly if not cached
        let sharedSecret = connection.sharedSecret;

        if (!sharedSecret) {
          try {
            // Get my private key
            const keyPair = await IdentityService.getKeyPair();
            if (!keyPair) {
              console.warn(`Skipping connection ${connection.id} - no key pair available`);
              continue;
            }

            // Decode their public key from base58 userId
            const theirPublicKey = base58.decode(connection.userId);

            // Derive shared secret using ECDH
            sharedSecret = await ECDHService.deriveSharedSecret(
              keyPair.privateKey,
              theirPublicKey,
            );

            console.log(`[EncryptionService] Derived shared secret on-the-fly for connection ${connection.displayName}`);
          } catch (error) {
            console.error(`Error deriving shared secret for connection ${connection.id}:`, error);
            continue;
          }
        }

        // Generate recipient lookup ID: HMAC(sharedSecret, postID)
        // This prevents server from learning who the recipients are
        const recipientLookupId = ECDHService.generateRecipientLookupId(
          sharedSecret,
          event.id,
        );

        console.log(`[EncryptionService] Generated recipientLookupId for ${connection.displayName}: ${recipientLookupId.substring(0, 16)}...`);

        // Derive encryption key from shared secret
        const connectionKey = ECDHService.deriveConnectionKey(sharedSecret);

        // Generate IV for key wrapping
        const keyWrapIV = await generateIV();

        // Wrap the event key with connection's key (only 32 bytes)
        const wrappedKeyBytes = await encryptAESGCM(
          eventKey,
          connectionKey,
          keyWrapIV,
        );

        wrappedKeys[recipientLookupId] = {
          wrappedKey: Buffer.from(wrappedKeyBytes).toString('base64'),
          keyWrapIV: Buffer.from(keyWrapIV).toString('base64'),
        };
      }

      return {
        id: event.id,
        authorId: event.authorId,
        timestamp: event.createdAt.getTime(),
        encryptedContent: Buffer.from(encryptedContentBytes).toString('base64'),
        iv: Buffer.from(contentIV).toString('base64'),
        wrappedKeys,
      };
    } catch (error) {
      console.error('Error encrypting event:', error);
      throw new Error('Failed to encrypt event');
    }
  }

  /**
   * Decrypt an event for the current user using HMAC-based connection matching
   *
   * Flow:
   * 1. Iterate through all my connections (early termination on match)
   * 2. For each connection, compute HMAC(sharedSecret, postID)
   * 3. Check if wrappedKeys contains this lookup ID
   * 4. If found, unwrap the event key and decrypt content
   *
   * Performance: With 100 connections and 50 posts, ~2,500 HMAC ops = 25ms
   *
   * @param encryptedEvent - The encrypted event
   * @param connections - All my connections (will check which one can decrypt)
   * @returns Decrypted event
   */
  async decryptEvent(
    encryptedEvent: EncryptedEvent,
    connections: Connection[],
  ): Promise<Omit<Event, 'encryptedFor'>> {
    try {
      let eventKey: Uint8Array | null = null;

      // 1. First, try to decrypt as the author (if this is our own post)
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

            eventKey = await decryptAESGCM(wrappedKeyBytes, authorKey, keyWrapIVBytes);
            console.log(`[EncryptionService] Decrypted event as author (self)`);
          }
        } catch (error) {
          // Not the author, continue to check connections
          console.log(`[EncryptionService] Not the author, checking connections...`);
        }
      }

      // 2. If not decrypted yet, try to find which connection can decrypt this event
      if (!eventKey) {
        console.log(`[EncryptionService] Attempting to decrypt post ${encryptedEvent.id.substring(0, 8)} with ${connections.length} connections`);
        console.log(`[EncryptionService] Available wrappedKeys:`, Object.keys(encryptedEvent.wrappedKeys).map(k => k.substring(0, 16) + '...'));

        for (const connection of connections) {
          console.log(`[EncryptionService] Trying connection: ${connection.displayName} (userId: ${connection.userId.substring(0, 12)}..., status: ${connection.status})`);

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
              console.error(`[EncryptionService] Error deriving shared secret for ${connection.displayName}:`, error);
              continue;
            }
          }

          // 3. Compute HMAC-based recipient lookup ID
          const recipientLookupId = ECDHService.generateRecipientLookupId(
            sharedSecret,
            encryptedEvent.id,
          );

          console.log(`[EncryptionService] Generated recipientLookupId: ${recipientLookupId.substring(0, 16)}...`);

          // 4. Check if this connection can decrypt the event
          const wrappedKeyData = encryptedEvent.wrappedKeys[recipientLookupId];
          if (!wrappedKeyData) {
            console.log(`[EncryptionService] No match for ${connection.displayName}`);
            continue; // Not for this connection, try next
          }

          // 5. Found a match! Unwrap the event key
          const connectionKey = ECDHService.deriveConnectionKey(sharedSecret);

          const wrappedKeyBytes = Buffer.from(wrappedKeyData.wrappedKey, 'base64');
          const keyWrapIVBytes = Buffer.from(wrappedKeyData.keyWrapIV, 'base64');

          eventKey = await decryptAESGCM(wrappedKeyBytes, connectionKey, keyWrapIVBytes);
          console.log(`[EncryptionService] Decrypted event using connection ${connection.id}`);
          break; // Early termination - found the key
        }
      }

      if (!eventKey) {
        throw new Error('Event not encrypted for any of my connections');
      }

      // 5. Decrypt event content with the unwrapped event key
      const encryptedContentBytes = Buffer.from(encryptedEvent.encryptedContent, 'base64');
      const contentIVBytes = Buffer.from(encryptedEvent.iv, 'base64');

      const plaintextBytes = await decryptAESGCM(
        encryptedContentBytes,
        eventKey,
        contentIVBytes,
      );

      const plaintext = new TextDecoder().decode(plaintextBytes);
      const eventContent = JSON.parse(plaintext);

      return {
        id: encryptedEvent.id,
        authorId: encryptedEvent.authorId,
        content: eventContent.content,
        createdAt: new Date(encryptedEvent.timestamp),
        updatedAt: new Date(encryptedEvent.timestamp),
      };
    } catch (error) {
      // Re-throw expected errors (like "not encrypted for any connections")
      if (error instanceof Error && error.message.includes('Event not encrypted')) {
        throw error;
      }
      console.error('Error decrypting event:', error);
      throw new Error('Failed to decrypt event');
    }
  }

  /**
   * Encrypt a message using connection's shared secret
   *
   * Simpler than event encryption - direct encryption with connection key
   *
   * @param content - Message content (plaintext)
   * @param connection - Connection details (contains shared secret)
   * @param messageId - Unique message ID
   * @param conversationId - Conversation ID
   * @param senderId - Sender's user ID
   * @param recipientId - Recipient's user ID
   * @returns Encrypted message structure
   */
  async encryptMessage(
    content: string,
    connection: Connection,
    messageId: string,
    conversationId: string,
    senderId: string,
    recipientId: string,
  ): Promise<EncryptedMessage> {
    try {
      if (!connection.sharedSecret) {
        throw new Error('Connection has no shared secret');
      }

      // Derive encryption key from shared secret
      const encryptionKey = ECDHService.deriveConnectionKey(connection.sharedSecret);

      // Generate IV
      const iv = await generateIV();

      // Encrypt message content
      const plaintext = new TextEncoder().encode(content);
      const ciphertext = await encryptAESGCM(plaintext, encryptionKey, iv);

      return {
        id: messageId,
        conversationId,
        senderId,
        recipientId,
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        iv: Buffer.from(iv).toString('base64'),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error encrypting message:', error);
      throw new Error('Failed to encrypt message');
    }
  }

  /**
   * Decrypt a message using connection's shared secret
   *
   * @param encryptedMessage - Encrypted message structure
   * @param connection - Connection details (contains shared secret)
   * @returns Decrypted message content
   */
  async decryptMessage(
    encryptedMessage: EncryptedMessage,
    connection: Connection,
  ): Promise<string> {
    try {
      if (!connection.sharedSecret) {
        throw new Error('Connection has no shared secret');
      }

      // Derive decryption key from shared secret
      const decryptionKey = ECDHService.deriveConnectionKey(connection.sharedSecret);

      // Decode base64
      const ciphertext = Buffer.from(encryptedMessage.ciphertext, 'base64');
      const iv = Buffer.from(encryptedMessage.iv, 'base64');

      // Decrypt
      const plaintext = await decryptAESGCM(ciphertext, decryptionKey, iv);

      return new TextDecoder().decode(plaintext);
    } catch (error) {
      console.error('Error decrypting message:', error);
      throw new Error('Failed to decrypt message');
    }
  }

  /**
   * Generate a unique conversation ID for two users
   *
   * Ensures both users generate the same conversation ID regardless of order
   *
   * @param userId1 - First user ID
   * @param userId2 - Second user ID
   * @returns Conversation ID (deterministic)
   */
  generateConversationId(userId1: string, userId2: string): string {
    // Sort IDs to ensure deterministic result
    const sortedIds = [userId1, userId2].sort();
    const combined = `${sortedIds[0]}:${sortedIds[1]}`;

    // Hash to create conversation ID
    const hash = sha256(new TextEncoder().encode(combined));

    return Buffer.from(hash).toString('hex').slice(0, 32);
  }
}

export default new EncryptionService();
