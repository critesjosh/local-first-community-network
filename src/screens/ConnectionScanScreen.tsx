import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RootStackScreenProps} from '../types/navigation';
import BLEManager from '../services/bluetooth/BLEManager';
import ConnectionService from '../services/ConnectionService';
import {DiscoveredDevice} from '../types/bluetooth';
import {ConnectionProfile} from '../types/bluetooth';

type Props = RootStackScreenProps<'ConnectionScan'>;

const ConnectionScanScreen = ({navigation}: Props) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

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

    // Add listeners
    const scanListener = (device: DiscoveredDevice) => {
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
      BLEManager.stopScanning();
      BLEManager.stopAdvertising();
    };
  }, [navigation]);

  const handleStartScanning = async () => {
    try {
      setDevices([]);

      // Start advertising so other devices can see us
      console.log('Starting advertising...');
      const advertisingStarted = await BLEManager.startAdvertising();
      if (!advertisingStarted) {
        console.warn('Failed to start advertising, but continuing with scan');
      }

      // Start scanning for other devices
      await BLEManager.startScanning();
    } catch (error) {
      Alert.alert('Error', 'Failed to start scanning. Please try again.');
    }
  };

  const handleStopScanning = async () => {
    BLEManager.stopScanning();
    await BLEManager.stopAdvertising();
  };

  const handleDevicePress = async (device: DiscoveredDevice) => {
    if (isConnecting) return;

    setSelectedDevice(device.id);
    setIsConnecting(true);

    try {
      // Stop scanning first
      BLEManager.stopScanning();

      // Initiate connection
      const profile = await ConnectionService.initiateConnection(device.id);

      if (!profile) {
        throw new Error('Failed to read device profile');
      }

      // Show confirmation dialog
      Alert.alert(
        'Connection Request',
        `Connect with ${profile.displayName}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: async () => {
              await ConnectionService.cancelConnection(device.id);
              setIsConnecting(false);
              setSelectedDevice(null);
            },
          },
          {
            text: 'Connect',
            onPress: async () => {
              await handleConfirmConnection(device.id, profile);
            },
          },
        ],
      );
    } catch (error) {
      console.error('Error connecting to device:', error);
      Alert.alert('Connection Error', 'Failed to connect to device. Please try again.');
      setIsConnecting(false);
      setSelectedDevice(null);
    }
  };

  const handleConfirmConnection = async (
    deviceId: string,
    profile: ConnectionProfile,
  ) => {
    try {
      const connection = await ConnectionService.confirmConnection(deviceId);

      if (!connection) {
        throw new Error('Failed to complete connection');
      }

      Alert.alert(
        'Success!',
        `You are now connected with ${profile.displayName}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      console.error('Error confirming connection:', error);
      Alert.alert('Error', 'Failed to complete connection. Please try again.');
    } finally {
      setIsConnecting(false);
      setSelectedDevice(null);
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

  const renderDevice = ({item}: {item: DiscoveredDevice}) => {
    const isSelected = selectedDevice === item.id;
    const signalStrength = getSignalStrength(item.rssi);
    const signalColor = getSignalColor(item.rssi);

    return (
      <TouchableOpacity
        style={[styles.deviceCard, isSelected && styles.deviceCardSelected]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceId}>{item.id.substring(0, 8)}...</Text>
        </View>
        <View style={styles.deviceSignal}>
          <View style={[styles.signalDot, {backgroundColor: signalColor}]} />
          <Text style={[styles.signalText, {color: signalColor}]}>
            {signalStrength}
          </Text>
          <Text style={styles.rssiText}>{item.rssi} dBm</Text>
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
        <Text style={styles.headerTitle}>Connect</Text>
        <View style={{width: 60}} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Find Nearby People</Text>
        <Text style={styles.subtitle}>
          {isScanning
            ? 'Scanning for nearby devices...'
            : 'Tap the button below to start scanning'}
        </Text>

        {!isScanning && !isConnecting && (
          <TouchableOpacity
            style={styles.scanButton}
            onPress={handleStartScanning}>
            <Text style={styles.scanButtonText}>Start Scanning</Text>
          </TouchableOpacity>
        )}

        {isScanning && (
          <TouchableOpacity
            style={[styles.scanButton, styles.stopButton]}
            onPress={handleStopScanning}>
            <ActivityIndicator color="white" style={styles.spinner} />
            <Text style={styles.scanButtonText}>Stop Scanning</Text>
          </TouchableOpacity>
        )}

        {isConnecting && (
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

        {!isScanning && devices.length === 0 && !isConnecting && (
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
    justifyContent: 'space-between',
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
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 13,
    color: '#8E8E93',
  },
  deviceSignal: {
    alignItems: 'flex-end',
  },
  signalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  signalText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  rssiText: {
    fontSize: 11,
    color: '#8E8E93',
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
