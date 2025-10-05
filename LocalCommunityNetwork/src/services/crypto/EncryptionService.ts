/**
 * EncryptionService - Handles encryption/decryption of events and messages
 *
 * Implements the encryption flows from PRD:
 * - Post encryption: Generate random key, encrypt content, wrap key for each connection
 * - Message encryption: Simple AES-256-GCM with shared secret
 */

import { randomBytes as randomBytesPolyfill } from '@noble/hashes/utils.js';
import { Event, Connection } from '../../types/models';
import { sha256 } from '@noble/hashes/sha2.js';
import ECDHService from './ECDH';

// AES-256-GCM encryption using Web Crypto API (available in React Native)
// Note: In production, consider react-native-quick-crypto for better performance

// Use noble/hashes randomBytes for MVP (cross-platform)
const randomBytes = (size: number): Uint8Array => {
  return randomBytesPolyfill(size);
};

/**
 * Generate a random encryption key
 */
function generateRandomKey(): Uint8Array {
  return randomBytes(32); // 256 bits for AES-256
}

/**
 * Generate a random IV for AES-GCM
 */
function generateIV(): Uint8Array {
  return randomBytes(12); // 96 bits recommended for GCM
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
    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      plaintext,
    );

    return new Uint8Array(ciphertext);
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
    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      ciphertext,
    );

    return new Uint8Array(plaintext);
  } catch (error) {
    console.error('AES-GCM decryption error:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * Encrypted event structure
 */
export interface EncryptedEvent {
  id: string;
  authorId: string;
  timestamp: number;
  encryptedContent: {
    [connectionId: string]: {
      encryptedEventKey: string; // base64
      encryptedData: string; // base64
      iv: string; // base64
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
   * Encrypt an event for multiple connections
   *
   * Flow:
   * 1. Generate random event key
   * 2. Encrypt event content with event key
   * 3. For each connection, wrap event key with connection's encryption key
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
      const eventKey = generateRandomKey();
      const iv = generateIV();

      // 2. Serialize and encrypt event content
      const eventContent = {
        title: event.title,
        description: event.description,
        datetime: event.datetime.toISOString(),
        location: event.location,
        photo: event.photo,
      };

      const plaintext = new TextEncoder().encode(JSON.stringify(eventContent));
      const encryptedData = await encryptAESGCM(plaintext, eventKey, iv);

      // 3. Wrap event key for each connection
      const encryptedContent: EncryptedEvent['encryptedContent'] = {};

      for (const connection of connections) {
        if (!connection.sharedSecret) {
          console.warn(`Skipping connection ${connection.id} - no shared secret`);
          continue;
        }

        // Derive encryption key from shared secret
        const connectionKey = ECDHService.deriveConnectionKey(connection.sharedSecret);

        // Generate IV for key wrapping
        const keyWrapIV = generateIV();

        // Encrypt the event key with connection's key
        const encryptedEventKey = await encryptAESGCM(
          eventKey,
          connectionKey,
          keyWrapIV,
        );

        encryptedContent[connection.id] = {
          encryptedEventKey: Buffer.from(encryptedEventKey).toString('base64'),
          encryptedData: Buffer.from(encryptedData).toString('base64'),
          iv: Buffer.from(iv).toString('base64'),
        };
      }

      return {
        id: event.id,
        authorId: event.authorId,
        timestamp: event.createdAt.getTime(),
        encryptedContent,
      };
    } catch (error) {
      console.error('Error encrypting event:', error);
      throw new Error('Failed to encrypt event');
    }
  }

  /**
   * Decrypt an event for the current user
   *
   * Flow:
   * 1. Find the encrypted data for my connection
   * 2. Decrypt the event key using my connection key
   * 3. Decrypt the event content with the event key
   *
   * @param encryptedEvent - The encrypted event
   * @param connection - My connection details (contains shared secret)
   * @returns Decrypted event
   */
  async decryptEvent(
    encryptedEvent: EncryptedEvent,
    connection: Connection,
  ): Promise<Omit<Event, 'encryptedFor'>> {
    try {
      // 1. Find encrypted data for this connection
      const encryptedData = encryptedEvent.encryptedContent[connection.id];
      if (!encryptedData) {
        throw new Error('Event not encrypted for this connection');
      }

      if (!connection.sharedSecret) {
        throw new Error('Connection has no shared secret');
      }

      // 2. Derive connection key and decrypt event key
      const connectionKey = ECDHService.deriveConnectionKey(connection.sharedSecret);

      const encryptedEventKeyBytes = Buffer.from(
        encryptedData.encryptedEventKey,
        'base64',
      );
      const ivBytes = Buffer.from(encryptedData.iv, 'base64');

      // Note: For MVP, we're using the same IV for both key wrap and data encryption
      // In production, use separate IVs
      const eventKey = await decryptAESGCM(
        encryptedEventKeyBytes,
        connectionKey,
        ivBytes,
      );

      // 3. Decrypt event content
      const encryptedContentBytes = Buffer.from(
        encryptedData.encryptedData,
        'base64',
      );
      const plaintextBytes = await decryptAESGCM(
        encryptedContentBytes,
        eventKey,
        ivBytes,
      );

      const plaintext = new TextDecoder().decode(plaintextBytes);
      const eventContent = JSON.parse(plaintext);

      return {
        id: encryptedEvent.id,
        authorId: encryptedEvent.authorId,
        title: eventContent.title,
        description: eventContent.description,
        datetime: new Date(eventContent.datetime),
        location: eventContent.location,
        photo: eventContent.photo,
        createdAt: new Date(encryptedEvent.timestamp),
        updatedAt: new Date(encryptedEvent.timestamp),
      };
    } catch (error) {
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
      const iv = generateIV();

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
