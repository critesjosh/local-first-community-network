/**
 * ConnectionService - Manages peer connections and handshake protocol
 *
 * Handles:
 * - Connection initiation and handshake
 * - ECDH key exchange
 * - Connection storage and management
 * - Connection state tracking
 */

import BLEManager from './bluetooth/BLEManager';
import Database from './storage/Database';
import IdentityService from './IdentityService';
import KeyManager from './crypto/KeyManager';
import {Connection} from '../types/models';
import {ConnectionProfile} from '../types/bluetooth';
import {generateUUID} from '../utils/crypto';

export interface PendingConnection {
  deviceId: string;
  profile: ConnectionProfile;
  ourECDHPublicKey: Uint8Array;
  ourECDHPrivateKey: Uint8Array;
  timestamp: Date;
}

class ConnectionServiceClass {
  private keyManager: KeyManager;
  private pendingConnections: Map<string, PendingConnection> = new Map();

  constructor() {
    this.keyManager = new KeyManager();
  }

  /**
   * Initiate connection to a discovered device
   * @param deviceId BLE device ID
   * @returns Connection profile if successful
   */
  async initiateConnection(deviceId: string): Promise<ConnectionProfile | null> {
    try {
      console.log(`Initiating connection to ${deviceId}...`);

      // Connect to device
      const device = await BLEManager.connectToDevice(deviceId);
      if (!device) {
        throw new Error('Failed to connect to device');
      }

      // Read their profile
      const theirProfile = await BLEManager.readProfile(device);
      if (!theirProfile) {
        await BLEManager.disconnectFromDevice(deviceId);
        throw new Error('Failed to read profile from device');
      }

      // Generate ECDH key pair for this connection
      const ecdhKeyPair = await this.keyManager.generateECDHKeyPair();

      // Store as pending connection
      this.pendingConnections.set(deviceId, {
        deviceId,
        profile: theirProfile,
        ourECDHPublicKey: ecdhKeyPair.publicKey,
        ourECDHPrivateKey: ecdhKeyPair.privateKey,
        timestamp: new Date(),
      });

      console.log('Connection initiated, awaiting user confirmation');
      return theirProfile;
    } catch (error) {
      console.error('Error initiating connection:', error);
      return null;
    }
  }

  /**
   * Complete connection handshake after user confirmation
   * @param deviceId BLE device ID
   * @returns Completed connection
   */
  async confirmConnection(deviceId: string): Promise<Connection | null> {
    try {
      const pending = this.pendingConnections.get(deviceId);
      if (!pending) {
        throw new Error('No pending connection found');
      }

      // Get current user identity
      const currentUser = await IdentityService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No current user identity');
      }

      // Send our ECDH public key via handshake characteristic
      const device = await BLEManager.connectToDevice(deviceId);
      if (!device) {
        throw new Error('Failed to reconnect to device');
      }

      // Prepare handshake data
      const handshakeData = {
        userId: currentUser.id,
        displayName: currentUser.displayName,
        ecdhPublicKey: Buffer.from(pending.ourECDHPublicKey).toString('base64'),
      };

      // Write handshake
      const success = await BLEManager.writeHandshake(device, handshakeData);
      if (!success) {
        throw new Error('Failed to write handshake data');
      }

      // Derive shared secret
      // In a real implementation, we'd receive their ECDH public key too
      // For MVP, we'll simulate this - in production, both sides exchange ECDH keys
      const theirPublicKeyBytes = Buffer.from(pending.profile.publicKey, 'base64');
      const sharedSecret = await this.keyManager.deriveSharedSecret(
        pending.ourECDHPrivateKey,
        theirPublicKeyBytes,
      );

      // Create connection record
      const connection: Connection = {
        id: generateUUID(),
        userId: pending.profile.userId,
        displayName: pending.profile.displayName,
        sharedSecret,
        connectedAt: new Date(),
        trustLevel: 'verified', // Bluetooth proximity = verified
      };

      // Save to database
      await Database.saveConnection(connection);

      // Cleanup
      await BLEManager.disconnectFromDevice(deviceId);
      this.pendingConnections.delete(deviceId);

      console.log('Connection confirmed and saved:', connection.id);
      return connection;
    } catch (error) {
      console.error('Error confirming connection:', error);
      return null;
    }
  }

  /**
   * Cancel pending connection
   */
  async cancelConnection(deviceId: string): Promise<void> {
    try {
      await BLEManager.disconnectFromDevice(deviceId);
      this.pendingConnections.delete(deviceId);
      console.log('Connection cancelled');
    } catch (error) {
      console.error('Error cancelling connection:', error);
    }
  }

  /**
   * Get all connections from database
   */
  async getConnections(): Promise<Connection[]> {
    try {
      return await Database.getConnections();
    } catch (error) {
      console.error('Error getting connections:', error);
      return [];
    }
  }

  /**
   * Get connection by user ID
   */
  async getConnectionByUserId(userId: string): Promise<Connection | null> {
    try {
      const connections = await Database.getConnections();
      return connections.find(c => c.userId === userId) || null;
    } catch (error) {
      console.error('Error getting connection:', error);
      return null;
    }
  }

  /**
   * Delete a connection
   */
  async deleteConnection(connectionId: string): Promise<boolean> {
    try {
      await Database.deleteConnection(connectionId);
      console.log('Connection deleted:', connectionId);
      return true;
    } catch (error) {
      console.error('Error deleting connection:', error);
      return false;
    }
  }

  /**
   * Get pending connections
   */
  getPendingConnections(): PendingConnection[] {
    return Array.from(this.pendingConnections.values());
  }
}

export default new ConnectionServiceClass();
