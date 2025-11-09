import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RootStackScreenProps} from '../types/navigation';
import ConnectionService from '../services/ConnectionService';
import ItemStorageService from '../services/storage/ItemStorageService';
import {Connection, IrlItem} from '../types/models';
import IrlItemCard from '../components/irl/IrlItemCard';

type Props = RootStackScreenProps<'ConnectionDetail'>;

const ConnectionDetailScreen = ({route, navigation}: Props) => {
  const {connectionId} = route.params;
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [irlItems, setIrlItems] = useState<IrlItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    loadConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const loadConnection = async () => {
    try {
      const connections = await ConnectionService.getConnections();
      const found = connections.find(c => c.id === connectionId);
      setConnection(found || null);
    } catch (error) {
      console.error('Error loading connection:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadItems = async () => {
      try {
        const items = await ItemStorageService.listItemsForConnection(connectionId);
        if (mounted) {
          setIrlItems(items);
        }
      } catch (error) {
        console.error('Error loading IRL items for connection:', error);
      } finally {
        if (mounted) {
          setItemsLoading(false);
        }
      }
    };

    loadItems();

    return () => {
      mounted = false;
    };
  }, [connectionId]);

  const handleDisconnect = () => {
    Alert.alert(
      'Unfollow',
      `Stop following ${connection?.displayName}? You will no longer see their events.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              await ConnectionService.deleteConnection(connectionId);
              // Navigate back without alert
              navigation.goBack();
            } catch (error) {
              console.error('Error disconnecting:', error);
              // Just log the error, don't show alert
            }
          },
        },
      ],
    );
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTrustLevelColor = (trustLevel: string) => {
    switch (trustLevel) {
      case 'verified':
        return '#34C759';
      case 'pending':
        return '#007AFF';
      case 'trusted':
        return '#32ADE6';
      default:
        return '#8E8E93';
    }
  };

  const getConnectionStatusText = () => {
    if (!connection) return 'Connection';

    if (connection.status === 'mutual') {
      return 'Mutual Connection';
    } else if (connection.status === 'pending-sent') {
      return 'Request Sent (awaiting acceptance)';
    } else if (connection.status === 'pending-received') {
      return 'Request Received';
    }

    return 'Connection';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!connection) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Connection not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Follow Details</Text>
        <View style={{width: 60}} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {connection.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>{connection.displayName}</Text>
          <View
            style={[
              styles.trustBadge,
              {
                backgroundColor:
                  connection.status === 'mutual'
                    ? '#34C75920'
                    : '#007AFF20',
              },
            ]}>
            <Text
              style={[
                styles.trustBadgeText,
                {
                  color: connection.status === 'mutual' ? '#34C759' : '#007AFF',
                },
              ]}>
              {connection.status === 'mutual' ? '✓ ' : ''}
              {getConnectionStatusText()}
            </Text>
          </View>
        </View>

        <View style={styles.detailsSection}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>User ID</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {connection.userId}
            </Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Connected On</Text>
            <Text style={styles.detailValue}>
              {formatDate(connection.connectedAt)}
            </Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Connection ID</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {connection.id}
            </Text>
          </View>

          {connection.notes && (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.detailValue}>{connection.notes}</Text>
            </View>
          )}
        </View>

        <View style={styles.findsSection}>
          <View style={styles.findsHeader}>
            <Text style={styles.sectionTitle}>Shared Finds</Text>
            <TouchableOpacity
              style={styles.findsAction}
              onPress={() =>
                navigation.navigate('IrlItemCapture', {connectionId})
              }>
              <Text style={styles.findsActionText}>Log new</Text>
            </TouchableOpacity>
          </View>
          {itemsLoading ? (
            <View style={styles.findsLoading}>
              <ActivityIndicator color="#007AFF" />
            </View>
          ) : irlItems.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.findsScroll}>
              {irlItems.map(item => (
                <IrlItemCard key={item.id} item={item} />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.findsEmpty}>
              <Text style={styles.findsEmptyText}>
                Nothing logged with this neighbor yet. Capture what you trade,
                lend, or discover together.
              </Text>
              <TouchableOpacity
                style={styles.findsEmptyButton}
                onPress={() =>
                  navigation.navigate('IrlItemCapture', {connectionId})
                }>
                <Text style={styles.findsEmptyButtonText}>Start logging</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={handleDisconnect}>
            <Text style={styles.disconnectButtonText}>Unfollow</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  backText: {
    fontSize: 17,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 17,
    color: '#8E8E93',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    paddingTop: 100,
  },
  errorText: {
    fontSize: 17,
    color: '#8E8E93',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  profileSection: {
    backgroundColor: 'white',
    alignItems: 'center',
    paddingVertical: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: 'white',
    fontSize: 42,
    fontWeight: '600',
  },
  displayName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  trustBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  trustBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailsSection: {
    padding: 20,
  },
  detailCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: '#000',
  },
  findsSection: {
    paddingVertical: 24,
    paddingLeft: 20,
    backgroundColor: 'white',
    marginBottom: 16,
  },
  findsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  findsAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E5F1FF',
    borderRadius: 8,
  },
  findsActionText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  findsLoading: {
    paddingVertical: 20,
    paddingRight: 20,
  },
  findsScroll: {
    paddingRight: 20,
  },
  findsEmpty: {
    paddingRight: 20,
    paddingVertical: 12,
    gap: 12,
  },
  findsEmptyText: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  findsEmptyButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  findsEmptyButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  actionsSection: {
    padding: 20,
  },
  disconnectButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  disconnectButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default ConnectionDetailScreen;
