/**
 * ConnectionService unit tests
 */

import ConnectionService from '../../src/services/ConnectionService';
import BLEManager from '../../src/services/bluetooth/BLEManager';
import Database from '../../src/services/storage/Database';
import IdentityService from '../../src/services/IdentityService';
import {ConnectionRequest, ConnectionResponse, ConnectionProfile} from '../../src/types/bluetooth';
import {Connection} from '../../src/types/models';

// Mock dependencies
jest.mock('../../src/services/bluetooth/BLEManager');
jest.mock('../../src/services/storage/Database');
jest.mock('../../src/services/IdentityService');
jest.mock('../../src/utils/logger');

describe('ConnectionService', () => {
  const mockDeviceId = 'test-device-123';
  const mockUserId = 'user-abc-456';
  const mockDisplayName = 'Test User';
  const mockPublicKey = 'mock-public-key-base64';

  const mockCurrentUser = {
    id: 'current-user-123',
    displayName: 'Current User',
    profilePhoto: undefined,
  };

  const mockCurrentIdentity = {
    publicKey: Buffer.from('current-user-public-key'),
    privateKey: Buffer.from('current-user-private-key'),
  };

  const mockProfile: ConnectionProfile = {
    userId: mockUserId,
    displayName: mockDisplayName,
    publicKey: mockPublicKey,
    profilePhoto: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    (IdentityService.getCurrentUser as jest.Mock).mockResolvedValue(mockCurrentUser);
    (IdentityService.getCurrentIdentity as jest.Mock).mockReturnValue(mockCurrentIdentity);
    (Database.getAutoAcceptConnections as jest.Mock).mockResolvedValue(true);
  });

  describe('requestConnection', () => {
    it('should connect, read profile, send request, and create mutual connection on auto-accept', async () => {
      // Mock successful connection and profile read
      (BLEManager.connectToDevice as jest.Mock).mockResolvedValue({id: mockDeviceId});
      (BLEManager.readProfile as jest.Mock).mockResolvedValue(mockProfile);
      (BLEManager.writeHandshake as jest.Mock).mockResolvedValue(true);
      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(null);
      (Database.saveConnection as jest.Mock).mockResolvedValue(undefined);
      (BLEManager.disconnectFromDevice as jest.Mock).mockResolvedValue(undefined);

      // Mock immediate auto-accept response
      const mockResponse: ConnectionResponse = {
        type: 'connection-response',
        status: 'accepted',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      // Simulate response received during wait period
      setTimeout(() => {
        ConnectionService.handleConnectionResponse(mockResponse);
      }, 100);

      const result = await ConnectionService.requestConnection(mockDeviceId);

      expect(result).not.toBeNull();
      expect(result?.connection.status).toBe('mutual');
      expect(result?.connection.userId).toBe(mockUserId);
      expect(result?.connection.displayName).toBe(mockDisplayName);
      expect(result?.connection.trustLevel).toBe('verified');
      
      expect(BLEManager.connectToDevice).toHaveBeenCalledWith(mockDeviceId);
      expect(BLEManager.readProfile).toHaveBeenCalled();
      expect(BLEManager.writeHandshake).toHaveBeenCalled();
      expect(Database.saveConnection).toHaveBeenCalled();
    });

    it('should create pending-sent connection when no response received', async () => {
      (BLEManager.connectToDevice as jest.Mock).mockResolvedValue({id: mockDeviceId});
      (BLEManager.readProfile as jest.Mock).mockResolvedValue(mockProfile);
      (BLEManager.writeHandshake as jest.Mock).mockResolvedValue(true);
      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(null);
      (Database.saveConnection as jest.Mock).mockResolvedValue(undefined);

      const result = await ConnectionService.requestConnection(mockDeviceId);

      expect(result).not.toBeNull();
      expect(result?.connection.status).toBe('pending-sent');
      expect(result?.connection.trustLevel).toBe('pending');
    }, 10000); // 10 second timeout to account for 8 second wait

    it('should return null when connection fails', async () => {
      (BLEManager.connectToDevice as jest.Mock).mockResolvedValue(null);

      const result = await ConnectionService.requestConnection(mockDeviceId);

      expect(result).toBeNull();
    });

    it('should return null when profile read fails', async () => {
      (BLEManager.connectToDevice as jest.Mock).mockResolvedValue({id: mockDeviceId});
      (BLEManager.readProfile as jest.Mock).mockResolvedValue(null);

      const result = await ConnectionService.requestConnection(mockDeviceId);

      expect(result).toBeNull();
    });

    it('should return existing connection if already connected', async () => {
      const existingConnection: Connection = {
        id: 'existing-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      };

      (BLEManager.connectToDevice as jest.Mock).mockResolvedValue({id: mockDeviceId});
      (BLEManager.readProfile as jest.Mock).mockResolvedValue(mockProfile);
      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(existingConnection);

      const result = await ConnectionService.requestConnection(mockDeviceId);

      expect(result).not.toBeNull();
      expect(result?.connection).toEqual(existingConnection);
      expect(BLEManager.writeHandshake).not.toHaveBeenCalled();
    });

    it('should upgrade pending-sent to mutual if connection exists', async () => {
      const pendingConnection: Connection = {
        id: 'pending-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'pending-sent',
        trustLevel: 'pending',
      };

      (BLEManager.connectToDevice as jest.Mock).mockResolvedValue({id: mockDeviceId});
      (BLEManager.readProfile as jest.Mock).mockResolvedValue(mockProfile);
      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(pendingConnection);
      (Database.updateConnectionStatus as jest.Mock).mockResolvedValue(undefined);

      const result = await ConnectionService.requestConnection(mockDeviceId);

      expect(result).not.toBeNull();
      expect(Database.updateConnectionStatus).toHaveBeenCalledWith('pending-123', 'mutual');
    });
  });

  describe('handleConnectionRequest', () => {
    it('should create mutual connection with auto-accept enabled', async () => {
      const request: ConnectionRequest = {
        type: 'connection-request',
        requester: mockProfile,
        timestamp: new Date().toISOString(),
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(null);
      (Database.getAutoAcceptConnections as jest.Mock).mockResolvedValue(true);
      (Database.saveConnection as jest.Mock).mockResolvedValue(undefined);

      const response = await ConnectionService.handleConnectionRequest(request);

      expect(response).not.toBeNull();
      expect(response?.status).toBe('accepted');
      expect(Database.saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'mutual',
          userId: mockUserId,
          displayName: mockDisplayName,
        })
      );
    });

    it('should create pending-received connection with manual approval', async () => {
      const request: ConnectionRequest = {
        type: 'connection-request',
        requester: mockProfile,
        timestamp: new Date().toISOString(),
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(null);
      (Database.getAutoAcceptConnections as jest.Mock).mockResolvedValue(false);
      (Database.saveConnection as jest.Mock).mockResolvedValue(undefined);

      const response = await ConnectionService.handleConnectionRequest(request);

      expect(response).not.toBeNull();
      expect(response?.status).toBe('pending');
      expect(Database.saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending-received',
          userId: mockUserId,
        })
      );
    });

    it('should upgrade existing pending-sent to mutual', async () => {
      const request: ConnectionRequest = {
        type: 'connection-request',
        requester: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const existingConnection: Connection = {
        id: 'existing-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'pending-sent',
        trustLevel: 'pending',
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(existingConnection);
      (Database.updateConnectionStatus as jest.Mock).mockResolvedValue(undefined);

      const response = await ConnectionService.handleConnectionRequest(request);

      expect(response).not.toBeNull();
      expect(response?.status).toBe('accepted');
      expect(Database.updateConnectionStatus).toHaveBeenCalledWith('existing-123', 'mutual');
    });

    it('should return acceptance for existing mutual connection', async () => {
      const request: ConnectionRequest = {
        type: 'connection-request',
        requester: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const existingConnection: Connection = {
        id: 'existing-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'mutual',
        trustLevel: 'verified',
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(existingConnection);

      const response = await ConnectionService.handleConnectionRequest(request);

      expect(response).not.toBeNull();
      expect(response?.status).toBe('accepted');
      expect(Database.updateConnectionStatus).not.toHaveBeenCalled();
      expect(Database.saveConnection).not.toHaveBeenCalled();
    });
  });

  describe('handleConnectionResponse', () => {
    it('should upgrade pending-sent to mutual on accepted response', async () => {
      const response: ConnectionResponse = {
        type: 'connection-response',
        status: 'accepted',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const pendingConnection: Connection = {
        id: 'pending-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'pending-sent',
        trustLevel: 'pending',
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(pendingConnection);
      (Database.updateConnectionStatus as jest.Mock).mockResolvedValue(undefined);

      await ConnectionService.handleConnectionResponse(response);

      expect(Database.updateConnectionStatus).toHaveBeenCalledWith('pending-123', 'mutual');
    });

    it('should delete connection on rejected response', async () => {
      const response: ConnectionResponse = {
        type: 'connection-response',
        status: 'rejected',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const pendingConnection: Connection = {
        id: 'pending-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'pending-sent',
        trustLevel: 'pending',
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(pendingConnection);
      (Database.deleteConnection as jest.Mock).mockResolvedValue(undefined);

      await ConnectionService.handleConnectionResponse(response);

      expect(Database.deleteConnection).toHaveBeenCalledWith('pending-123');
    });

    it('should leave connection unchanged on pending response', async () => {
      const response: ConnectionResponse = {
        type: 'connection-response',
        status: 'pending',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const pendingConnection: Connection = {
        id: 'pending-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'pending-sent',
        trustLevel: 'pending',
      };

      (Database.getConnectionByUserId as jest.Mock).mockResolvedValue(pendingConnection);

      await ConnectionService.handleConnectionResponse(response);

      expect(Database.updateConnectionStatus).not.toHaveBeenCalled();
      expect(Database.deleteConnection).not.toHaveBeenCalled();
    });
  });

  describe('acceptConnectionRequest', () => {
    it('should upgrade pending-received to mutual', async () => {
      const pendingConnection: Connection = {
        id: 'pending-123',
        userId: mockUserId,
        displayName: mockDisplayName,
        profilePhoto: undefined,
        sharedSecret: undefined,
        connectedAt: new Date(),
        status: 'pending-received',
        trustLevel: 'pending',
      };

      (Database.getConnection as jest.Mock).mockResolvedValue(pendingConnection);
      (Database.updateConnectionStatus as jest.Mock).mockResolvedValue(undefined);

      const result = await ConnectionService.acceptConnectionRequest('pending-123');

      expect(result).toBe(true);
      expect(Database.updateConnectionStatus).toHaveBeenCalledWith('pending-123', 'mutual');
    });

    it('should return false if connection not found', async () => {
      (Database.getConnection as jest.Mock).mockResolvedValue(null);

      const result = await ConnectionService.acceptConnectionRequest('nonexistent');

      expect(result).toBe(false);
      expect(Database.updateConnectionStatus).not.toHaveBeenCalled();
    });
  });

  describe('rejectConnectionRequest', () => {
    it('should delete the connection', async () => {
      (Database.deleteConnection as jest.Mock).mockResolvedValue(undefined);

      const result = await ConnectionService.rejectConnectionRequest('test-123');

      expect(result).toBe(true);
      expect(Database.deleteConnection).toHaveBeenCalledWith('test-123');
    });

    it('should return false on error', async () => {
      (Database.deleteConnection as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await ConnectionService.rejectConnectionRequest('test-123');

      expect(result).toBe(false);
    });
  });

  describe('getConnections', () => {
    it('should return all connections from database', async () => {
      const mockConnections: Connection[] = [
        {
          id: 'conn-1',
          userId: 'user-1',
          displayName: 'User 1',
          profilePhoto: undefined,
          sharedSecret: undefined,
          connectedAt: new Date(),
          status: 'mutual',
          trustLevel: 'verified',
        },
        {
          id: 'conn-2',
          userId: 'user-2',
          displayName: 'User 2',
          profilePhoto: undefined,
          sharedSecret: undefined,
          connectedAt: new Date(),
          status: 'pending-received',
          trustLevel: 'pending',
        },
      ];

      (Database.getConnections as jest.Mock).mockResolvedValue(mockConnections);

      const result = await ConnectionService.getConnections();

      expect(result).toEqual(mockConnections);
      expect(result).toHaveLength(2);
    });

    it('should return empty array on error', async () => {
      (Database.getConnections as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await ConnectionService.getConnections();

      expect(result).toEqual([]);
    });
  });

  describe('getPendingRequests', () => {
    it('should return pending-received connections', async () => {
      const mockPendingConnections: Connection[] = [
        {
          id: 'pending-1',
          userId: 'user-1',
          displayName: 'User 1',
          profilePhoto: undefined,
          sharedSecret: undefined,
          connectedAt: new Date(),
          status: 'pending-received',
          trustLevel: 'pending',
        },
      ];

      (Database.getPendingReceivedConnections as jest.Mock).mockResolvedValue(mockPendingConnections);

      const result = await ConnectionService.getPendingRequests();

      expect(result).toEqual(mockPendingConnections);
    });
  });

  describe('deleteConnection', () => {
    it('should delete connection from database', async () => {
      (Database.deleteConnection as jest.Mock).mockResolvedValue(undefined);

      const result = await ConnectionService.deleteConnection('test-123');

      expect(result).toBe(true);
      expect(Database.deleteConnection).toHaveBeenCalledWith('test-123');
    });
  });
});

