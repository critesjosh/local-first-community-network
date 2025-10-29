import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import BLEManager from '../services/bluetooth/BLEManager';
import ConnectionService from '../services/ConnectionService';
import SessionService from '../services/SessionService';
import Database from '../services/storage/Database';
import {DiscoveredDevice} from '../types/bluetooth';
import {Connection} from '../types/models';
import {Session} from '../types/session';
import {base64ToDataUri} from '../utils/imageUtils';

type DeviceWithConnection = DiscoveredDevice & {
  connection?: Connection;
  isConnecting?: boolean;
};

const ConnectScreen = () => {
  const [devices, setDevices] = useState<DeviceWithConnection[]>([]);
  const [connectingDevices, setConnectingDevices] = useState<Set<string>>(new Set());
  const [connections, setConnections] = useState<Connection[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load connections periodically to update UI
  const loadConnections = useCallback(async () => {
    const allConnections = await Database.getConnections();
    setConnections(allConnections);
  }, []);

  // Initialize BLE and SessionService
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize BLE
        console.log('[ConnectScreen] Initializing BLE...');
        const bleSuccess = await BLEManager.init();
        if (!bleSuccess) {
          Alert.alert(
            'Bluetooth Error',
            'Failed to initialize Bluetooth. Please check:\n\n1. Bluetooth is ON\n2. App has Bluetooth permission\n3. Location Services enabled',
          );
          return;
        }
        console.log('[ConnectScreen] ✅ BLE initialized successfully');

        // Initialize SessionService
        await SessionService.init();

        setIsInitialized(true);
        
        // Start auto-scanning with error handling
        try {
          await BLEManager.startPulsedScanning(999999999); // Effectively continuous
          console.log('[ConnectScreen] ✅ Auto-scanning started');
        } catch (scanError) {
          console.error('[ConnectScreen] Scan error:', scanError);
          Alert.alert(
            'Scanning Error',
            'Could not start scanning. Please ensure:\n\n1. Bluetooth is turned ON\n2. App has Location permission\n\nError: ' + scanError.message,
          );
        }
      } catch (error) {
        console.error('[ConnectScreen] Initialization error:', error);
        Alert.alert(
          'Initialization Error', 
          'Failed to initialize:\n\n' + error.message + '\n\nPlease check Bluetooth and permissions.'
        );
      }
    };

    init();
    loadConnections();

    // Setup listeners
    const scanListener = (device: DiscoveredDevice) => {
      setDevices((prev) => {
        const existing = prev.find((d) => d.id === device.id);
        if (existing) {
          // Update existing device
          return prev.map((d) => 
            d.id === device.id 
              ? {...device, isConnecting: d.isConnecting, connection: d.connection}
              : d
          );
        } else {
          // Add new device
          return [...prev, device];
        }
      });
    };

    const stateListener = (state: any) => {
      // Scan state changes handled internally
    };

    const sessionListener = (session: Session | null) => {
      setCurrentSession(session);
    };

    BLEManager.addScanListener(scanListener);
    BLEManager.addStateListener(stateListener);
    SessionService.addListener(sessionListener);

    // Reload connections periodically
    const connectionInterval = setInterval(loadConnections, 2000);

    return () => {
      BLEManager.removeScanListener(scanListener);
      BLEManager.removeStateListener(stateListener);
      SessionService.removeListener(sessionListener);
      BLEManager.stopPulsedScanning();
      clearInterval(connectionInterval);
    };
  }, [loadConnections]);

  // Update devices with connection info
  useEffect(() => {
    setDevices(prev => 
      prev.map(device => ({
        ...device,
        connection: getConnectionForDevice(device),
      }))
    );
  }, [connections]);

  const getConnectionForDevice = (device: DiscoveredDevice): Connection | undefined => {
    if (device.name) {
      return connections.find(c => c.displayName === device.name);
    }
    return undefined;
  };

  const handleConnect = async (device: DiscoveredDevice) => {
    // Prevent duplicate connection attempts
    if (connectingDevices.has(device.id)) {
      console.log('[ConnectScreen] Already connecting to this device, ignoring duplicate request');
      return;
    }

    // Optimistic UI - show connecting state immediately
    setConnectingDevices(prev => new Set(prev).add(device.id));
    setDevices(prev => 
      prev.map(d => d.id === device.id ? {...d, isConnecting: true} : d)
    );

    try {
      console.log(`[ConnectScreen] 🔗 Starting connection to ${device.name || device.id}`);
      const result = await ConnectionService.requestConnection(device.deviceId);

      if (!result) {
        // Connection failed completely
        console.error('[ConnectScreen] Connection failed - no result returned');
        Alert.alert(
          'Connection Failed',
          'Could not connect to this device. Please ensure:\n\n• The device is nearby\n• Bluetooth is enabled on both devices\n• The other user has the app open',
        );
        await loadConnections();
        return;
      }

      // Connection succeeded or is pending
      const {profile, connection} = result;
      console.log(`[ConnectScreen] ✅ Connection result: ${connection.status}`);

      // Success - add to session if active
      if (currentSession) {
        await SessionService.addConnectionToSession(profile.userId);
      }

      // Reload connections to update UI
      await loadConnections();

      // Show appropriate success message
      if (connection.status === 'mutual') {
        console.log('[ConnectScreen] ✅ Connected successfully');
        Alert.alert(
          '🎉 Connected!',
          `You're now connected with ${profile.displayName}`,
        );
      } else if (connection.status === 'pending-sent') {
        console.log('[ConnectScreen] ⏳ Request sent, waiting for acceptance');
        Alert.alert(
          '✉️ Request Sent',
          `Connection request sent to ${profile.displayName}. They'll see your request when nearby.`,
        );
      }
    } catch (error) {
      console.error('[ConnectScreen] ❌ Error during connection:', error);
      const errorMessage = error?.message || String(error);
      
      // Provide specific error messages
      let userMessage = 'An unexpected error occurred. Please try again.';
      let title = 'Connection Error';
      
      if (errorMessage.includes('Bluetooth') || errorMessage.includes('powered off')) {
        title = 'Bluetooth Error';
        userMessage = 'Bluetooth error. Please check your Bluetooth settings and try again.';
      } else if (errorMessage.includes('timeout')) {
        title = 'Connection Timeout';
        userMessage = 'Connection timed out. The device may be out of range.';
      } else if (errorMessage.includes('parse') || errorMessage.includes('JSON')) {
        title = 'Data Transfer Error';
        userMessage = 'Data transfer error. Please try reconnecting.';
      } else if (errorMessage.includes('not connected')) {
        title = 'Connection Lost';
        userMessage = 'Lost connection to device. Please try again.';
      }
      
      Alert.alert(title, userMessage);
      await loadConnections();
    } finally {
      // Remove connecting state
      setConnectingDevices(prev => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
      setDevices(prev => 
        prev.map(d => d.id === device.id ? {...d, isConnecting: false} : d)
      );
    }
  };

  const handleCheckIn = () => {
    Alert.alert(
      'Check In to Event',
      'Scan for event host QR code or enter event code',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Scan QR Code',
          onPress: () => {
            // TODO: Implement QR code scanning
            Alert.alert('Coming Soon', 'QR code scanning will be available soon!');
          },
        },
      ],
    );
  };

  const handleLeaveParty = () => {
    Alert.alert(
      'Leave Party',
      'Are you sure you want to leave this event?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await SessionService.leaveParty();
            Alert.alert('Left Event', 'You have left the party.');
          },
        },
      ],
    );
  };

  const getTimeRemaining = (): string => {
    if (!currentSession) return '';

    const remaining = SessionService.getSessionTimeRemaining();
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  const renderSessionCard = () => {
    if (!currentSession) {
      return (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionTitle}>No Active Session</Text>
          <Text style={styles.sessionSubtitle}>
            Check in to an event to connect with everyone there
          </Text>
          <TouchableOpacity style={styles.checkInButton} onPress={handleCheckIn}>
            <Text style={styles.checkInButtonText}>Check In to Event</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.sessionCard, styles.sessionCardActive]}>
        <Text style={styles.sessionTitle}>📍 {currentSession.eventName}</Text>
        <Text style={styles.sessionSubtitle}>{getTimeRemaining()}</Text>
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveParty}>
          <Text style={styles.leaveButtonText}>Leave Party</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderAvatar = (device: DeviceWithConnection) => {
    const connection = device.connection;
    
    if (connection?.profilePhoto) {
      return (
        <Image
          source={{uri: base64ToDataUri(connection.profilePhoto)}}
          style={styles.deviceAvatar}
        />
      );
    }
    
    const initial = (device.name || 'U').charAt(0).toUpperCase();
    return (
      <View style={[styles.deviceAvatar, styles.deviceAvatarFallback]}>
        <Text style={styles.deviceAvatarText}>{initial}</Text>
      </View>
    );
  };

  const renderConnectionStatus = (device: DeviceWithConnection) => {
    if (device.isConnecting || connectingDevices.has(device.id)) {
      return (
        <View style={[styles.statusBadge, styles.statusBadgeConnecting]}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={[styles.statusText, styles.statusConnecting]}>Connecting...</Text>
        </View>
      );
    }

    const connection = device.connection;

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
            <Text style={[styles.statusText, styles.statusReceived]}>👋 Accept</Text>
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

  const getSignalColor = (rssi: number) => {
    if (rssi > -60) return '#34C759';
    if (rssi > -70) return '#32ADE6';
    if (rssi > -80) return '#FF9500';
    return '#FF3B30';
  };

  const renderDevice = ({item}: {item: DeviceWithConnection}) => {
    const canConnect = !item.connection || item.connection.status === 'pending-received';
    const signalColor = getSignalColor(item.rssi);

    return (
      <TouchableOpacity
        style={styles.deviceCard}
        onPress={() => canConnect ? handleConnect(item) : null}
        disabled={!canConnect || connectingDevices.has(item.id)}>
        {renderAvatar(item)}
        <View style={styles.deviceMainInfo}>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{item.name || 'Broadcasting Member'}</Text>
            <View style={styles.deviceSignal}>
              <View style={[styles.signalDot, {backgroundColor: signalColor}]} />
              <Text style={[styles.signalText, {color: signalColor}]}>
                {item.rssi} dBm
              </Text>
            </View>
          </View>
          <View style={styles.deviceActions}>
            {renderConnectionStatus(item)}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!isInitialized) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Initializing...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.content}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>Connect</Text>
          <Text style={styles.subtitle}>
            Discover and connect with people nearby
          </Text>
        </View>

        {renderSessionCard()}

        <View style={styles.devicesSection}>
          <Text style={styles.sectionTitle}>
            Nearby ({devices.length})
          </Text>
          <Text style={styles.sectionSubtitle}>
            Scanning automatically for people around you
          </Text>
        </View>

        {devices.length > 0 ? (
          <FlatList
            data={devices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.id}
            style={styles.devicesList}
            contentContainerStyle={styles.devicesListContent}
          />
        ) : (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#007AFF" style={styles.emptyStateSpinner} />
            <Text style={styles.emptyStateText}>
              Looking for nearby devices...
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Make sure others have the app open and are nearby
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 17,
    color: '#8E8E93',
  },
  headerSection: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sessionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sessionCardActive: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  sessionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  sessionSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 16,
  },
  checkInButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkInButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  leaveButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  leaveButtonText: {
    color: '#FF3B30',
    fontSize: 17,
    fontWeight: '600',
  },
  devicesSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
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
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
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
    marginBottom: 4,
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadgeConnect: {
    backgroundColor: '#007AFF',
  },
  statusBadgeConnecting: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
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
    marginLeft: 4,
  },
  statusConnect: {
    color: 'white',
    marginLeft: 0,
  },
  statusConnecting: {
    color: '#007AFF',
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateSpinner: {
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 17,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 15,
    color: '#C7C7CC',
    textAlign: 'center',
  },
});

export default ConnectScreen;

