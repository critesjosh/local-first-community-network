/**
 * KeyManager - Handles Ed25519 key generation and management
 */

import * as ed from '@noble/ed25519';
import {KeyPair, Identity} from '../../types/crypto';
import * as base58 from '../../utils/base58';
import {uint8ArrayToHex, hexToUint8Array} from '../../utils/crypto';

class KeyManager {
  /**
   * Generate a new Ed25519 key pair
   */
  async generateKeyPair(): Promise<KeyPair> {
    try {
      // Generate random private key (32 bytes)
      const privateKey = ed.utils.randomPrivateKey();

      // Derive public key from private key
      const publicKey = await ed.getPublicKey(privateKey);

      return {
        publicKey: new Uint8Array(publicKey),
        privateKey: new Uint8Array(privateKey),
      };
    } catch (error) {
      console.error('Error generating key pair:', error);
      throw new Error('Failed to generate key pair');
    }
  }

  /**
   * Create an identity from a key pair
   */
  createIdentity(keyPair: KeyPair): Identity {
    const id = base58.encode(keyPair.publicKey);

    return {
      id,
      publicKey: keyPair.publicKey,
      createdAt: new Date(),
    };
  }

  /**
   * Sign data with private key
   */
  async signData(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    try {
      const signature = await ed.sign(data, privateKey);
      return new Uint8Array(signature);
    } catch (error) {
      console.error('Error signing data:', error);
      throw new Error('Failed to sign data');
    }
  }

  /**
   * Verify signature with public key
   */
  async verifySignature(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    try {
      return await ed.verify(signature, data, publicKey);
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Convert public key to user ID (base58)
   */
  publicKeyToUserId(publicKey: Uint8Array): string {
    return base58.encode(publicKey);
  }

  /**
   * Convert user ID to public key
   */
  userIdToPublicKey(userId: string): Uint8Array {
    return base58.decode(userId);
  }

  /**
   * Serialize key pair for storage (hex encoding)
   */
  serializeKeyPair(keyPair: KeyPair): {publicKey: string; privateKey: string} {
    return {
      publicKey: uint8ArrayToHex(keyPair.publicKey),
      privateKey: uint8ArrayToHex(keyPair.privateKey),
    };
  }

  /**
   * Deserialize key pair from storage
   */
  deserializeKeyPair(serialized: {
    publicKey: string;
    privateKey: string;
  }): KeyPair {
    return {
      publicKey: hexToUint8Array(serialized.publicKey),
      privateKey: hexToUint8Array(serialized.privateKey),
    };
  }
}

export default KeyManager;