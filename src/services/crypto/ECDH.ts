/**
 * ECDH (Elliptic Curve Diffie-Hellman) key exchange service
 *
 * Derives shared secrets between users for encrypted communication.
 * Uses Curve25519 for key exchange (converted from Ed25519 keys).
 */

// Import crypto config first to ensure proper random setup
import './cryptoConfig';

import * as ed25519Old from '@noble/ed25519'; // Keep for other uses
import {ed25519, x25519} from '@noble/curves/ed25519';
import {sha256} from '@noble/hashes/sha2.js';
import {hkdf} from '@noble/hashes/hkdf.js';
import {hmac} from '@noble/hashes/hmac.js';

/**
 * Convert Ed25519 public key to Curve25519 (X25519) format
 *
 * Ed25519 keys are used for signing, but we need Curve25519 for ECDH.
 * This conversion is cryptographically sound and widely used.
 *
 * Currently unused but kept for future use.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ed25519PublicKeyToCurve25519(ed25519PublicKey: Uint8Array): Uint8Array {
  // For now, we'll use a direct approach
  // In production, consider using @noble/curves for proper conversion
  // This is a simplified implementation for MVP

  // The Ed25519 public key is a point on the Edwards curve
  // We need to convert it to Montgomery form (Curve25519)
  // For MVP, we'll hash it to derive a Curve25519-compatible key

  return sha256(ed25519PublicKey).slice(0, 32);
}

/**
 * Convert Ed25519 private key to Curve25519 (X25519) format
 *
 * Currently unused but kept for future use.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ed25519PrivateKeyToCurve25519(ed25519PrivateKey: Uint8Array): Uint8Array {
  // Hash the Ed25519 private key to get a Curve25519-compatible private key
  // This is a simplified approach for MVP
  const hash = sha256(ed25519PrivateKey);

  // Clamp the bits as required by X25519
  // eslint-disable-next-line no-bitwise
  hash[0] &= 248;
  // eslint-disable-next-line no-bitwise
  hash[31] &= 127;
  // eslint-disable-next-line no-bitwise
  hash[31] |= 64;

  return hash.slice(0, 32);
}

/**
 * Perform X25519 scalar multiplication for ECDH
 *
 * Converts Ed25519 keys to Curve25519 format, then performs X25519 scalar multiplication.
 * X25519(alicePriv, bobPub) = X25519(bobPriv, alicePub) ensures both parties
 * derive the same shared secret.
 *
 * @param privateKey - Ed25519 private key
 * @param publicKey - Ed25519 public key
 * @returns Shared secret (32 bytes)
 */
function scalarMult(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  // Convert Ed25519 keys to Curve25519 (X25519) format using noble/curves utilities
  const curve25519PrivateKey = ed25519.utils.toMontgomerySecret(privateKey);
  const curve25519PublicKey = ed25519.utils.toMontgomery(publicKey);

  // Perform X25519 scalar multiplication
  return x25519.getSharedSecret(curve25519PrivateKey, curve25519PublicKey);
}

class ECDHService {
  /**
   * Derive a shared secret between two parties using ECDH
   *
   * @param myPrivateKey - My Ed25519 private key
   * @param theirPublicKey - Their Ed25519 public key
   * @returns Shared secret (32 bytes)
   */
  async deriveSharedSecret(
    myPrivateKey: Uint8Array,
    theirPublicKey: Uint8Array,
  ): Promise<Uint8Array> {
    try {
      // Use X25519 scalar multiplication: myPrivateKey * theirPublicKey
      // This ensures Alice(privA, pubB) == Bob(privB, pubA)
      const sharedSecret = scalarMult(myPrivateKey, theirPublicKey);

      return sharedSecret;
    } catch (error) {
      console.error('Error deriving shared secret:', error);
      throw new Error('Failed to derive shared secret');
    }
  }

  /**
   * Derive a connection-specific encryption key from shared secret
   *
   * Uses HKDF (HMAC-based Key Derivation Function) to derive a specific
   * encryption key from the shared secret.
   *
   * @param sharedSecret - The ECDH shared secret
   * @param salt - Optional salt (uses default if not provided)
   * @param info - Context info for key derivation
   * @returns Derived encryption key (32 bytes for AES-256)
   */
  deriveConnectionKey(
    sharedSecret: Uint8Array,
    salt?: Uint8Array,
    info: string = 'connection-key-v1',
  ): Uint8Array {
    try {
      // Use HKDF to derive a key
      const defaultSalt = new Uint8Array(32); // All zeros for MVP
      const actualSalt = salt || defaultSalt;

      const infoBytes = new TextEncoder().encode(info);

      // Derive 32 bytes for AES-256-GCM
      const derivedKey = hkdf(sha256, sharedSecret, actualSalt, infoBytes, 32);

      return derivedKey;
    } catch (error) {
      console.error('Error deriving connection key:', error);
      throw new Error('Failed to derive connection key');
    }
  }

  /**
   * Derive multiple keys from a shared secret for different purposes
   *
   * @param sharedSecret - The ECDH shared secret
   * @returns Object with separate keys for encryption and authentication
   */
  deriveMultipleKeys(sharedSecret: Uint8Array): {
    encryptionKey: Uint8Array;
    authKey: Uint8Array;
  } {
    try {
      const encryptionKey = this.deriveConnectionKey(
        sharedSecret,
        undefined,
        'encryption-key-v1',
      );

      const authKey = this.deriveConnectionKey(
        sharedSecret,
        undefined,
        'auth-key-v1',
      );

      return {
        encryptionKey,
        authKey,
      };
    } catch (error) {
      console.error('Error deriving multiple keys:', error);
      throw new Error('Failed to derive multiple keys');
    }
  }

  /**
   * Generate an ephemeral key pair for one-time key exchange
   *
   * Useful for forward secrecy in messaging.
   *
   * @returns Ephemeral key pair
   */
  async generateEphemeralKeyPair(): Promise<{
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }> {
    try {
      // Generate Ed25519 key pair
      const privateKey = ed25519.utils.randomSecretKey();
      const publicKey = ed25519.getPublicKey(privateKey);

      return {
        publicKey,
        privateKey,
      };
    } catch (error) {
      console.error('Error generating ephemeral key pair:', error);
      throw new Error('Failed to generate ephemeral key pair');
    }
  }

  /**
   * Generate recipient lookup ID for hybrid encryption
   *
   * Creates HMAC(sharedSecret, postID) to obfuscate recipient identity from server.
   * Both sender and recipient can compute this, but server cannot determine who
   * the recipients are without knowing the shared secrets.
   *
   * @param sharedSecret - ECDH shared secret for this connection
   * @param postId - Unique post/event ID
   * @returns Base64-encoded lookup ID (for use as object key)
   */
  generateRecipientLookupId(sharedSecret: Uint8Array, postId: string): string {
    try {
      const postIdBytes = new TextEncoder().encode(postId);
      const lookupIdBytes = hmac(sha256, sharedSecret, postIdBytes);

      // Return as base64 for use as JSON object key
      return Buffer.from(lookupIdBytes).toString('base64');
    } catch (error) {
      console.error('Error generating recipient lookup ID:', error);
      throw new Error('Failed to generate recipient lookup ID');
    }
  }
}

export default new ECDHService();
