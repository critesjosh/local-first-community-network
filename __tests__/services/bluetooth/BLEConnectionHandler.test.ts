/**
 * BLEConnectionHandler unit tests
 */

import BLEConnectionHandler from '../../../src/services/bluetooth/BLEConnectionHandler';
import ConnectionService from '../../../src/services/ConnectionService';
import {Bluetooth} from '@localcommunity/rn-bluetooth';
import type {BluetoothEvent, FollowRequestPayload} from '@localcommunity/rn-bluetooth';
import {ConnectionRequest, ConnectionResponse, ConnectionProfile} from '../../../src/types/bluetooth';

// Mock dependencies
jest.mock('../../../src/services/ConnectionService');
jest.mock('@localcommunity/rn-bluetooth', () => ({
  Bluetooth: {
    sendConnectionResponse: jest.fn(),
  },
  addBluetoothListener: jest.fn(),
}));
jest.mock('../../../src/utils/logger');

describe('BLEConnectionHandler', () => {
  const mockDeviceId = 'test-device-123';
  const mockProfile: ConnectionProfile = {
    userId: 'user-abc-456',
    displayName: 'Test User',
    publicKey: 'mock-public-key',
    profilePhoto: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleFollowRequest', () => {
    it('should process connection request and send response', async () => {
      const followPayload: FollowRequestPayload = {
        type: 'follow-request',
        follower: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const mockResponse: ConnectionResponse = {
        type: 'connection-response',
        status: 'accepted',
        responder: {
          userId: 'current-user',
          displayName: 'Current User',
          publicKey: 'current-key',
          profilePhoto: undefined,
        },
        timestamp: new Date().toISOString(),
      };

      (ConnectionService.handleConnectionRequest as jest.Mock).mockResolvedValue(mockResponse);
      (Bluetooth.sendConnectionResponse as jest.Mock).mockResolvedValue(undefined);

      // Start handler to set up listener
      BLEConnectionHandler.start();

      // Simulate receiving follow request event
      const event: BluetoothEvent = {
        type: 'followRequestReceived',
        fromDeviceId: mockDeviceId,
        payload: followPayload,
      };

      // Manually call the private handler method via the event listener
      // This simulates what would happen when the event is received
      await (BLEConnectionHandler as any).handleBluetoothEvent(event);

      expect(ConnectionService.handleConnectionRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connection-request',
          requester: mockProfile,
        })
      );
      expect(Bluetooth.sendConnectionResponse).toHaveBeenCalledWith(mockResponse);

      BLEConnectionHandler.stop();
    });

    it('should handle error when sending response fails', async () => {
      const followPayload: FollowRequestPayload = {
        type: 'follow-request',
        follower: mockProfile,
        timestamp: new Date().toISOString(),
      };

      const mockResponse: ConnectionResponse = {
        type: 'connection-response',
        status: 'accepted',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      (ConnectionService.handleConnectionRequest as jest.Mock).mockResolvedValue(mockResponse);
      (Bluetooth.sendConnectionResponse as jest.Mock).mockRejectedValue(new Error('Send failed'));

      BLEConnectionHandler.start();

      const event: BluetoothEvent = {
        type: 'followRequestReceived',
        fromDeviceId: mockDeviceId,
        payload: followPayload,
      };

      // Should not throw, error should be caught and logged
      await expect((BLEConnectionHandler as any).handleBluetoothEvent(event)).resolves.not.toThrow();

      BLEConnectionHandler.stop();
    });

    it('should handle null response from ConnectionService', async () => {
      const followPayload: FollowRequestPayload = {
        type: 'follow-request',
        follower: mockProfile,
        timestamp: new Date().toISOString(),
      };

      (ConnectionService.handleConnectionRequest as jest.Mock).mockResolvedValue(null);

      BLEConnectionHandler.start();

      const event: BluetoothEvent = {
        type: 'followRequestReceived',
        fromDeviceId: mockDeviceId,
        payload: followPayload,
      };

      await (BLEConnectionHandler as any).handleBluetoothEvent(event);

      expect(ConnectionService.handleConnectionRequest).toHaveBeenCalled();
      expect(Bluetooth.sendConnectionResponse).not.toHaveBeenCalled();

      BLEConnectionHandler.stop();
    });
  });

  describe('handleConnectionResponse', () => {
    it('should process connection response', async () => {
      const responsePayload = {
        status: 'accepted',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      (ConnectionService.handleConnectionResponse as jest.Mock).mockResolvedValue(undefined);

      BLEConnectionHandler.start();

      const event: BluetoothEvent = {
        type: 'connectionResponseReceived',
        fromDeviceId: mockDeviceId,
        payload: responsePayload,
      };

      await (BLEConnectionHandler as any).handleBluetoothEvent(event);

      expect(ConnectionService.handleConnectionResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connection-response',
          status: 'accepted',
          responder: mockProfile,
        })
      );

      BLEConnectionHandler.stop();
    });

    it('should handle errors in connection response processing', async () => {
      const responsePayload = {
        status: 'accepted',
        responder: mockProfile,
        timestamp: new Date().toISOString(),
      };

      (ConnectionService.handleConnectionResponse as jest.Mock).mockRejectedValue(
        new Error('Processing failed')
      );

      BLEConnectionHandler.start();

      const event: BluetoothEvent = {
        type: 'connectionResponseReceived',
        fromDeviceId: mockDeviceId,
        payload: responsePayload,
      };

      // Should not throw, error should be caught and logged
      await expect((BLEConnectionHandler as any).handleBluetoothEvent(event)).resolves.not.toThrow();

      BLEConnectionHandler.stop();
    });
  });

  describe('start and stop', () => {
    it('should not start if already started', () => {
      BLEConnectionHandler.start();
      BLEConnectionHandler.start(); // Second start should be no-op

      BLEConnectionHandler.stop();
    });

    it('should handle stop when not started', () => {
      // Should not throw
      expect(() => BLEConnectionHandler.stop()).not.toThrow();
    });
  });

  describe('error events', () => {
    it('should log error events without throwing', async () => {
      BLEConnectionHandler.start();

      const event: BluetoothEvent = {
        type: 'error',
        message: 'Test error',
        code: 'TEST_ERROR',
      };

      await expect((BLEConnectionHandler as any).handleBluetoothEvent(event)).resolves.not.toThrow();

      BLEConnectionHandler.stop();
    });
  });

  describe('other events', () => {
    it('should ignore non-connection events', async () => {
      BLEConnectionHandler.start();

      const event: BluetoothEvent = {
        type: 'deviceDiscovered',
        deviceId: mockDeviceId,
        rssi: -50,
        payload: {
          displayName: 'Test',
          userHashHex: 'abc123',
          followTokenHex: 'def456',
          fingerprint: 'abc123',
        },
      };

      await expect((BLEConnectionHandler as any).handleBluetoothEvent(event)).resolves.not.toThrow();

      expect(ConnectionService.handleConnectionRequest).not.toHaveBeenCalled();
      expect(ConnectionService.handleConnectionResponse).not.toHaveBeenCalled();

      BLEConnectionHandler.stop();
    });
  });
});

