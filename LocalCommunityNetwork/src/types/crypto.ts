/**
 * Cryptographic type definitions
 */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface Identity {
  id: string; // base58 encoded public key
  publicKey: Uint8Array;
  createdAt: Date;
}

export interface SecureKeyStorage {
  publicKey: string; // hex encoded
  privateKey: string; // hex encoded (stored securely)
}

export interface EncryptedData {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export interface SharedSecret {
  secret: Uint8Array;
  connectionId: string;
}