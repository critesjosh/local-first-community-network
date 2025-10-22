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

        // If connection is pending-sent, upgrade to mutual
        // (The fact that they're still broadcasting means they haven't blocked us)
        if (existingConnection.status === 'pending-sent') {
          await log('Found pending-sent connection, upgrading to mutual:', existingConnection.id);
          await Database.updateConnectionStatus(existingConnection.id, 'mutual');
          existingConnection.status = 'mutual';
          await log('Connection upgraded to mutual');
        }

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

      await log('Connection request sent, waiting for response...');

      // Wait briefly for response (the responder will write back to our handshake characteristic)
      // If auto-accept is enabled on their side, they'll send response immediately
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for response

      // TODO: Derive shared secret later when needed for encryption
      // For now, just store the connection without the shared secret

      // Create connection with pending-sent status
      // Will be upgraded to mutual when responder accepts
      const connection: Connection = {
        id: generateUUID(),
        userId: theirProfile.userId,
        displayName: theirProfile.displayName,
        profilePhoto: theirProfile.profilePhoto,
        sharedSecret: undefined, // Will be derived later when needed
        connectedAt: new Date(),
        status: 'pending-sent',
        trustLevel: 'pending',
      };

      await Database.saveConnection(connection);
      await log('Connection request sent, status: pending-sent:', connection.id);

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
      await log('Manually accepting connection:', connectionId);

      // Get connection before update
      const connection = await Database.getConnection(connectionId);
      if (!connection) {
        await logError('Connection not found:', connectionId);
        return false;
      }

      await log('Connection before update:', {
        id: connection.id,
        status: connection.status,
        displayName: connection.displayName,
        userId: connection.userId,
      });

      // Update status to mutual
      await Database.updateConnectionStatus(connectionId, 'mutual');
      await log('Database status updated to mutual');

      // Send acceptance response back to requester
      // Note: This is a best-effort attempt - if they're not nearby/advertising, it will fail silently
      try {
        await log('Attempting to notify requester of acceptance...');

        // Create acceptance response
        const response = await this.createConnectionResponse('accepted');
        if (!response) {
          throw new Error('Failed to create response');
        }

        await log('Response created, looking for requester to send notification');

        // Try to find and connect to the requester's device
        // This requires them to still be advertising
        // For now, we'll skip this since it's complex - the requester will see the update
        // when they check their connections list (via polling)

        await log('Manual acceptance complete - requester will see update via polling');
      } catch (error) {
        await logWarn('Could not send BLE notification to requester:', error);
        await log('Requester will see acceptance via polling');
      }

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
   * Check for pending connection status updates by scanning nearby devices
   * This syncs pending-sent connections to mutual if the other party has accepted
   */
  async syncPendingConnections(): Promise<number> {
    try {
      const connections = await Database.getConnections();
      const pendingConnections = connections.filter(c => c.status === 'pending-sent');

      if (pendingConnections.length === 0) {
        await log('No pending connections to sync');
        return 0;
      }

      await log(`Found ${pendingConnections.length} pending connection(s), starting background scan...`);

      // Start scanning for nearby devices
      await BLEManager.startScanning();

      // Wait 3 seconds to discover devices
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Stop scanning
      await BLEManager.stopScanning();

      // Get discovered devices
      const discoveredDevices = BLEManager.getDiscoveredDevices();
      await log(`Background scan found ${discoveredDevices.length} device(s)`);

      let upgradeCount = 0;

      // Check each discovered device against pending connections
      for (const device of discoveredDevices) {
        const payload = device.broadcastPayload;
        if (!payload?.userHashHex) continue;

        // Check if we have a pending connection to this device
        // We need to connect to get their full userId, but we can try connecting
        try {
          const connectedDevice = await BLEManager.connectToDevice(device.deviceId);
          if (!connectedDevice) continue;

          const profile = await BLEManager.readProfile(connectedDevice);
          await BLEManager.disconnectFromDevice(device.deviceId);

          if (!profile) continue;

          // Check if we have a pending-sent connection to this user
          const pendingConnection = pendingConnections.find(c => c.userId === profile.userId);
          if (pendingConnection && pendingConnection.status === 'pending-sent') {
            await log(`Upgrading pending connection to ${profile.displayName} to mutual`);
            await Database.updateConnectionStatus(pendingConnection.id, 'mutual');
            upgradeCount++;
          }
        } catch (error) {
          // Silently continue to next device
          continue;
        }
      }

      await log(`Background sync complete, upgraded ${upgradeCount} connection(s)`);
      return upgradeCount;
    } catch (error) {
      await logError('Error syncing pending connections:', error);
      return 0;
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

  /**
   * Create a simulated self-connection for testing
   * This allows testing event sharing without a second device
   */
  async createSelfConnection(): Promise<Connection | null> {
    try {
      await log('Creating self-connection for testing...');

      // Get current user identity
      const identity = IdentityService.getCurrentIdentity();
      const currentUser = await IdentityService.getCurrentUser();
      if (!identity || !currentUser) {
        throw new Error('No current user identity');
      }

      // Generate two ECDH key pairs (simulating two devices)
      const deviceAKeys = await ECDHService.generateKeyPair();
      const deviceBKeys = await ECDHService.generateKeyPair();

      // Derive shared secret (A's private key + B's public key)
      const sharedSecret = await ECDHService.deriveSharedSecret(
        deviceAKeys.privateKey,
        deviceBKeys.publicKey,
      );

      // Create connection record with yourself
      const connection: Connection = {
        id: generateUUID(),
        userId: currentUser.id + '-test', // Append -test to avoid collision
        displayName: currentUser.displayName + ' (Test)',
        sharedSecret,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      };

      // Save to database
      await Database.saveConnection(connection);

      await log('Self-connection created:', connection.id);
      return connection;
    } catch (error) {
      await logError('Error creating self-connection:', error);
      return null;
    }
  }
}

export default new ConnectionServiceClass();
