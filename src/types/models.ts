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
  trustLevel: 'verified' | 'pending';
}

export interface Event {
  id: string; // UUID
  authorId: string; // base58 public key
  title: string;
  description?: string;
  datetime: Date;
  location?: string;
  photo?: string; // base64 encoded
  createdAt: Date;
  updatedAt: Date;
  // Note: This is the plaintext/decrypted event model
  // For encrypted storage, see EncryptedEvent in EncryptionService
  // Events use hybrid encryption: single encrypted content + wrapped keys per recipient
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