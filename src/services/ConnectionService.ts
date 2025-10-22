/**
 * ConnectionService - Manages social relationships established over BLE
 *
 * Handles:
 * - Mutual connections with auto-accept (default) or manual approval
 * - Bidirectional BLE handshake for connection establishment
 * - Storing connection relationships in the local database
 * - Computing shared secrets using ECDH
 */

import {Buffer} from 'buffer';
import BLEManager from './bluetooth/BLEManager';
import Database from './storage/Database';
import IdentityService from './IdentityService';
import ECDHService from './crypto/ECDH';
import {Connection} from '../types/models';
import {ConnectionProfile, ConnectionRequest, ConnectionResponse} from '../types/bluetooth';
import {generateUUID} from '../utils/crypto';
import {log, logError, logWarn} from '../utils/logger';

class ConnectionServiceClass {
  /**
   * Initiate a connection request to a discovered device
   * @param deviceId BLE device ID
   * @returns Connection record if successful, null otherwise
   */
  async requestConnection(deviceId: string): Promise<{
    profile: ConnectionProfile;
    connection: Connection;
  } | null> {
    try {
      await log(`Requesting connection to device ${deviceId}...`);

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

      // Check if connection already exists
      const existingConnection = await Database.getConnectionByUserId(theirProfile.userId);
      if (existingConnection) {
        await BLEManager.disconnectFromDevice(deviceId);
        await log('Connection already exists:', existingConnection.id);
        return {profile: theirProfile, connection: existingConnection};
      }

      // Get current user identity and profile
      const identity = IdentityService.getCurrentIdentity();
      const currentUser = await IdentityService.getCurrentUser();
      if (!identity || !currentUser) {
        throw new Error('No current user identity');
      }

      // Prepare connection request
      const connectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          publicKey: Buffer.from(identity.publicKey).toString('base64'),
          profilePhoto: currentUser.profilePhoto,
        },
        timestamp: new Date().toISOString(),
      };

      // Send connection request
      const requestSent = await BLEManager.writeHandshake(device, connectionRequest);
      if (!requestSent) {
        throw new Error('Failed to send connection request');
      }

      // TODO: Derive shared secret later when needed for encryption
      // For now, just store the connection without the shared secret

      // Since auto-accept is enabled by default, create mutual connection immediately
      // This avoids showing a "pending" screen when the other party will auto-accept anyway
      const connection: Connection = {
        id: generateUUID(),
        userId: theirProfile.userId,
        displayName: theirProfile.displayName,
        profilePhoto: theirProfile.profilePhoto,
        sharedSecret: undefined, // Will be derived later when needed
        connectedAt: new Date(),
        status: 'mutual', // Mutual connection since auto-accept is default
        trustLevel: 'pending',
      };

      await Database.saveConnection(connection);
      await log('Connection saved as mutual:', connection.id);

      await BLEManager.disconnectFromDevice(deviceId);

      return {profile: theirProfile, connection};
    } catch (error) {
      await logError('Error requesting connection:', error);
      return null;
    }
  }

  /**
   * Handle incoming connection request (called by BLE event handler)
   * @param request Connection request from another device
   * @returns Connection response to send back
   */
  async handleConnectionRequest(
    request: ConnectionRequest,
  ): Promise<ConnectionResponse | null> {
    try {
      await log('Handling connection request from:', request.requester.displayName);

      // Check if connection already exists
      const existingConnection = await Database.getConnectionByUserId(
        request.requester.userId,
      );
      if (existingConnection) {
        // If connection exists and is pending-sent, upgrade to mutual
        if (existingConnection.status === 'pending-sent') {
          await Database.updateConnectionStatus(existingConnection.id, 'mutual');
          await log('Upgraded pending-sent to mutual:', existingConnection.id);
        }

        // Return acceptance response with our profile
        return await this.createConnectionResponse('accepted');
      }

      // Get auto-accept setting
      const autoAccept = await Database.getAutoAcceptConnections();

      // TODO: Derive shared secret later when needed for encryption
      // For now, just store the connection without the shared secret

      // Create connection record
      const connection: Connection = {
        id: generateUUID(),
        userId: request.requester.userId,
        displayName: request.requester.displayName,
        profilePhoto: request.requester.profilePhoto,
        sharedSecret: undefined, // Will be derived later when needed
        connectedAt: new Date(),
        status: autoAccept ? 'mutual' : 'pending-received',
        trustLevel: 'pending',
      };

      await Database.saveConnection(connection);
      await log(`Connection ${autoAccept ? 'accepted' : 'queued'}:`, connection.id);

      // Return response
      return await this.createConnectionResponse(autoAccept ? 'accepted' : 'pending');
    } catch (error) {
      await logError('Error handling connection request:', error);
      return null;
    }
  }

  /**
   * Create a connection response with current user's profile
   */
  private async createConnectionResponse(
    status: 'accepted' | 'rejected' | 'pending',
  ): Promise<ConnectionResponse | null> {
    try {
      const identity = IdentityService.getCurrentIdentity();
      const currentUser = await IdentityService.getCurrentUser();
      if (!identity || !currentUser) {
        return null;
      }

      return {
        type: 'connection-response',
        status,
        responder: {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          publicKey: Buffer.from(identity.publicKey).toString('base64'),
          profilePhoto: currentUser.profilePhoto,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      await logError('Error creating connection response:', error);
      return null;
    }
  }

  /**
   * Handle incoming connection response (called by BLE event handler)
   * @param response Connection response from another device
   */
  async handleConnectionResponse(response: ConnectionResponse): Promise<void> {
    try {
      await log('Handling connection response from:', response.responder.displayName);

      // Find the pending connection
      const connection = await Database.getConnectionByUserId(response.responder.userId);
      if (!connection) {
        await logWarn('No pending connection found for response');
        return;
      }

      // Update status based on response
      if (response.status === 'accepted') {
        await Database.updateConnectionStatus(connection.id, 'mutual');
        await log('Connection accepted and upgraded to mutual:', connection.id);
      } else if (response.status === 'rejected') {
        await Database.deleteConnection(connection.id);
        await log('Connection rejected and deleted:', connection.id);
      }
      // If pending, leave as-is
    } catch (error) {
      await logError('Error handling connection response:', error);
    }
  }

  /**
   * Manually accept a pending connection request
   * @param connectionId Connection ID to accept
   */
  async acceptConnectionRequest(connectionId: string): Promise<boolean> {
    try {
      await Database.updateConnectionStatus(connectionId, 'mutual');
      await log('Manually accepted connection:', connectionId);
      // TODO: Send acceptance message via BLE if device is nearby
      return true;
    } catch (error) {
      await logError('Error accepting connection:', error);
      return false;
    }
  }

  /**
   * Reject a pending connection request
   * @param connectionId Connection ID to reject
   */
  async rejectConnectionRequest(connectionId: string): Promise<boolean> {
    try {
      await Database.deleteConnection(connectionId);
      await log('Rejected connection:', connectionId);
      // TODO: Send rejection message via BLE if device is nearby
      return true;
    } catch (error) {
      await logError('Error rejecting connection:', error);
      return false;
    }
  }

  /**
   * Get pending received connections (connection requests awaiting approval)
   */
  async getPendingRequests(): Promise<Connection[]> {
    try {
      return await Database.getPendingReceivedConnections();
    } catch (error) {
      await logError('Error getting pending requests:', error);
      return [];
    }
  }

  /**
   * Get all connections (followers/following) from database
   */
  async getConnections(): Promise<Connection[]> {
    try {
      return await Database.getConnections();
    } catch (error) {
      await logError('Error getting connections:', error);
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
      await logError('Error getting connection:', error);
      return null;
    }
  }

  /**
   * Delete a connection
   */
  async deleteConnection(connectionId: string): Promise<boolean> {
    try {
      await Database.deleteConnection(connectionId);
      await log('Connection deleted:', connectionId);
      return true;
    } catch (error) {
      await logError('Error deleting connection:', error);
      return false;
    }
  }
}

export default new ConnectionServiceClass();
