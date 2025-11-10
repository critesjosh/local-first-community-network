/**
 * PendingConnectionReconciler
 * 
 * Periodically checks for pending connections and attempts to reconcile them
 * by re-establishing contact with nearby devices.
 */

import BLEManager from './bluetooth/BLEManager';
import Database from './storage/Database';
import ConnectionService from './ConnectionService';

class PendingConnectionReconciler {
  private reconcileInterval: NodeJS.Timeout | null = null;
  private isReconciling = false;
  private readonly RECONCILE_INTERVAL_MS = 30000; // 30 seconds
  private pendingReconciliations: Set<string> = new Set(); // Track pending by userId

  /**
   * Start periodic reconciliation
   */
  start() {
    if (this.reconcileInterval) {
      console.log('[PendingConnectionReconciler] Already running');
      return;
    }

    console.log('[PendingConnectionReconciler] ✅ Starting periodic reconciliation (every 30s)');
    
    // Run immediately on start
    this.reconcilePendingConnections();
    
    // Then run periodically
    this.reconcileInterval = setInterval(() => {
      this.reconcilePendingConnections();
    }, this.RECONCILE_INTERVAL_MS);
  }

  /**
   * Trigger immediate reconciliation for a specific connection
   * Called when a connection state changes to pending
   */
  async triggerForConnection(userId: string, displayName: string) {
    console.log(`[PendingConnectionReconciler] 🎯 Triggered for ${displayName} (${userId})`);
    
    // Avoid duplicate concurrent reconciliations for same user
    if (this.pendingReconciliations.has(userId)) {
      console.log(`[PendingConnectionReconciler] ⏭️ Already reconciling ${displayName}, skipping`);
      return;
    }

    this.pendingReconciliations.add(userId);

    try {
      // Wait a brief moment for BLE to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the connection
      const allConnections = await Database.getConnections();
      const connection = allConnections.find(c => c.userId === userId);
      
      if (!connection) {
        console.log(`[PendingConnectionReconciler] ❌ Connection not found for ${displayName}`);
        return;
      }

      if (connection.status !== 'pending-sent' && connection.status !== 'pending-received') {
        console.log(`[PendingConnectionReconciler] ✅ Connection already resolved to ${connection.status}`);
        return;
      }

      // Find matching device
      const discoveredDevices = BLEManager.getDiscoveredDevices();
      const matchingDevice = discoveredDevices.find(
        device => device.name === connection.displayName
      );

      if (!matchingDevice) {
        console.log(`[PendingConnectionReconciler] ⚠️ Device not found nearby: ${displayName}`);
        return;
      }

      console.log(`[PendingConnectionReconciler] 🔄 Attempting immediate reconciliation for ${displayName}`);
      
      if (connection.status === 'pending-sent') {
        // Only retry connections WE initiated (pending-sent)
        // Don't auto-accept requests we received (pending-received)
        await this.retryPendingSentConnection(connection, matchingDevice);
      } else if (connection.status === 'pending-received') {
        console.log(`[PendingConnectionReconciler] ⏭️ Skipping pending-received - user must manually accept`);
      }
    } catch (error) {
      console.error(`[PendingConnectionReconciler] ❌ Error during triggered reconciliation:`, error);
    } finally {
      this.pendingReconciliations.delete(userId);
    }
  }

  /**
   * Stop periodic reconciliation
   */
  stop() {
    if (this.reconcileInterval) {
      console.log('[PendingConnectionReconciler] Stopping periodic reconciliation');
      clearInterval(this.reconcileInterval);
      this.reconcileInterval = null;
    }
  }

  /**
   * Check for pending connections and attempt to reconcile them
   */
  private async reconcilePendingConnections() {
    // Skip if already reconciling
    if (this.isReconciling) {
      console.log('[PendingConnectionReconciler] ⏭️ Skipping - already reconciling');
      return;
    }

    try {
      this.isReconciling = true;

      // Get all pending connections
      const allConnections = await Database.getConnections();
      const pendingConnections = allConnections.filter(
        c => c.status === 'pending-sent' || c.status === 'pending-received'
      );

      if (pendingConnections.length === 0) {
        console.log('[PendingConnectionReconciler] No pending connections to reconcile');
        return;
      }

      console.log(`[PendingConnectionReconciler] 🔍 Found ${pendingConnections.length} pending connection(s)`);

      // Get currently discovered devices
      const discoveredDevices = BLEManager.getDiscoveredDevices();
      
      console.log(`[PendingConnectionReconciler] 📡 Currently scanning ${discoveredDevices.length} nearby device(s)`);

      // Try to match pending connections with nearby devices
      for (const connection of pendingConnections) {
        // Find matching device by display name (best we can do without storing device IDs)
        const matchingDevice = discoveredDevices.find(
          device => device.name === connection.displayName
        );

        if (matchingDevice) {
          console.log(`[PendingConnectionReconciler] 🎯 Found nearby device for pending connection: ${connection.displayName}`);
          console.log(`[PendingConnectionReconciler]    Status: ${connection.status}`);
          console.log(`[PendingConnectionReconciler]    Connected at: ${connection.connectedAt}`);
          
          // Check if connection is old enough to retry (at least 10 seconds old)
          const connectionAge = Date.now() - new Date(connection.connectedAt).getTime();
          if (connectionAge < 10000) {
            console.log(`[PendingConnectionReconciler]    ⏭️ Too recent (${Math.floor(connectionAge / 1000)}s), skipping`);
            continue;
          }

          // Attempt to reconcile based on status
          if (connection.status === 'pending-sent') {
            console.log(`[PendingConnectionReconciler]    📤 We sent request - retrying connection to get response`);
            await this.retryPendingSentConnection(connection, matchingDevice);
          } else if (connection.status === 'pending-received') {
            console.log(`[PendingConnectionReconciler]    📥 We received request - skipping (user must accept manually)`);
          }
        }
      }

      console.log('[PendingConnectionReconciler] ✅ Reconciliation cycle complete');
    } catch (error) {
      console.error('[PendingConnectionReconciler] ❌ Error during reconciliation:', error);
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Retry a pending-sent connection (we initiated, waiting for acceptance)
   */
  private async retryPendingSentConnection(
    connection: any,
    device: any
  ) {
    try {
      console.log(`[PendingConnectionReconciler] 🔄 Retrying connection to ${connection.displayName}...`);
      
      // Re-initiate connection - this will detect bidirectional if they also sent us a request
      const result = await ConnectionService.requestConnection(device.deviceId);
      
      if (result && result.connection.status === 'mutual') {
        console.log(`[PendingConnectionReconciler] ✅ Connection upgraded to mutual!`);
      } else {
        console.log(`[PendingConnectionReconciler] ⏳ Still pending after retry`);
      }
    } catch (error) {
      console.error(`[PendingConnectionReconciler] ❌ Failed to retry connection:`, error);
    }
  }
}

export default new PendingConnectionReconciler();

