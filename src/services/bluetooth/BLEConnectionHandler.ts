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

class BLEConnectionHandler {
  private unsubscribe: (() => void) | null = null;

  /**
   * Start listening for BLE connection events
   */
  start(): void {
    if (this.unsubscribe) {
      console.log('[BLEConnectionHandler] Already listening');
      return;
    }

    console.log('[BLEConnectionHandler] Starting connection event listener');
    this.unsubscribe = addBluetoothListener(this.handleBluetoothEvent.bind(this));
  }

  /**
   * Stop listening for BLE connection events
   */
  stop(): void {
    if (this.unsubscribe) {
      console.log('[BLEConnectionHandler] Stopping connection event listener');
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

        case 'error':
          console.error('[BLEConnectionHandler] BLE error:', event.message);
          break;

        // Other events are handled by BLEManager
        default:
          break;
      }
    } catch (error) {
      console.error('[BLEConnectionHandler] Error handling event:', error);
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
      console.log('[BLEConnectionHandler] Received connection request from:', deviceId);

      // Convert follow-request to connection-request format
      const connectionRequest: ConnectionRequest = {
        type: 'connection-request',
        requester: payload.follower,
        timestamp: payload.timestamp,
      };

      // Process the connection request
      const response = await ConnectionService.handleConnectionRequest(connectionRequest);

      if (response && response.status === 'accepted') {
        // Send acceptance response back via BLE
        // For now, the connection is auto-accepted on the responder's side
        // The requester will see the connection as pending-sent until mutual confirmation
        console.log('[BLEConnectionHandler] Connection request processed:', response.status);

        // TODO: Implement sending response back via BLE
        // This requires the responder to write back to the requester's handshake characteristic
        // For MVP, we'll rely on both parties storing the connection locally
      }
    } catch (error) {
      console.error('[BLEConnectionHandler] Error handling follow request:', error);
    }
  }
}

export default new BLEConnectionHandler();
