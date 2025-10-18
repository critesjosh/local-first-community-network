import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {MainTabScreenProps} from '../types/navigation';
import ConnectionService from '../services/ConnectionService';
import {Connection} from '../types/models';

type Props = MainTabScreenProps<'Connections'>;

const ConnectionsScreen = ({navigation}: Props) => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadConnections = async () => {
    try {
      const loadedConnections = await ConnectionService.getConnections();
      setConnections(loadedConnections);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  // Load connections when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadConnections();
    }, []),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConnections();
    setRefreshing(false);
  };

  const handleConnectPress = () => {
    navigation.navigate('ConnectionScan');
  };

  const handleConnectionPress = (connection: Connection) => {
    navigation.navigate('ConnectionDetail', {connectionId: connection.id});
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
    const followLabel =
      item.trustLevel === 'verified'
        ? `Mutual since ${formatDate(item.connectedAt)}`
        : `Following since ${formatDate(item.connectedAt)}`;
    const isMutual = item.trustLevel === 'verified';
    const badgeText = isMutual ? '✓ Mutual' : 'Following';
    const badgeStyle = isMutual ? styles.trustBadgeVerified : styles.trustBadgePending;
    const badgeTextStyle = isMutual
      ? styles.trustBadgeTextVerified
      : styles.trustBadgeTextPending;

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
        <View style={[styles.trustBadge, badgeStyle]}>
          <Text style={[styles.trustBadgeText, badgeTextStyle]}>{badgeText}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>People Nearby</Text>
        <Text style={styles.subtitle}>
          Follow neighbors you meet to see their updates and events
        </Text>

        <TouchableOpacity
          style={styles.connectButton}
          onPress={handleConnectPress}>
          <Text style={styles.connectButtonText}>Discover Nearby Profiles</Text>
        </TouchableOpacity>

        {connections.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              No follows yet. Tap the button above to discover people broadcasting
              nearby.
            </Text>
          </View>
        ) : (
          <FlatList
            data={connections}
            renderItem={renderConnection}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.connectionsList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
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
    marginBottom: 24,
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
});

export default ConnectionsScreen;
