/**
 * BLEConnectionHandler - Wires BLE events to ConnectionService
 *
 * Listens for incoming connection requests via BLE and automatically
 * processes them through the ConnectionService mutual connection flow.
 */

import {addBluetoothListener, Bluetooth} from '@localcommunity/rn-bluetooth';
import type {BluetoothEvent, FollowRequestPayload} from '@localcommunity/rn-bluetooth';
import ConnectionService from '../ConnectionService';
import {ConnectionRequest, ConnectionResponse} from '../../types/bluetooth';
import {log, logError} from '../../utils/logger';

class BLEConnectionHandler {
  private unsubscribe: (() => void) | null = null;

  /**
   * Start listening for BLE connection events
   */
  start(): void {
    if (this.unsubscribe) {
      log('[BLEConnectionHandler] Already listening');
      return;
    }

    log('[BLEConnectionHandler] Starting connection event listener');
    this.unsubscribe = addBluetoothListener(this.handleBluetoothEvent.bind(this));
  }

  /**
   * Stop listening for BLE connection events
   */
  stop(): void {
    if (this.unsubscribe) {
      log('[BLEConnectionHandler] Stopping connection event listener');
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Handle incoming Bluetooth events
   */
  private async handleBluetoothEvent(event: BluetoothEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'followRequestReceived':
          await this.handleFollowRequest(event.fromDeviceId, event.payload);
          break;

        case 'connectionResponseReceived':
          await this.handleConnectionResponse(event.fromDeviceId, event.payload);
          break;

        case 'error':
          await logError('[BLEConnectionHandler] BLE error:', event.message);
          break;

        // Other events are handled by BLEManager
        default:
          break;
      }
    } catch (error) {
      await logError('[BLEConnectionHandler] Error handling event:', error);
    }
  }

  /**
   * Handle incoming follow/connection request
   * Converts old follow-request format to new connection-request format
   */
  private async handleFollowRequest(
    deviceId: string,
    payload: FollowRequestPayload,
  ): Promise<void> {
    try {
      await log('[BLEConnectionHandler] Received connection request from:', deviceId);

      // Convert follow-request to connection-request format
      const connectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: payload.follower,
        timestamp: payload.timestamp,
      };

      // Process the connection request
      const response = await ConnectionService.handleConnectionRequest(connectionRequest);

      if (response) {
        await log('[BLEConnectionHandler] Connection request processed, response status:', response.status);

        // Send response back to requester via BLE
        try {
          await log('[BLEConnectionHandler] Attempting to connect back to requester:', deviceId);

          // Connect to the requester (they should still be connected and listening)
          const requesterDevice = await Bluetooth.connect(deviceId, 5000);
          await log('[BLEConnectionHandler] Connected successfully to requester');

          // Write response to their handshake characteristic
          const responseJson = JSON.stringify(response);
          await log('[BLEConnectionHandler] Sending response JSON:', responseJson);
          await Bluetooth.writeFollowRequest(deviceId, responseJson);

          await log('[BLEConnectionHandler] Response sent successfully:', response.status);

          // Disconnect
          await Bluetooth.disconnect(deviceId);
          await log('[BLEConnectionHandler] Disconnected from requester');
        } catch (error) {
          await logError('[BLEConnectionHandler] Failed to send response back - requester may have disconnected:', error);
          await logError('[BLEConnectionHandler] This is expected if requester disconnected before response was ready');
          // Not critical - the connection is stored locally
          // The requester will need to check back later or we can implement a polling mechanism
        }
      }
    } catch (error) {
      await logError('[BLEConnectionHandler] Error handling follow request:', error);
    }
  }

  /**
   * Handle incoming connection response
   */
  private async handleConnectionResponse(
    deviceId: string,
    payload: any,
  ): Promise<void> {
    try {
      await log('[BLEConnectionHandler] Received connection response from:', deviceId);

      const connectionResponse: ConnectionResponse = {
        type: 'connection-response',
        status: payload.status,
        responder: payload.responder,
        timestamp: payload.timestamp,
      };

      await ConnectionService.handleConnectionResponse(connectionResponse);
      await log('[BLEConnectionHandler] Connection response processed:', payload.status);
    } catch (error) {
      await logError('[BLEConnectionHandler] Error handling connection response:', error);
    }
  }
}

export default new BLEConnectionHandler();
