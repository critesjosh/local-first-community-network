import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Image,
  Animated,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {MainTabScreenProps} from '../types/navigation';
import ConnectionService from '../services/ConnectionService';
import {Connection} from '../types/models';
import {base64ToDataUri} from '../utils/imageUtils';

type Props = MainTabScreenProps<'Connections'>;

const ConnectionsScreen = ({navigation}: Props) => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pendingReceived, setPendingReceived] = useState<Connection[]>([]);
  const [pendingSent, setPendingSent] = useState<Connection[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const arrowAnimatedValue = useRef(new Animated.Value(0)).current;

  const loadConnections = async () => {
    try {
      const loadedConnections = await ConnectionService.getConnections();

      // Separate into mutual, pending-received, and pending-sent
      const mutual = loadedConnections.filter(c => c.status === 'mutual');
      const received = loadedConnections.filter(c => c.status === 'pending-received');
      const sent = loadedConnections.filter(c => c.status === 'pending-sent');

      // Only log if there's a change (reduce noise)
      const totalCount = mutual.length + received.length + sent.length;
      const prevCount = connections.length + pendingReceived.length + pendingSent.length;
      if (totalCount !== prevCount) {
        console.log('[ConnectionsScreen] Connections changed - Mutual:', mutual.length, 'Received:', received.length, 'Sent:', sent.length);
      }

      setConnections(mutual);
      setPendingReceived(received);
      setPendingSent(sent);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  // Animate arrow up and down
  useEffect(() => {
    const isEmpty = connections.length === 0 && 
                    pendingReceived.length === 0 && 
                    pendingSent.length === 0;
    
    if (isEmpty) {
      // Start animation when empty
      Animated.loop(
        Animated.sequence([
          Animated.timing(arrowAnimatedValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(arrowAnimatedValue, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Stop animation when not empty
      arrowAnimatedValue.setValue(0);
    }
  }, [connections.length, pendingReceived.length, pendingSent.length, arrowAnimatedValue]);

  // Load connections when screen comes into focus and start polling
  useFocusEffect(
    useCallback(() => {
      const initializeAndSync = async () => {
        await loadConnections();

        // Check for ANY pending connections (sent or received) and sync automatically
        const allConnections = await ConnectionService.getConnections();
        const hasPending = allConnections.some(
          c => c.status === 'pending-sent' || c.status === 'pending-received'
        );

        if (hasPending) {
          console.log('[ConnectionsScreen] 🔄 Found pending connections, starting bidirectional sync...');
          const upgraded = await ConnectionService.syncPendingConnections();
          if (upgraded > 0) {
            console.log(`[ConnectionsScreen] ✅ Upgraded ${upgraded} connection(s) to mutual`);
            await loadConnections(); // Refresh after sync
          }
        }
      };

      initializeAndSync();

      // Poll for new connections and auto-sync every 3 seconds while screen is focused
      pollIntervalRef.current = setInterval(async () => {
        await loadConnections();
        
        // Auto-sync pending connections in background
        const allConnections = await ConnectionService.getConnections();
        const hasPending = allConnections.some(
          c => c.status === 'pending-sent' || c.status === 'pending-received'
        );
        if (hasPending) {
          console.log('[ConnectionsScreen] 🔄 Background sync for pending connections...');
          await ConnectionService.syncPendingConnections();
        }
      }, 3000);

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

    // Check for ANY pending connections (sent or received) and sync
    const allConnections = await ConnectionService.getConnections();
    const hasPending = allConnections.some(
      c => c.status === 'pending-sent' || c.status === 'pending-received'
    );

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
    navigation.navigate('Connect');
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

  const renderAvatar = (item: Connection) => {
    if (item.profilePhoto) {
      return (
        <Image
          source={{uri: base64ToDataUri(item.profilePhoto)}}
          style={styles.connectionAvatar}
        />
      );
    }
    return (
      <View style={styles.connectionAvatar}>
        <Text style={styles.connectionInitial}>
          {item.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  const renderConnection = ({item}: {item: Connection}) => {
    const followLabel = `Connected ${formatDate(item.connectedAt)}`;

    return (
      <TouchableOpacity
        style={styles.connectionCard}
        onPress={() => handleConnectionPress(item)}>
        {renderAvatar(item)}
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
        {renderAvatar(item)}
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
        {renderAvatar(item)}
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
        {connections.length === 0 &&
        pendingReceived.length === 0 &&
        pendingSent.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyStateHint}>
              <Text style={styles.emptyStateText}>
                Connect with Nearby Profiles
              </Text>
              <Animated.View 
                style={[
                  styles.arrowContainer,
                  {
                    transform: [{
                      translateY: arrowAnimatedValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 15], // Move down 15px
                      })
                    }]
                  }
                ]}
              >
                <Text style={styles.arrowDown}>↓</Text>
              </Animated.View>
            </View>
          </View>
        ) : (
          <>            
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
                      {/* <Text style={styles.sectionTitle}>
                        Connections ({connections.length})
                      </Text> */}
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
          </>
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
  emptyState: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 5, // Very close to tab bar
  },
  emptyStateHint: {
    alignItems: 'center',
    paddingHorizontal: 40,
    marginBottom: 5, // Minimal space
  },
  emptyStateText: {
    fontSize: 18,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
  },
  arrowContainer: {
    marginTop: 12,
  },
  arrowDown: {
    fontSize: 64,
    color: '#007AFF',
    fontWeight: 'bold',
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
