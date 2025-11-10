import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RootStackScreenProps} from '../types/navigation';
import BLEManager from '../services/bluetooth/BLEManager';
import ConnectionService from '../services/ConnectionService';
import BLEBroadcastService from '../services/bluetooth/BLEBroadcastService';
import Database from '../services/storage/Database';
import {DiscoveredDevice} from '../types/bluetooth';
import {Connection} from '../types/models';

type Props = RootStackScreenProps<'ConnectionScan'>;

type DeviceWithStatus = DiscoveredDevice & {
  connection?: Connection;
};

const ConnectionScanScreen = ({navigation}: Props) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Load connections and match with devices
  const loadConnections = async () => {
    const allConnections = await Database.getConnections();
    setConnections(allConnections);
  };

  useEffect(() => {
    // Initialize BLE
    const initBLE = async () => {
      const success = await BLEManager.init();
      if (!success) {
        Alert.alert(
          'Bluetooth Error',
          'Failed to initialize Bluetooth. Please check your permissions and try again.',
        );
        navigation.goBack();
      }
    };

    initBLE();
    loadConnections();

    // Reload connections periodically to catch status updates
    const connectionInterval = setInterval(loadConnections, 2000);

    // Add listeners
    const scanListener = async (device: DiscoveredDevice) => {
      // Load latest connections to match with device
      const allConnections = await Database.getConnections();
      setConnections(allConnections);
      
      setDevices((prev) => {
        const existing = prev.find((d) => d.id === device.id);
        if (existing) {
          // Update existing device
          return prev.map((d) => (d.id === device.id ? device : d));
        } else {
          // Add new device
          return [...prev, device];
        }
      });
    };

    const stateListener = (state: any) => {
      setIsScanning(state.isScanning);
      if (!state.isScanning) {
        // Scanning stopped
        setDevices(BLEManager.getDiscoveredDevices());
      }
    };

    BLEManager.addScanListener(scanListener);
    BLEManager.addStateListener(stateListener);

    return () => {
      BLEManager.removeScanListener(scanListener);
      BLEManager.removeStateListener(stateListener);
      BLEManager.stopPulsedScanning();
      BLEManager.stopScanning();
      clearInterval(connectionInterval);
    };
  }, [navigation]);

  const handleStartScanning = async () => {
    try {
      setDevices([]);
      // Use pulsed scanning for better iOS compatibility with simultaneous advertising
      await BLEManager.startPulsedScanning(30000); // 30 seconds
    } catch (error) {
      Alert.alert('Error', 'Failed to start scanning. Please try again.');
    }
  };

  const handleTestScanWithoutAdvertising = async () => {
    try {
      // Stop advertising first
      console.log('[TEST] Stopping BLE advertising before scanning...');
      await BLEBroadcastService.stop();
      console.log('[TEST] Advertising stopped, waiting 1 second...');

      // Wait a moment for advertising to fully stop
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start scanning
      console.log('[TEST] Starting scan WITHOUT advertising...');
      setDevices([]);
      await BLEManager.startScanning();
      console.log('[TEST] Scan started. Check if devices are now detected.');

      Alert.alert(
        'Test Mode',
        'Advertising stopped. Scanning without advertising. If devices appear now, it confirms advertise+scan conflict.',
        [{text: 'OK'}]
      );
    } catch (error) {
      console.error('[TEST] Error:', error);
      Alert.alert('Error', 'Test failed. Check console for details.');
    }
  };

  const handleStopScanning = () => {
    BLEManager.stopPulsedScanning();
    BLEManager.stopScanning();
  };

  const handleDevicePress = async (device: DiscoveredDevice) => {
    if (isProcessing) return;

    setSelectedDevice(device.id);
    setIsProcessing(true);

    try {
      // Stop scanning first
      BLEManager.stopScanning();

      const result = await ConnectionService.requestConnection(device.deviceId);

      if (!result) {
        throw new Error('Failed to request connection');
      }

      // Reload connections to show updated status
      await loadConnections();

      setIsProcessing(false);
      setSelectedDevice(null);

      // Restart scanning
      await BLEManager.startScanning();
    } catch (error) {
      console.error('Error requesting connection:', error);
      setIsProcessing(false);
      setSelectedDevice(null);
      // Restart scanning
      BLEManager.startScanning().catch(() => {
        // scanning retry failure handled silently
      });
    }
  };

  const getSignalStrength = (rssi: number) => {
    if (rssi > -60) return 'Excellent';
    if (rssi > -70) return 'Good';
    if (rssi > -80) return 'Fair';
    return 'Weak';
  };

  const getSignalColor = (rssi: number) => {
    if (rssi > -60) return '#34C759';
    if (rssi > -70) return '#32ADE6';
    if (rssi > -80) return '#FF9500';
    return '#FF3B30';
  };

  const getConnectionForDevice = (device: DiscoveredDevice): Connection | undefined => {
    // Try to match by display name (from broadcast payload)
    if (device.name) {
      return connections.find(c => c.displayName === device.name);
    }
    return undefined;
  };

  const renderAvatar = (device: DiscoveredDevice, connection?: Connection) => {
    // Use connection profile photo if available (base64 data URI)
    if (connection?.profilePhoto) {
      return (
        <Image
          source={{uri: connection.profilePhoto}}
          style={styles.deviceAvatar}
        />
      );
    }
    
    // Fallback to initial letter
    const initial = (device.name || 'U').charAt(0).toUpperCase();
    return (
      <View style={[styles.deviceAvatar, styles.deviceAvatarFallback]}>
        <Text style={styles.deviceAvatarText}>{initial}</Text>
      </View>
    );
  };

  const renderConnectionStatus = (connection?: Connection) => {
    if (!connection) {
      return (
        <View style={[styles.statusBadge, styles.statusBadgeConnect]}>
          <Text style={[styles.statusText, styles.statusConnect]}>Connect</Text>
        </View>
      );
    }

    switch (connection.status) {
      case 'mutual':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeMutual]}>
            <Text style={[styles.statusText, styles.statusMutual]}>✓ Connected</Text>
          </View>
        );
      case 'pending-sent':
        return (
          <View style={[styles.statusBadge, styles.statusBadgePending]}>
            <Text style={[styles.statusText, styles.statusPending]}>⏳ Pending</Text>
          </View>
        );
      case 'pending-received':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeReceived]}>
            <Text style={[styles.statusText, styles.statusReceived]}>👋 Tap to accept</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.statusBadge, styles.statusBadgeConnect]}>
            <Text style={[styles.statusText, styles.statusConnect]}>Connect</Text>
          </View>
        );
    }
  };

  const renderDevice = ({item}: {item: DiscoveredDevice}) => {
    const isSelected = selectedDevice === item.id;
    const signalStrength = getSignalStrength(item.rssi);
    const signalColor = getSignalColor(item.rssi);
    const connection = getConnectionForDevice(item);
    const canConnect = !connection || connection.status === 'pending-received';

    return (
      <TouchableOpacity
        style={[styles.deviceCard, isSelected && styles.deviceCardSelected]}
        onPress={() => canConnect ? handleDevicePress(item) : null}
        disabled={isProcessing || !canConnect}>
        {renderAvatar(item, connection)}
        <View style={styles.deviceMainInfo}>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{item.name || 'Broadcasting Member'}</Text>
            <View style={styles.deviceSignal}>
              <View style={[styles.signalDot, {backgroundColor: signalColor}]} />
              <Text style={[styles.signalText, {color: signalColor}]}>
                {signalStrength} • {item.rssi} dBm
              </Text>
            </View>
          </View>
          <View style={styles.deviceActions}>
            {renderConnectionStatus(connection)}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Nearby</Text>
        <View style={{width: 60}} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Find Nearby People</Text>
        <Text style={styles.subtitle}>
          {isScanning
            ? 'Scanning for nearby devices...'
            : 'Tap the button below to start scanning'}
        </Text>

        {!isScanning && !isProcessing && (
          <>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={handleStartScanning}>
              <Text style={styles.scanButtonText}>Start Scanning</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.scanButton, styles.testButton]}
              onPress={handleTestScanWithoutAdvertising}>
              <Text style={styles.scanButtonText}>🧪 Test: Stop Advertising & Scan</Text>
            </TouchableOpacity>
          </>
        )}

        {isScanning && (
          <TouchableOpacity
            style={[styles.scanButton, styles.stopButton]}
            onPress={handleStopScanning}>
            <ActivityIndicator color="white" style={styles.spinner} />
            <Text style={styles.scanButtonText}>Stop Scanning</Text>
          </TouchableOpacity>
        )}

        {isProcessing && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        )}

        {devices.length > 0 && (
          <View style={styles.devicesContainer}>
            <Text style={styles.devicesTitle}>
              Found {devices.length} {devices.length === 1 ? 'device' : 'devices'}
            </Text>
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              style={styles.devicesList}
              contentContainerStyle={styles.devicesListContent}
            />
          </View>
        )}

        {!isScanning && devices.length === 0 && !isProcessing && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No devices found yet. Make sure the other person has the app open and
              is nearby.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  cancelButton: {
    fontSize: 17,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  testButton: {
    backgroundColor: '#FF9500',
  },
  scanButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  spinner: {
    marginRight: 12,
  },
  connectingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  connectingText: {
    marginTop: 16,
    fontSize: 17,
    color: '#8E8E93',
  },
  devicesContainer: {
    flex: 1,
  },
  devicesTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  devicesList: {
    flex: 1,
  },
  devicesListContent: {
    paddingBottom: 20,
  },
  deviceCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  deviceCardSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  deviceAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  deviceAvatarFallback: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceAvatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  deviceMainInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  deviceSignal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  signalText: {
    fontSize: 13,
    fontWeight: '500',
  },
  deviceActions: {
    marginLeft: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeConnect: {
    backgroundColor: '#007AFF',
  },
  statusBadgeMutual: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgePending: {
    backgroundColor: '#FFF3E0',
  },
  statusBadgeReceived: {
    backgroundColor: '#E3F2FD',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusConnect: {
    color: 'white',
  },
  statusMutual: {
    color: '#2E7D32',
  },
  statusPending: {
    color: '#E65100',
  },
  statusReceived: {
    color: '#0D47A1',
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#8E8E93',
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
  },
});

export default ConnectionScanScreen;
