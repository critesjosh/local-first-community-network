/**
 * ThreadReply model - matches mobile app's EncryptedThreadReply type
 *
 * Thread replies use the event key from the parent post for encryption.
 * The server stores encrypted replies and cannot decrypt them.
 */

export interface EncryptedThreadReply {
  id: string; // UUID
  threadId: string; // UUID - same as the post/event ID
  authorId: string; // base58 public key
  timestamp: number; // milliseconds since epoch
  encryptedContent: string; // base64 - encrypted reply content
  iv: string; // base64 - initialization vector
}

export interface ThreadReplyRow {
  id: string;
  thread_id: string;
  author_id: string;
  timestamp: bigint;
  encrypted_content: string;
  iv: string;
  created_at: Date;
}
