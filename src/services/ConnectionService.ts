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
import Bluetooth from '@localcommunity/rn-bluetooth';
import Database from './storage/Database';
import IdentityService from './IdentityService';
import ECDHService from './crypto/ECDH';
import {Connection} from '../types/models';
import {ConnectionProfile, ConnectionRequest, ConnectionResponse} from '../types/bluetooth';
import {generateUUID} from '../utils/crypto';
import {log, logError, logWarn} from '../utils/logger';
import PendingConnectionReconciler from './PendingConnectionReconciler';

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
    console.log(`[ConnectionService] 🎯 Setting up response waiter for userId: ${userId} (timeout: ${timeoutMs}ms)`);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[ConnectionService] ⏰ Response timeout for userId: ${userId} - no response received in ${timeoutMs}ms`);
        this.pendingResponses.delete(userId);
        resolve(null); // Timeout - no response received
      }, timeoutMs);

      this.pendingResponses.set(userId, {
        resolve: (response) => {
          console.log(`[ConnectionService] ⚡ Response received for userId: ${userId}, status: ${response.status}`);
          clearTimeout(timeout);
          this.pendingResponses.delete(userId);
          resolve(response);
        },
        reject: (error) => {
          console.error(`[ConnectionService] ❌ Response error for userId: ${userId}:`, error);
          clearTimeout(timeout);
          this.pendingResponses.delete(userId);
          resolve(null);
        },
      });
      console.log(`[ConnectionService] ✅ Response waiter registered for userId: ${userId}`);
    });
  }

  /**
   * Notify that a response was received (called by handleConnectionResponse)
   */
  private notifyResponseReceived(userId: string, response: ConnectionResponse): void {
    const handler = this.pendingResponses.get(userId);
    if (handler) {
      console.log(`[ConnectionService] ✅ Resolving pending response for userId: ${userId}`);
      handler.resolve(response);
    } else {
      console.warn(`[ConnectionService] ⚠️ No pending response handler found for userId: ${userId}`);
      console.warn(`[ConnectionService] Current pending userIds:`, Array.from(this.pendingResponses.keys()));
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
        
        // Check if it's a profile photo issue
        console.error('');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('⚠️  PROFILE READ FAILED - LIKELY PROFILE PHOTO IN GATT');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('');
        console.error('The other device is advertising with a profile photo included,');
        console.error('which exceeds the 512-byte BLE GATT limit and causes truncation.');
        console.error('');
        console.error('SOLUTION:');
        console.error('  1. Have the other device RESTART their app');
        console.error('  2. Ensure HomeScreen.tsx excludes profilePhoto from fullProfile');
        console.error('  3. Try connecting again after both devices are updated');
        console.error('');
        console.error('See PROFILE_PHOTO_BLE_ISSUE.md for details');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('');
        
        throw new Error('Profile read failed - other device likely has profile photo in GATT (not supported). Both devices must restart with updated code.');
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

      // IMPORTANT: Strip profile photo if present (shouldn't be there, but handle legacy devices)
      // Profile photos are too large for BLE GATT (512 byte limit) and cause parse errors
      if (theirProfile.profilePhoto) {
        console.log('[ConnectionService] ⚠️ Removing profile photo from received profile (too large for BLE)');
        theirProfile = {
          ...theirProfile,
          profilePhoto: undefined,
        };
      }

      // Check if connection already exists FIRST (before shouldInitiate check)
      await log(`🔍 [ConnectionService] Checking for existing connection with userId: ${theirProfile.userId}`);
      const existingConnection = await Database.getConnectionByUserId(theirProfile.userId);
      await log(`🔍 [ConnectionService] Existing connection: ${existingConnection ? existingConnection.status : 'NONE'}`);
      
      // Track if we've already upgraded to mutual (bidirectional case)
      let alreadyUpgradedToMutual = false;
      
      if (existingConnection) {
        await log(`🔍 [ConnectionService] Found existing connection: ${existingConnection.status} (id: ${existingConnection.id})`);
        
        // BIDIRECTIONAL CONNECTION RECONCILIATION:
        // If we're initiating and we have a pending connection (either direction),
        // this is MUTUAL INTENT - both sides want to connect!
        if (existingConnection.status === 'pending-sent' || existingConnection.status === 'pending-received') {
          console.log('[ConnectionService] 🤝 BIDIRECTIONAL CONNECTION DETECTED!');
          console.log('[ConnectionService] We have:', existingConnection.status);
          console.log('[ConnectionService] We are initiating connection');
          console.log('[ConnectionService] = MUTUAL INTENT - upgrading OUR side to mutual immediately');
          
          // Upgrade OUR side to mutual immediately
          await Database.updateConnectionStatus(existingConnection.id, 'mutual');
          alreadyUpgradedToMutual = true;
          
          console.log('[ConnectionService] ✅ Our side upgraded to mutual');
          console.log('[ConnectionService] 📤 Now sending handshake so OTHER side can upgrade too...');
          
          // IMPORTANT: Continue to send handshake so the other device can also upgrade
          // We'll skip waiting for response since we're already mutual
          // Fall through to handshake send below
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

      // If we already upgraded to mutual in bidirectional case, skip waiting for response
      if (alreadyUpgradedToMutual) {
        console.log('[ConnectionService] 🎯 Bidirectional case - skipping response wait, already mutual');
        await BLEManager.disconnectFromDevice(deviceId);
        
        const updatedConnection: Connection = {
          ...existingConnection!,
          displayName: theirProfile.displayName,
          profilePhoto: theirProfile.profilePhoto,
          status: 'mutual',
          trustLevel: 'verified',
        };
        
        return {profile: theirProfile, connection: updatedConnection};
      }

      // IMPORTANT: Set up response waiter BEFORE sending request to avoid race condition
      // If the other device responds quickly, we need to be ready to receive it
      await log('✅ [ConnectionService] Setting up response listener...');
      const responsePromise = this.waitForResponse(theirProfile.userId, 30000); // 30 seconds to allow time for manual acceptance

      await log('✅ [ConnectionService] Connection request sent, waiting for response (30 seconds)...');

      // Wait for response (waiter already set up above)
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

      // Don't disconnect immediately - keep connection open to receive late responses
      // The connection will naturally close when devices move out of range or when explicitly disconnected
      await log(`✅ [ConnectionService] Connection established, leaving BLE connection open for potential late responses`);

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
      console.log('[ConnectionService] 🔍 Looking up existing connection for userId:', request.requester.userId);
      
      let existingConnection;
      try {
        existingConnection = await Database.getConnectionByUserId(
          request.requester.userId,
        );
        console.log('[ConnectionService] 🔍 Database lookup result:', existingConnection ? `FOUND (status: ${existingConnection.status})` : 'NOT FOUND');
      } catch (dbError) {
        console.error('[ConnectionService] ❌ Database lookup failed:', dbError);
        existingConnection = null;
      }
      
      if (existingConnection) {
        console.log('[ConnectionService] 🔄 Received request from user we already have a connection with');
        console.log('[ConnectionService] Existing connection ID:', existingConnection.id);
        console.log('[ConnectionService] Existing status:', existingConnection.status);
        console.log('[ConnectionService] Existing userId:', existingConnection.userId);
        
        // BIDIRECTIONAL CONNECTION RECONCILIATION:
        // If we have ANY connection record with them (pending-sent, pending-received, or mutual),
        // and they're sending us a connection request, it means they also want to connect.
        // This is a mutual connection intent - upgrade to mutual on both sides.
        if (existingConnection.status === 'pending-sent' || existingConnection.status === 'pending-received') {
          console.log('[ConnectionService] ✅ Bidirectional connection detected - upgrading to mutual');
          console.log('[ConnectionService] Before update: status =', existingConnection.status);
          await Database.updateConnectionStatus(existingConnection.id, 'mutual');
          console.log('[ConnectionService] After update: status should be mutual');
          await log('🤝 Bidirectional connection - upgraded to mutual:', existingConnection.id);
          
          // Verify the update worked
          const updatedConnection = await Database.getConnection(existingConnection.id);
          console.log('[ConnectionService] Verification - DB now shows status:', updatedConnection?.status);
        } else {
          console.log('[ConnectionService] Connection already mutual, sending accepted response');
        }

        // Return acceptance response with our profile
        // IMPORTANT: Always return 'accepted' when we have mutual intent
        console.log('[ConnectionService] Returning response: accepted (bidirectional mutual intent)');
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

      try {
        await Database.saveConnection(connection);
        await log(`Connection ${autoAccept ? 'accepted' : 'queued'}:`, connection.id);
      } catch (dbError) {
        console.error('[ConnectionService] ❌ Failed to save connection:', dbError);
        // Continue anyway - try to send response even if save failed
      }

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

      // Send acceptance response to the requester via BLE notification
      // The requester should still be connected (if they stayed in range)
      try {
        await log('📤 [ConnectionService] Sending acceptance response via BLE...');

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

        // Try to find the requester device to get its BLE address
        const discoveredDevices = BLEManager.getDiscoveredDevices();
        const requesterDevice = Array.from(discoveredDevices.values()).find(
          d => d.broadcastPayload?.displayName === connection.displayName
        );

        if (requesterDevice) {
          // Send via peripheral manager (to connected central)
          await Bluetooth.sendConnectionResponse(requesterDevice.deviceId, response);
          await log('✅ [ConnectionService] Acceptance response sent via BLE notification');
        } else {
          await log('⚠️ [ConnectionService] Requester device not found - they may have moved out of range');
          await log('💡 [ConnectionService] They will see acceptance when they scan again');
        }
      } catch (error) {
        await logWarn('⚠️ [ConnectionService] Could not send BLE notification:', error);
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

      // Send rejection response back to requester via BLE notification
      // The requester should still be connected (if they stayed in range)
      try {
        await log('📤 [ConnectionService] Sending rejection response via BLE...');

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

        // Try to find the requester device to get its BLE address
        const discoveredDevices = BLEManager.getDiscoveredDevices();
        const requesterDevice = Array.from(discoveredDevices.values()).find(
          d => d.broadcastPayload?.displayName === connection.displayName
        );

        if (requesterDevice) {
          // Send via peripheral manager (to connected central)
          await Bluetooth.sendConnectionResponse(requesterDevice.deviceId, response);
          await log('✅ [ConnectionService] Rejection response sent via BLE notification');
        } else {
          await log('⚠️ [ConnectionService] Requester device not found - they may have moved out of range');
        }
      } catch (error) {
        await logWarn('⚠️ [ConnectionService] Could not send BLE notification:', error);
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
