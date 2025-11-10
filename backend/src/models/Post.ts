/**
 * Post model - matches mobile app's EncryptedEvent type
 *
 * The server stores encrypted posts and cannot decrypt them.
 * All content is end-to-end encrypted between users.
 */

export interface EncryptedPost {
  id: string; // UUID
  authorId: string; // base58 public key
  timestamp: number; // milliseconds since epoch
  encryptedContent: string; // base64 - encrypted event data
  iv: string; // base64 - initialization vector
  wrappedKeys: {
    // recipientLookupId (HMAC-based) → wrapped key data
    [recipientLookupId: string]: {
      wrappedKey: string; // base64 - event key wrapped with connection key
      keyWrapIV: string; // base64 - IV for key wrapping
    };
  };
  deletedAt?: number; // milliseconds since epoch - null if not deleted
}

export interface PostRow {
  id: string;
  author_id: string;
  timestamp: bigint;
  encrypted_content: string;
  iv: string;
  wrapped_keys: {
    [recipientLookupId: string]: {
      wrappedKey: string;
      keyWrapIV: string;
    };
  }; // JSONB is already parsed by pg library
  deleted_at: Date | null;
  created_at: Date;
}
