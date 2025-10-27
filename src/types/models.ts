/**
 * Application data models
 */

import {Identity} from './crypto';

export interface User {
  id: string; // base58 encoded public key
  displayName: string;
  profilePhoto?: string; // base64 encoded image
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Connection {
  id: string; // UUID
  userId: string; // their public key (base58)
  displayName: string;
  profilePhoto?: string;
  sharedSecret?: Uint8Array; // ECDH derived secret
  connectedAt: Date;
  notes?: string; // private notes about this connection
  status: 'mutual' | 'pending-sent' | 'pending-received'; // mutual = both connected
  trustLevel: 'verified' | 'pending'; // kept for backward compatibility
}

export interface Event {
  id: string; // UUID
  authorId: string; // base58 public key
  content: string; // The main text content of the post
  createdAt: Date;
  updatedAt: Date;
  // Note: This is the plaintext/decrypted event model
  // For encrypted storage, see EncryptedEvent in EncryptionService
  // Posts use hybrid encryption: single encrypted content + wrapped keys per recipient

  // Threading fields
  isThread?: boolean; // True if this post starts a thread (has thread key)
  threadId?: string; // Reference to parent thread (if this is a reply)
  replyCount?: number; // Number of replies to this post/thread
}

/**
 * Thread metadata with shared encryption key
 * The thread key is encrypted for each participant using hybrid encryption
 */
export interface Thread {
  id: string; // UUID - same as the root Event.id
  rootPostId: string; // The original post that started the thread
  authorId: string; // Creator of the thread
  participants: string[]; // Array of user IDs who can access thread
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Encrypted thread with wrapped thread key for each participant
 * This is stored in the database/sent over the network
 */
export interface EncryptedThread {
  id: string;
  rootPostId: string;
  authorId: string;
  timestamp: number;
  wrappedThreadKeys: {
    [recipientLookupId: string]: {
      wrappedKey: string; // base64 - thread key encrypted for recipient
      keyWrapIV: string; // base64 - IV for key wrapping
    };
  };
}

/**
 * A reply in a thread (plaintext/decrypted)
 */
export interface ThreadReply {
  id: string; // UUID
  threadId: string; // Reference to parent thread
  authorId: string; // base58 public key
  content: string; // The reply text content
  createdAt: Date;
}

/**
 * Encrypted thread reply - encrypted with shared thread key
 * Much simpler than regular posts - no per-recipient key wrapping needed
 */
export interface EncryptedThreadReply {
  id: string;
  threadId: string;
  authorId: string;
  timestamp: number;
  encryptedContent: string; // base64 - encrypted with shared thread key
  iv: string; // base64 - AES-GCM IV
}

export interface Message {
  id: string; // UUID
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string; // encrypted
  timestamp: Date;
  delivered: boolean;
  read: boolean;
}

export interface AppState {
  isFirstLaunch: boolean;
  identity?: Identity;
  currentUser?: User;
  connections: Connection[];
  events: Event[];
}