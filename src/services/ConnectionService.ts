/**
 * ConnectionService - Manages social relationships established over BLE
 *
 * Handles:
 * - Initiating unilateral follows over Bluetooth
 * - Storing follow relationships in the local database
 * - Providing access to saved relationships
 */

import BLEManager from './bluetooth/BLEManager';
import Database from './storage/Database';
import IdentityService from './IdentityService';
import {Connection} from '../types/models';
import {ConnectionProfile} from '../types/bluetooth';
import {generateUUID} from '../utils/crypto';

class ConnectionServiceClass {
  /**
   * Follow a discovered device (unilateral follow)
   * @param deviceId BLE device ID
   * @returns Saved connection record if successful
   */
  async followDevice(deviceId: string): Promise<{
    profile: ConnectionProfile;
    connection: Connection;
  } | null> {
    try {
      console.log(`Following device ${deviceId}...`);

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

      // Get current user identity and profile
      const identity = IdentityService.getCurrentIdentity();
      const currentUser = await IdentityService.getCurrentUser();
      if (!identity || !currentUser) {
        throw new Error('No current user identity');
      }

      // Prepare follow payload
      const followPayload = {
        type: 'follow-request',
        follower: {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          publicKey: Buffer.from(identity.publicKey).toString('base64'),
          profilePhoto: currentUser.profilePhoto,
        },
        timestamp: new Date().toISOString(),
      };

      // Send follow payload (fire-and-forget)
      const payloadWritten = await BLEManager.writeHandshake(device, followPayload);
      if (!payloadWritten) {
        throw new Error('Failed to send follow payload');
      }

      // Save relationship locally as one-way follow
      const connection: Connection = {
        id: generateUUID(),
        userId: theirProfile.userId,
        displayName: theirProfile.displayName,
        profilePhoto: theirProfile.profilePhoto,
        connectedAt: new Date(),
        trustLevel: 'pending',
      };

      await Database.saveConnection(connection);
      await BLEManager.disconnectFromDevice(deviceId);

      console.log('Follow saved and payload sent:', connection.id);

      return {profile: theirProfile, connection};
    } catch (error) {
      console.error('Error following device:', error);
      return null;
    }
  }

  /**
   * Get all connections (followers/following) from database
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
}

export default new ConnectionServiceClass();
