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
  // Note: All events automatically have a thread key wrapped alongside the content key
  // Anyone who can decrypt the event can also decrypt the thread key and post replies
  replyCount?: number; // Number of replies to this post
}

/**
 * A reply to a post/event (plaintext/decrypted)
 * Replies use the thread key that was distributed with the original post
 */
export interface ThreadReply {
  id: string; // UUID
  threadId: string; // Reference to parent event (the original post)
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