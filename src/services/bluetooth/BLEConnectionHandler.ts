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
  
  // Track recently processed requests to prevent duplicates
  // Key: userId + timestamp, Value: expiry time
  private processedRequests: Map<string, number> = new Map();
  private readonly REQUEST_DEDUP_WINDOW_MS = 5000; // 5 second dedup window

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
    
    // Clean up expired dedup entries every 10 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.processedRequests.entries()) {
        if (expiry < now) {
          this.processedRequests.delete(key);
        }
      }
    }, 10000);
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
          // Only log actual errors, not debug messages (which used to be sent as errors)
          if (event.code !== 'DEBUG') {
            await logError('[BLEConnectionHandler] BLE error:', event.message);
          }
          break;

        case 'debug':
          // Debug events are now properly categorized - ignore them here
          // They're already logged by BluetoothModule if in dev mode
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
   *
   * NOTE: Native Android sends ALL handshake notifications as 'followRequestReceived' events,
   * so we need to check the payload type and route responses to handleConnectionResponse
   */
  private async handleFollowRequest(
    deviceId: string,
    payload: any,
  ): Promise<void> {
    try {
      await log('[BLEConnectionHandler] Received handshake notification from:', deviceId);
      await log('[BLEConnectionHandler] Payload:', JSON.stringify(payload).substring(0, 200));

      // CRITICAL: Check if this is actually a connection-response (not a request)
      // Native code sends all notifications as 'followRequestReceived' regardless of type
      if (payload.type === 'connection-response' || payload.responder) {
        console.log('[BLEConnectionHandler] 🔀 Detected connection-response, routing to handleConnectionResponse');
        await this.handleConnectionResponse(deviceId, payload);
        return;
      }

      // Check if payload is already in connection-request format (has requester field)
      // or old follow-request format (has follower field)
      let connectionRequest: ConnectionRequest;

      if (payload.requester) {
        // Already in correct format
        connectionRequest = payload as ConnectionRequest;
      } else if (payload.follower) {
        // Old format - convert it
        connectionRequest = {
          type: 'connection-request',
          requester: payload.follower,
          timestamp: payload.timestamp,
        };
      } else {
        throw new Error('Invalid payload format: missing requester or follower field');
      }

      // DEDUPLICATION: Check if we've already processed this exact request recently
      const dedupKey = `${connectionRequest.requester.userId}:${connectionRequest.timestamp}`;
      const now = Date.now();
      
      if (this.processedRequests.has(dedupKey)) {
        const expiry = this.processedRequests.get(dedupKey)!;
        if (expiry > now) {
          console.log(`[BLEConnectionHandler] ⏭️ Ignoring duplicate request from ${connectionRequest.requester.displayName} (within ${this.REQUEST_DEDUP_WINDOW_MS}ms window)`);
          return; // Skip duplicate request
        }
      }
      
      // Mark this request as processed
      this.processedRequests.set(dedupKey, now + this.REQUEST_DEDUP_WINDOW_MS);
      console.log(`[BLEConnectionHandler] ✅ Processing new request from ${connectionRequest.requester.displayName}`);

      // Process the connection request
      const response = await ConnectionService.handleConnectionRequest(connectionRequest);

      if (response) {
        await log('[BLEConnectionHandler] Connection request processed, response status:', response.status);

        // Send response back to requester via BLE notification
        // The requester is subscribed to handshake characteristic notifications
        try {
          await log('[BLEConnectionHandler] Sending response via BLE notification:', response.status);
          await Bluetooth.sendConnectionResponse(deviceId, response);
          await log('[BLEConnectionHandler] ✅ Response notification sent successfully');
        } catch (error) {
          await logError('[BLEConnectionHandler] ❌ Failed to send response notification:', error);
          // Not critical - the connection is stored locally
          // The requester will see status as pending-sent and can retry
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
      console.log('[BLEConnectionHandler] 📲 Received connection response from device:', deviceId);
      console.log('[BLEConnectionHandler] Payload:', JSON.stringify(payload, null, 2));

      const connectionResponse: ConnectionResponse = {
        type: 'connection-response',
        status: payload.status,
        responder: payload.responder,
        timestamp: payload.timestamp,
      };

      // DEDUPLICATION: Check if we've already processed this exact response recently
      const dedupKey = `${connectionResponse.responder.userId}:${connectionResponse.timestamp}`;
      const now = Date.now();
      
      if (this.processedRequests.has(dedupKey)) {
        const expiry = this.processedRequests.get(dedupKey)!;
        if (expiry > now) {
          console.log(`[BLEConnectionHandler] ⏭️ Ignoring duplicate response from ${connectionResponse.responder.displayName} (within ${this.REQUEST_DEDUP_WINDOW_MS}ms window)`);
          return; // Skip duplicate response
        }
      }
      
      // Mark this response as processed
      this.processedRequests.set(dedupKey, now + this.REQUEST_DEDUP_WINDOW_MS);
      console.log(`[BLEConnectionHandler] ✅ Processing new response from ${connectionResponse.responder.displayName}`);

      console.log('[BLEConnectionHandler] Calling ConnectionService.handleConnectionResponse...');
      await ConnectionService.handleConnectionResponse(connectionResponse);
      console.log('[BLEConnectionHandler] ✅ Connection response processed:', payload.status);
      await log('[BLEConnectionHandler] Connection response processed:', payload.status);
    } catch (error) {
      console.error('[BLEConnectionHandler] ❌ Error handling connection response:', error);
      await logError('[BLEConnectionHandler] Error handling connection response:', error);
    }
  }
}

export default new BLEConnectionHandler();
