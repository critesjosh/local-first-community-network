/**
 * Integration test for complete BLE connection flow
 * 
 * This test simulates the interaction between two devices:
 * - Device A (advertiser/responder)
 * - Device B (scanner/requester)
 */

import ConnectionService from '../../src/services/ConnectionService';
import BLEConnectionHandler from '../../src/services/bluetooth/BLEConnectionHandler';
import Database from '../../src/services/storage/Database';
import IdentityService from '../../src/services/IdentityService';
import {ConnectionProfile, ConnectionRequest, ConnectionResponse} from '../../src/types/bluetooth';

// Mock only the native BLE layer
jest.mock('@localcommunity/rn-bluetooth', () => ({
  Bluetooth: {
    initialize: jest.fn().mockResolvedValue(undefined),
    requestPermissions: jest.fn().mockResolvedValue(true),
    connect: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    readProfile: jest.fn(),
    writeFollowRequest: jest.fn(),
    sendConnectionResponse: jest.fn().mockResolvedValue(undefined),
  },
  addBluetoothListener: jest.fn((listener) => {
    // Return unsubscribe function
    return () => {};
  }),
}));

jest.mock('../../src/utils/logger');

// Mock Database for integration tests
jest.mock('../../src/services/storage/Database');

describe('Connection Flow Integration Test', () => {
  let mockConnections: any[] = [];

  beforeAll(() => {
    // Setup Database mocks
    const Database = require('../../src/services/storage/Database').default;
    
    (Database.getConnections as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve([...mockConnections]));
    (Database.saveConnection as jest.Mock) = jest.fn().mockImplementation((conn) => {
      mockConnections.push(conn);
      return Promise.resolve();
    });
    (Database.getConnectionByUserId as jest.Mock) = jest.fn().mockImplementation((userId) => {
      return Promise.resolve(mockConnections.find(c => c.userId === userId) || null);
    });
    (Database.updateConnectionStatus as jest.Mock) = jest.fn().mockImplementation((id, status) => {
      const conn = mockConnections.find(c => c.id === id);
      if (conn) conn.status = status;
      return Promise.resolve();
    });
    (Database.deleteConnection as jest.Mock) = jest.fn().mockImplementation((id) => {
      mockConnections = mockConnections.filter(c => c.id !== id);
      return Promise.resolve();
    });
    (Database.getAutoAcceptConnections as jest.Mock) = jest.fn().mockResolvedValue(true);
    (Database.getPendingReceivedConnections as jest.Mock) = jest.fn().mockImplementation(() => {
      return Promise.resolve(mockConnections.filter(c => c.status === 'pending-received'));
    });
    (Database.getConnection as jest.Mock) = jest.fn().mockImplementation((id) => {
      return Promise.resolve(mockConnections.find(c => c.id === id) || null);
    });
  });

  // Device A (advertiser/responder)
  const deviceAUserId = 'device-a-user-123';
  const deviceADisplayName = 'Device A User';
  const deviceAPublicKey = Buffer.from('device-a-public-key');
  const deviceAId = 'ble-device-a-uuid';

  const deviceAProfile: ConnectionProfile = {
    userId: deviceAUserId,
    displayName: deviceADisplayName,
    publicKey: Buffer.from(deviceAPublicKey).toString('base64'),
    profilePhoto: undefined,
  };

  const deviceAIdentity = {
    publicKey: deviceAPublicKey,
    privateKey: Buffer.from('device-a-private-key'),
  };

  const deviceAUser = {
    id: deviceAUserId,
    displayName: deviceADisplayName,
    profilePhoto: undefined,
  };

  // Device B (scanner/requester)
  const deviceBUserId = 'device-b-user-456';
  const deviceBDisplayName = 'Device B User';
  const deviceBPublicKey = Buffer.from('device-b-public-key');
  const deviceBId = 'ble-device-b-uuid';

  const deviceBProfile: ConnectionProfile = {
    userId: deviceBUserId,
    displayName: deviceBDisplayName,
    publicKey: Buffer.from(deviceBPublicKey).toString('base64'),
    profilePhoto: undefined,
  };

  const deviceBIdentity = {
    publicKey: deviceBPublicKey,
    privateKey: Buffer.from('device-b-private-key'),
  };

  const deviceBUser = {
    id: deviceBUserId,
    displayName: deviceBDisplayName,
    profilePhoto: undefined,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clear mock connections
    mockConnections = [];
  });

  describe('Auto-Accept Connection Flow', () => {
    it('should complete full connection flow with auto-accept enabled', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      // Setup Device B as requester (current device)
      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceBIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceBUser);

      // Setup Device A responses
      (Bluetooth.connect as jest.Mock).mockResolvedValue({id: deviceAId});
      (Bluetooth.readProfile as jest.Mock).mockResolvedValue(deviceAProfile);
      (Bluetooth.writeFollowRequest as jest.Mock).mockResolvedValue(true);

      // Start BLEConnectionHandler to handle incoming events
      BLEConnectionHandler.start();

      // === STEP 1: Device B discovers Device A and initiates connection ===
      const connectionPromise = ConnectionService.requestConnection(deviceAId);

      // Give it a moment to send the request
      await new Promise(resolve => setTimeout(resolve, 100));

      // === STEP 2: Device A receives connection request ===
      // Simulate Device A (responder) processing the request
      const deviceAConnectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: deviceBProfile,
        timestamp: new Date().toISOString(),
      };

      // Temporarily switch to Device A's identity
      (IdentityService.getCurrentIdentity as jest.Mock).mockReturnValue(deviceAIdentity);
      (IdentityService.getCurrentUser as jest.Mock).mockResolvedValue(deviceAUser);
      (Database.getAutoAcceptConnections as jest.Mock) = jest.fn().mockResolvedValue(true);

      const deviceAResponse = await ConnectionService.handleConnectionRequest(deviceAConnectionRequest);

      // Verify Device A created mutual connection
      expect(deviceAResponse).not.toBeNull();
      expect(deviceAResponse?.status).toBe('accepted');

      const deviceAConnections = await Database.getConnections();
      expect(deviceAConnections).toHaveLength(1);
      expect(deviceAConnections[0].userId).toBe(deviceBUserId);
      expect(deviceAConnections[0].status).toBe('mutual');

      // === STEP 3: Device A sends response back to Device B ===
      // This happens automatically via BLE notification
      expect(Bluetooth.sendConnectionResponse).toHaveBeenCalledWith(deviceAResponse);

      // === STEP 4: Device B receives response ===
      // Switch back to Device B's identity
      (IdentityService.getCurrentIdentity as jest.Mock).mockReturnValue(deviceBIdentity);
      (IdentityService.getCurrentUser as jest.Mock).mockResolvedValue(deviceBUser);

      // Simulate Device B receiving the response notification
      if (deviceAResponse) {
        await ConnectionService.handleConnectionResponse(deviceAResponse);
      }

      // Wait for Device B's connection request to complete
      const deviceBResult = await connectionPromise;

      // === STEP 5: Verify both devices have mutual connection ===
      expect(deviceBResult).not.toBeNull();
      expect(deviceBResult?.connection.status).toBe('mutual');
      expect(deviceBResult?.connection.userId).toBe(deviceAUserId);
      expect(deviceBResult?.connection.displayName).toBe(deviceADisplayName);

      const deviceBConnections = await Database.getConnections();
      expect(deviceBConnections).toHaveLength(2); // Both A's and B's connections in same DB
      
      // Filter to just Device B's connections (in reality, these would be separate databases)
      const deviceBConnection = deviceBConnections.find(c => c.userId === deviceAUserId);
      expect(deviceBConnection).toBeDefined();
      expect(deviceBConnection?.status).toBe('mutual');

      BLEConnectionHandler.stop();
    });
  });

  describe('Manual Approval Connection Flow', () => {
    it('should create pending-received connection with manual approval', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      // Setup Device A as responder with manual approval
      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceAIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceAUser);
      (Database.getAutoAcceptConnections as jest.Mock) = jest.fn().mockResolvedValue(false);

      BLEConnectionHandler.start();

      // Device A receives connection request
      const connectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: deviceBProfile,
        timestamp: new Date().toISOString(),
      };

      const response = await ConnectionService.handleConnectionRequest(connectionRequest);

      // Verify pending status
      expect(response).not.toBeNull();
      expect(response?.status).toBe('pending');

      const connections = await Database.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].status).toBe('pending-received');
      expect(connections[0].userId).toBe(deviceBUserId);

      // Verify pending requests
      const pendingRequests = await ConnectionService.getPendingRequests();
      expect(pendingRequests).toHaveLength(1);
      expect(pendingRequests[0].userId).toBe(deviceBUserId);

      BLEConnectionHandler.stop();
    });

    it('should upgrade to mutual when manually accepted', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      // Setup Device A
      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceAIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceAUser);
      (Database.getAutoAcceptConnections as jest.Mock) = jest.fn().mockResolvedValue(false);

      BLEConnectionHandler.start();

      // Create pending-received connection
      const connectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: deviceBProfile,
        timestamp: new Date().toISOString(),
      };

      await ConnectionService.handleConnectionRequest(connectionRequest);

      const connections = await Database.getConnections();
      const connectionId = connections[0].id;

      // Manually accept the connection
      const accepted = await ConnectionService.acceptConnectionRequest(connectionId);
      expect(accepted).toBe(true);

      // Verify upgraded to mutual
      const updatedConnections = await Database.getConnections();
      expect(updatedConnections[0].status).toBe('mutual');

      BLEConnectionHandler.stop();
    });
  });

  describe('Duplicate Connection Handling', () => {
    it('should not create duplicate connections', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      // Setup Device B
      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceBIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceBUser);

      (Bluetooth.connect as jest.Mock).mockResolvedValue({id: deviceAId});
      (Bluetooth.readProfile as jest.Mock).mockResolvedValue(deviceAProfile);
      (Bluetooth.writeFollowRequest as jest.Mock).mockResolvedValue(true);

      // First connection attempt
      await ConnectionService.requestConnection(deviceAId);

      const firstConnections = await Database.getConnections();
      expect(firstConnections).toHaveLength(1);

      // Second connection attempt (should return existing)
      await ConnectionService.requestConnection(deviceAId);

      const secondConnections = await Database.getConnections();
      expect(secondConnections).toHaveLength(1); // Still only one connection
      expect(secondConnections[0].id).toBe(firstConnections[0].id);
    });

    it('should upgrade pending-sent to mutual when other party accepts', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      // Setup Device B
      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceBIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceBUser);

      (Bluetooth.connect as jest.Mock).mockResolvedValue({id: deviceAId});
      (Bluetooth.readProfile as jest.Mock).mockResolvedValue(deviceAProfile);
      (Bluetooth.writeFollowRequest as jest.Mock).mockResolvedValue(true);

      // Create pending-sent connection (no response received)
      await ConnectionService.requestConnection(deviceAId);

      const connections = await Database.getConnections();
      expect(connections[0].status).toBe('pending-sent');

      // Receive acceptance response
      const acceptanceResponse: ConnectionResponse = {
        type: 'connection-response',
        status: 'accepted',
        responder: deviceAProfile,
        timestamp: new Date().toISOString(),
      };

      await ConnectionService.handleConnectionResponse(acceptanceResponse);

      const updatedConnections = await Database.getConnections();
      expect(updatedConnections[0].status).toBe('mutual');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection failure gracefully', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceBIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceBUser);

      // Simulate connection failure
      (Bluetooth.connect as jest.Mock).mockResolvedValue(null);

      const result = await ConnectionService.requestConnection(deviceAId);

      expect(result).toBeNull();

      // Verify no connection was created
      const connections = await Database.getConnections();
      expect(connections).toHaveLength(0);
    });

    it('should handle profile read failure gracefully', async () => {
      const {Bluetooth} = require('@localcommunity/rn-bluetooth');

      (IdentityService.getCurrentIdentity as jest.Mock) = jest.fn().mockReturnValue(deviceBIdentity);
      (IdentityService.getCurrentUser as jest.Mock) = jest.fn().mockResolvedValue(deviceBUser);

      (Bluetooth.connect as jest.Mock).mockResolvedValue({id: deviceAId});
      (Bluetooth.readProfile as jest.Mock).mockResolvedValue(null);

      const result = await ConnectionService.requestConnection(deviceAId);

      expect(result).toBeNull();

      // Verify no connection was created
      const connections = await Database.getConnections();
      expect(connections).toHaveLength(0);
    });
  });
});

