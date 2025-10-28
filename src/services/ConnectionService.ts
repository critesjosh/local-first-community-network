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
  private pendingResponses: Map<string, {
    resolve: (response: ConnectionResponse) => void;
    reject: (error: Error) => void;
  }> = new Map();
  
  // Track active connection attempts to prevent simultaneous connections
  private activeConnections: Set<string> = new Set();

  /**
   * Register a pending response handler for a user
   * Used internally to wait for connection responses
   */
  private waitForResponse(userId: string, timeoutMs: number): Promise<ConnectionResponse | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(userId);
        resolve(null); // Timeout - no response received
      }, timeoutMs);

      this.pendingResponses.set(userId, {
        resolve: (response) => {
          clearTimeout(timeout);
          this.pendingResponses.delete(userId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingResponses.delete(userId);
          resolve(null);
        },
      });
    });
  }

  /**
   * Notify that a response was received (called by handleConnectionResponse)
   */
  private notifyResponseReceived(userId: string, response: ConnectionResponse): void {
    const handler = this.pendingResponses.get(userId);
    if (handler) {
      handler.resolve(response);
    }
  }

  /**
   * Determine if we should initiate connection based on user ID comparison
   * This prevents race conditions when both devices discover each other simultaneously
   * The device with the lexicographically smaller user ID initiates
   */
  private async shouldInitiateConnection(theirUserId: string): Promise<boolean> {
    const currentUser = await IdentityService.getCurrentUser();
    if (!currentUser) {
      return false;
    }
    
    // Compare user IDs lexicographically
    // The device with smaller ID always initiates
    const shouldInitiate = currentUser.id < theirUserId;
    
    if (!shouldInitiate) {
      await log(`⏸️ [ConnectionService] Skipping connection initiation - other device should initiate (our ID: ${currentUser.id}, their ID: ${theirUserId})`);
    }
    
    return shouldInitiate;
  }

  /**
   * Check if a connection attempt is already in progress for this device
   */
  private isConnectionInProgress(deviceId: string): boolean {
    return this.activeConnections.has(deviceId);
  }

  /**
   * Initiate a connection request to a discovered device
   * @param deviceId BLE device ID
   * @returns Connection record if successful, null otherwise
   */
  async requestConnection(deviceId: string): Promise<{
    profile: ConnectionProfile;
    connection: Connection;
  } | null> {
    // Check if connection already in progress
    if (this.isConnectionInProgress(deviceId)) {
      await log(`⏭️ [ConnectionService] Connection already in progress for device ${deviceId}, skipping`);
      return null;
    }

    // Mark connection as in progress
    this.activeConnections.add(deviceId);

    try {
      await log(`🔗 [ConnectionService] Requesting connection to device ${deviceId}...`);

      // Connect to device
      await log(`🔗 [ConnectionService] Step 1: Connecting to GATT server...`);
      const device = await BLEManager.connectToDevice(deviceId);
      if (!device) {
        await logError('❌ [ConnectionService] Failed to connect to device - device is null');
        throw new Error('Failed to connect to device');
      }
      await log(`✅ [ConnectionService] Connected to device: ${device.id}`);

      // Read their profile
      await log(`🔗 [ConnectionService] Step 2: Reading profile from device...`);
      let theirProfile = await BLEManager.readProfile(device);
      if (!theirProfile) {
        await logError('❌ [ConnectionService] Failed to read profile - profile is null');
        await BLEManager.disconnectFromDevice(deviceId);
        throw new Error('Failed to read profile from device');
      }
      await log(`✅ [ConnectionService] Profile received:`, JSON.stringify(theirProfile));
      await log(`🔍 [ConnectionService] DEBUG - Profile type: ${typeof theirProfile}, userId: ${theirProfile?.userId}`);
      
      // If profile is a string, parse it
      if (typeof theirProfile === 'string') {
        await log(`⚠️ [ConnectionService] Profile is a string, parsing...`);
        theirProfile = JSON.parse(theirProfile) as ConnectionProfile;
        if (!theirProfile || !theirProfile.userId) {
          await logError('❌ [ConnectionService] Parsed profile is invalid');
          await BLEManager.disconnectFromDevice(deviceId);
          throw new Error('Invalid profile data after parsing');
        }
        await log(`✅ [ConnectionService] Profile parsed, userId: ${theirProfile.userId}`);
      }

      // Check if connection already exists FIRST (before shouldInitiate check)
      await log(`🔍 [ConnectionService] Checking for existing connection with userId: ${theirProfile.userId}`);
      const existingConnection = await Database.getConnectionByUserId(theirProfile.userId);
      await log(`🔍 [ConnectionService] Existing connection: ${existingConnection ? existingConnection.status : 'NONE'}`);
      
      if (existingConnection) {
        await log(`🔍 [ConnectionService] Found existing connection: ${existingConnection.status} (id: ${existingConnection.id})`);
        
        // BIDIRECTIONAL CONNECTION RECONCILIATION:
        // If connection is pending-sent or pending-received, we should try to reconcile
        // by sending a new handshake to facilitate mutual upgrade
        if (existingConnection.status === 'pending-sent' || existingConnection.status === 'pending-received') {
          console.log('[ConnectionService] 🔄 Attempting to reconcile pending connection');
          console.log('[ConnectionService] Current status:', existingConnection.status);
          console.log('[ConnectionService] Sending new handshake to facilitate bidirectional upgrade...');
          // Continue below to send our handshake - the other device will recognize
          // the bidirectional intent and upgrade both sides to mutual
        } else {
          // Already mutual or other state
          await BLEManager.disconnectFromDevice(deviceId);
          return {profile: theirProfile, connection: existingConnection};
        }
      }

      // Get current user identity and profile
      const identity = IdentityService.getCurrentIdentity();
      const currentUser = await IdentityService.getCurrentUser();
      if (!identity || !currentUser) {
        throw new Error('No current user identity');
      }

      // ALWAYS send a handshake request - let the other device decide to accept/reject
      // The receiving device will save it as 'pending-received' and show it to the user
      await log('🔗 [ConnectionService] Step 3: Sending connection request...');

      // Prepare connection request
      // NOTE: Don't include profilePhoto in handshake - it's too large for BLE writes
      // Profile photo is already obtained via readProfile() from GATT server
      const connectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          publicKey: Buffer.from(identity.publicKey).toString('base64'),
          // profilePhoto is omitted - already transferred via GATT read
        },
        timestamp: new Date().toISOString(),
      };

      // Send connection request
      await log(`🔗 [ConnectionService] Step 3: Sending connection request...`);
      const requestSent = await BLEManager.writeHandshake(device, connectionRequest);
      if (!requestSent) {
        throw new Error('Failed to send connection request');
      }

      await log('✅ [ConnectionService] Connection request sent, waiting for response (8 seconds)...');

      // Wait for response with 8 second timeout
      // The responder will process our request and may send back a response
      const responsePromise = this.waitForResponse(theirProfile.userId, 8000);
      const response = await responsePromise;

      // Determine connection status based on response
      let connectionStatus: 'mutual' | 'pending-sent' | 'pending-received' = 'pending-sent';
      
      if (response) {
        await log(`📥 [ConnectionService] Received response: ${response.status}`);
        if (response.status === 'accepted') {
          connectionStatus = 'mutual';
          console.log('[ConnectionService] ✅ Connection auto-accepted by responder - upgrading to mutual');
          await log('✅ [ConnectionService] Connection auto-accepted by responder');
        } else if (response.status === 'pending') {
          connectionStatus = 'pending-sent';
          await log('⏳ [ConnectionService] Connection queued for manual approval');
        } else if (response.status === 'rejected') {
          await log('❌ [ConnectionService] Connection rejected by responder');
          await BLEManager.disconnectFromDevice(deviceId);
          throw new Error('Connection rejected by other user');
        }
      } else {
        await log('⏰ [ConnectionService] No response received within timeout, marking as pending-sent');
      }

      // TODO: Derive shared secret later when needed for encryption
      // For now, just store the connection without the shared secret

      // Update existing connection or create new one
      let connection: Connection;
      
      if (existingConnection) {
        console.log('[ConnectionService] 🔄 Updating existing connection from', existingConnection.status, 'to', connectionStatus);
        // Update existing connection
        await Database.updateConnectionStatus(existingConnection.id, connectionStatus);
        connection = {
          ...existingConnection,
          displayName: theirProfile.displayName,
          profilePhoto: theirProfile.profilePhoto,
          status: connectionStatus,
          trustLevel: connectionStatus === 'mutual' ? 'verified' : 'pending',
        };
        await log(`✅ [ConnectionService] Connection updated with status: ${connectionStatus}`, connection.id);
      } else {
        console.log('[ConnectionService] 📝 Creating new connection with status:', connectionStatus);
        // Create new connection record
        connection = {
          id: generateUUID(),
          userId: theirProfile.userId,
          displayName: theirProfile.displayName,
          profilePhoto: theirProfile.profilePhoto,
          sharedSecret: undefined, // Will be derived later when needed
          connectedAt: new Date(),
          status: connectionStatus,
          trustLevel: connectionStatus === 'mutual' ? 'verified' : 'pending',
        };
        await Database.saveConnection(connection);
        await log(`✅ [ConnectionService] Connection saved with status: ${connectionStatus}`, connection.id);
      }

      await BLEManager.disconnectFromDevice(deviceId);

      return {profile: theirProfile, connection};
    } catch (error) {
      await logError('Error requesting connection:', error);
      return null;
    } finally {
      // Clean up active connection tracking
      this.activeConnections.delete(deviceId);
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
        console.log('[ConnectionService] 🔄 Received request from user we already have a connection with');
        console.log('[ConnectionService] Existing status:', existingConnection.status);
        
        // BIDIRECTIONAL CONNECTION RECONCILIATION:
        // If we have ANY connection record with them (pending-sent, pending-received, or mutual),
        // and they're sending us a connection request, it means they also want to connect.
        // This is a mutual connection intent - upgrade to mutual on both sides.
        if (existingConnection.status === 'pending-sent' || existingConnection.status === 'pending-received') {
          console.log('[ConnectionService] ✅ Bidirectional connection detected - upgrading to mutual');
          await Database.updateConnectionStatus(existingConnection.id, 'mutual');
          await log('🤝 Bidirectional connection - upgraded to mutual:', existingConnection.id);
        } else {
          console.log('[ConnectionService] Connection already mutual, sending accepted response');
        }

        // Return acceptance response with our profile
        return await this.createConnectionResponse('accepted');
      }

      // Get auto-accept setting
      const autoAccept = await Database.getAutoAcceptConnections();

      // TODO: Derive shared secret later when needed for encryption
      // For now, just store the connection without the shared secret

      // Create connection record
      // Note: profilePhoto is not in the handshake (too large for BLE writes)
      // It will be obtained later when we connect to read their profile
      const connection: Connection = {
        id: generateUUID(),
        userId: request.requester.userId,
        displayName: request.requester.displayName,
        profilePhoto: request.requester.profilePhoto, // May be undefined, will update later
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
          // profilePhoto is omitted - already transferred via GATT read
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
      console.log('[ConnectionService] 📥 Handling connection response from:', response.responder.displayName);
      console.log('[ConnectionService] Response status:', response.status);
      console.log('[ConnectionService] Responder userId:', response.responder.userId);

      // Notify any pending requestConnection calls waiting for this response
      this.notifyResponseReceived(response.responder.userId, response);

      // Find the pending connection
      const connection = await Database.getConnectionByUserId(response.responder.userId);
      if (!connection) {
        console.warn('[ConnectionService] ⚠️  No pending connection found for userId:', response.responder.userId);
        await logWarn('No pending connection found for response');
        return;
      }

      console.log('[ConnectionService] Found connection:', connection.id, 'Current status:', connection.status);

      // Update status based on response
      if (response.status === 'accepted') {
        console.log('[ConnectionService] ✅ Accepting connection - updating to mutual');
        await Database.updateConnectionStatus(connection.id, 'mutual');
        console.log('[ConnectionService] ✅ Connection upgraded to mutual:', connection.id);
        await log('Connection accepted and upgraded to mutual:', connection.id);
      } else if (response.status === 'rejected') {
        console.log('[ConnectionService] ❌ Rejecting connection - deleting');
        await Database.deleteConnection(connection.id);
        console.log('[ConnectionService] ✅ Connection deleted:', connection.id);
        await log('Connection rejected and deleted:', connection.id);
      } else {
        console.log('[ConnectionService] ⏳ Response status is pending, leaving as-is');
      }
    } catch (error) {
      console.error('[ConnectionService] ❌ Error handling connection response:', error);
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
      // This is a best-effort attempt - if they're not nearby/advertising, it will fail silently
      try {
        await log('📤 [ConnectionService] Sending acceptance response to requester...');

        // Create acceptance response
        const currentUser = await IdentityService.getCurrentUser();
        const identity = IdentityService.getCurrentIdentity();
        if (!currentUser || !identity) {
          throw new Error('No current user identity');
        }

        const response: ConnectionResponse = {
          type: 'connection-response',
          responder: {
            userId: currentUser.id,
            displayName: currentUser.displayName,
            publicKey: Buffer.from(identity.publicKey).toString('base64'),
          },
          status: 'accepted',
          timestamp: new Date().toISOString(),
        };

        // Try to find and connect to the requester's device
        await log('🔍 [ConnectionService] Looking for requester device...');
        const discoveredDevices = BLEManager.getDiscoveredDevices();
        
        // Find device by userId match
        const requesterDevice = Array.from(discoveredDevices.values()).find(
          d => d.broadcastPayload?.displayName === connection.displayName
        );

        if (requesterDevice) {
          await log(`✅ [ConnectionService] Found requester device: ${requesterDevice.deviceId}`);
          
          // Connect and send response
          const device = await BLEManager.connectToDevice(requesterDevice.deviceId);
          if (device) {
            await log('🔗 [ConnectionService] Connected, writing acceptance response...');
            await BLEManager.writeHandshake(device, response);
            await log('✅ [ConnectionService] Acceptance response sent!');
            await BLEManager.disconnectFromDevice(requesterDevice.deviceId);
          } else {
            throw new Error('Failed to connect to requester device');
          }
        } else {
          await log('⚠️ [ConnectionService] Requester device not found in nearby devices');
          await log('💡 [ConnectionService] Requester will see acceptance when they scan again');
        }
      } catch (error) {
        await logWarn('⚠️ [ConnectionService] Could not send BLE notification to requester:', error);
        await log('💡 [ConnectionService] Requester will see acceptance via next scan');
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
      await log('Manually rejecting connection:', connectionId);

      // Get connection before deleting
      const connection = await Database.getConnection(connectionId);
      if (!connection) {
        await logError('Connection not found:', connectionId);
        return false;
      }

      // Delete the connection
      await Database.deleteConnection(connectionId);
      await log('Connection deleted from database');

      // Send rejection response back to requester
      // This is a best-effort attempt - if they're not nearby, it will fail silently
      try {
        await log('📤 [ConnectionService] Sending rejection response to requester...');

        const currentUser = await IdentityService.getCurrentUser();
        const identity = IdentityService.getCurrentIdentity();
        if (!currentUser || !identity) {
          throw new Error('No current user identity');
        }

        const response: ConnectionResponse = {
          type: 'connection-response',
          responder: {
            userId: currentUser.id,
            displayName: currentUser.displayName,
            publicKey: Buffer.from(identity.publicKey).toString('base64'),
          },
          status: 'rejected',
          timestamp: new Date().toISOString(),
        };

        // Try to find and connect to the requester's device
        await log('🔍 [ConnectionService] Looking for requester device...');
        const discoveredDevices = BLEManager.getDiscoveredDevices();
        
        const requesterDevice = Array.from(discoveredDevices.values()).find(
          d => d.broadcastPayload?.displayName === connection.displayName
        );

        if (requesterDevice) {
          await log(`✅ [ConnectionService] Found requester device: ${requesterDevice.deviceId}`);
          
          const device = await BLEManager.connectToDevice(requesterDevice.deviceId);
          if (device) {
            await log('🔗 [ConnectionService] Connected, writing rejection response...');
            await BLEManager.writeHandshake(device, response);
            await log('✅ [ConnectionService] Rejection response sent!');
            await BLEManager.disconnectFromDevice(requesterDevice.deviceId);
          } else {
            throw new Error('Failed to connect to requester device');
          }
        } else {
          await log('⚠️ [ConnectionService] Requester device not found in nearby devices');
        }
      } catch (error) {
        await logWarn('⚠️ [ConnectionService] Could not send rejection notification:', error);
      }

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
   * This syncs pending connections (both sent and received) to mutual by 
   * facilitating bidirectional handshakes
   */
  async syncPendingConnections(): Promise<number> {
    try {
      const connections = await Database.getConnections();
      const pendingConnections = connections.filter(
        c => c.status === 'pending-sent' || c.status === 'pending-received'
      );

      if (pendingConnections.length === 0) {
        await log('No pending connections to sync');
        return 0;
      }

      console.log('[ConnectionService] 🔄 Syncing pending connections:', pendingConnections.map(c => `${c.displayName} (${c.status})`).join(', '));
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

      // Check each discovered device and try to complete the connection
      for (const device of discoveredDevices) {
        const payload = device.broadcastPayload;
        if (!payload?.userHashHex) continue;

        // Try to complete the connection using the full requestConnection flow
        // This will handle the handshake properly
        try {
          await log(`🔄 [ConnectionService] Attempting to connect to ${device.name || 'device'}...`);
          const result = await this.requestConnection(device.deviceId);
          
          if (result && result.connection.status === 'mutual') {
            await log(`✅ [ConnectionService] Successfully upgraded connection to ${result.profile.displayName}`);
            upgradeCount++;
          } else if (result) {
            await log(`📤 [ConnectionService] Connection still ${result.connection.status} for ${result.profile.displayName}`);
          }
        } catch (error) {
          await logWarn(`⚠️ [ConnectionService] Failed to connect to device ${device.name}:`, error);
          // Continue to next device
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
   * Get pending connections
   */
  async getPendingConnections(): Promise<Connection[]> {
    return await this.getPendingRequests();
  }

}

export default new ConnectionServiceClass();
