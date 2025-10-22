import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {MainTabScreenProps} from '../types/navigation';
import ConnectionService from '../services/ConnectionService';
import {Connection} from '../types/models';

type Props = MainTabScreenProps<'Connections'>;

const ConnectionsScreen = ({navigation}: Props) => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pendingReceived, setPendingReceived] = useState<Connection[]>([]);
  const [pendingSent, setPendingSent] = useState<Connection[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadConnections = async () => {
    try {
      const loadedConnections = await ConnectionService.getConnections();

      console.log('[ConnectionsScreen] Loaded connections:', loadedConnections.map(c => ({
        displayName: c.displayName,
        status: c.status,
        id: c.id.substring(0, 8),
      })));

      // Separate into mutual, pending-received, and pending-sent
      const mutual = loadedConnections.filter(c => c.status === 'mutual');
      const received = loadedConnections.filter(c => c.status === 'pending-received');
      const sent = loadedConnections.filter(c => c.status === 'pending-sent');

      console.log('[ConnectionsScreen] Mutual:', mutual.length, 'Pending-received:', received.length, 'Pending-sent:', sent.length);

      setConnections(mutual);
      setPendingReceived(received);
      setPendingSent(sent);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  // Load connections when screen comes into focus and start polling
  useFocusEffect(
    useCallback(() => {
      const initializeAndSync = async () => {
        await loadConnections();

        // Check for pending-sent connections and sync automatically
        const allConnections = await ConnectionService.getConnections();
        const hasPending = allConnections.some(c => c.status === 'pending-sent');

        if (hasPending) {
          console.log('[ConnectionsScreen] Found pending connections, syncing automatically...');
          const upgraded = await ConnectionService.syncPendingConnections();
          if (upgraded > 0) {
            console.log(`[ConnectionsScreen] Upgraded ${upgraded} connection(s) to mutual`);
            await loadConnections(); // Refresh after sync
          }
        }
      };

      initializeAndSync();

      // Poll for new connections every 2 seconds while screen is focused
      pollIntervalRef.current = setInterval(() => {
        loadConnections();
      }, 2000);

      // Cleanup polling when screen loses focus
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }, []),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConnections();

    // Check for pending connections and sync
    const allConnections = await ConnectionService.getConnections();
    const hasPending = allConnections.some(c => c.status === 'pending-sent');

    if (hasPending) {
      console.log('[ConnectionsScreen] Refresh: syncing pending connections...');
      const upgraded = await ConnectionService.syncPendingConnections();
      if (upgraded > 0) {
        console.log(`[ConnectionsScreen] Refresh: upgraded ${upgraded} connection(s) to mutual`);
        await loadConnections(); // Refresh after sync
      }
    }

    setRefreshing(false);
  };

  const handleConnectPress = () => {
    navigation.navigate('ConnectionScan');
  };

  const handleConnectionPress = (connection: Connection) => {
    navigation.navigate('ConnectionDetail', {connectionId: connection.id});
  };

  const handleAcceptConnection = async (connectionId: string) => {
    try {
      console.log('[ConnectionsScreen] Accept button clicked for:', connectionId.substring(0, 8));
      const success = await ConnectionService.acceptConnectionRequest(connectionId);
      console.log('[ConnectionsScreen] Accept result:', success);
      if (success) {
        console.log('[ConnectionsScreen] Reloading connections after accept');
        await loadConnections();
        console.log('[ConnectionsScreen] Connections reloaded');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
    }
  };

  const handleRejectConnection = async (connectionId: string) => {
    try {
      const success = await ConnectionService.rejectConnectionRequest(connectionId);
      if (success) {
        await loadConnections();
      }
    } catch (error) {
      console.error('Error rejecting connection:', error);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const renderConnection = ({item}: {item: Connection}) => {
    const followLabel = `Connected ${formatDate(item.connectedAt)}`;

    return (
      <TouchableOpacity
        style={styles.connectionCard}
        onPress={() => handleConnectionPress(item)}>
        <View style={styles.connectionAvatar}>
          <Text style={styles.connectionInitial}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.connectionInfo}>
          <Text style={styles.connectionName}>{item.displayName}</Text>
          <Text style={styles.connectionDate}>{followLabel}</Text>
        </View>
        <View style={[styles.trustBadge, styles.trustBadgeVerified]}>
          <Text style={[styles.trustBadgeText, styles.trustBadgeTextVerified]}>
            ✓ Mutual
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPendingReceived = ({item}: {item: Connection}) => {
    return (
      <View style={styles.connectionCard}>
        <View style={styles.connectionAvatar}>
          <Text style={styles.connectionInitial}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.connectionInfo}>
          <Text style={styles.connectionName}>{item.displayName}</Text>
          <Text style={styles.connectionDate}>Wants to connect</Text>
        </View>
        <View style={styles.pendingActions}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptConnection(item.id)}>
            <Text style={styles.acceptButtonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => handleRejectConnection(item.id)}>
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPendingSent = ({item}: {item: Connection}) => {
    return (
      <TouchableOpacity
        style={styles.connectionCard}
        onPress={() => handleConnectionPress(item)}>
        <View style={styles.connectionAvatar}>
          <Text style={styles.connectionInitial}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.connectionInfo}>
          <Text style={styles.connectionName}>{item.displayName}</Text>
          <Text style={styles.connectionDate}>Request sent {formatDate(item.connectedAt)}</Text>
        </View>
        <View style={[styles.trustBadge, styles.trustBadgePending]}>
          <Text style={[styles.trustBadgeText, styles.trustBadgeTextPending]}>Pending</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.content}>
        <Text style={styles.title}>People Nearby</Text>
        <Text style={styles.subtitle}>
          Connect with neighbors to see their updates and events
        </Text>

        <TouchableOpacity
          style={styles.connectButton}
          onPress={handleConnectPress}>
          <Text style={styles.connectButtonText}>Discover Nearby Profiles</Text>
        </TouchableOpacity>


        {connections.length === 0 &&
        pendingReceived.length === 0 &&
        pendingSent.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              No connections yet. Tap the button above to discover people broadcasting
              nearby.
            </Text>
          </View>
        ) : (
          <FlatList
            data={[]}
            ListHeaderComponent={
              <>
                {pendingReceived.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Pending Requests ({pendingReceived.length})
                    </Text>
                    {pendingReceived.map(item => (
                      <View key={item.id}>{renderPendingReceived({item})}</View>
                    ))}
                  </View>
                )}

                {pendingSent.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Requests Sent ({pendingSent.length})
                    </Text>
                    {pendingSent.map(item => (
                      <View key={item.id}>{renderPendingSent({item})}</View>
                    ))}
                  </View>
                )}

                {connections.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Connections ({connections.length})
                    </Text>
                    {connections.map(item => (
                      <View key={item.id}>{renderConnection({item})}</View>
                    ))}
                  </View>
                )}
              </>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            contentContainerStyle={styles.connectionsList}
          />
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
  content: {
    padding: 20,
    paddingTop: 80,
    flex: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 24,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  connectButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#8E8E93',
    textAlign: 'center',
    fontSize: 16,
  },
  connectionsList: {
    paddingBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1C1C1E',
  },
  connectionCard: {
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
  connectionAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  connectionInitial: {
    color: 'white',
    fontSize: 22,
    fontWeight: '600',
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  connectionDate: {
    fontSize: 13,
    color: '#8E8E93',
  },
  trustBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trustBadgeVerified: {
    backgroundColor: '#E8F5E9',
  },
  trustBadgePending: {
    backgroundColor: '#E5F1FF',
  },
  trustBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  trustBadgeTextVerified: {
    color: '#34C759',
  },
  trustBadgeTextPending: {
    color: '#007AFF',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#34C759',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  rejectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ConnectionsScreen;
