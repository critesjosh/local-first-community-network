import React, {useState, useCallback, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import EventCard from '../components/events/EventCard';
import {Event} from '../types/models';
import PostStorageService from '../services/storage/PostStorageService';
import EncryptionService from '../services/crypto/EncryptionService';
import ConnectionService from '../services/ConnectionService';
import BLEBroadcastService from '../services/bluetooth/BLEBroadcastService';
import BLEConnectionHandler from '../services/bluetooth/BLEConnectionHandler';
import IdentityService from '../services/IdentityService';
import {addBluetoothListener} from '@localcommunity/rn-bluetooth';
import {initLogger} from '../utils/logger';
import ThreadService from '../services/ThreadService';
import {MainTabScreenProps} from '../types/navigation';

interface RSVPState {
  [eventId: string]: {
    status: 'going' | 'interested' | 'not_going';
    count: number;
  };
}

type Props = MainTabScreenProps<'Home'>;

const HomeScreen: React.FC<Props> = ({navigation}) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rsvpState, setRsvpState] = useState<RSVPState>({});
  const [connections, setConnections] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [threadReplyCounts, setThreadReplyCounts] = useState<{[threadId: string]: number}>({});

  // Initialize logger with user display name
  useEffect(() => {
    initLogger();
  }, []);

  // Listen for Bluetooth events from native layer
  useEffect(() => {
    const unsubscribe = addBluetoothListener((event) => {
      if (event.type === 'error') {

        // Check if this is a Location Services warning
        if (event.code === 'SCAN_DEBUG' &&
            event.message &&
            event.message.includes('Location Services') &&
            event.message.includes('disabled')) {
          // Show alert to user
          Alert.alert(
            'Location Services Required',
            'BLE scanning requires Location Services to be enabled on Android. Please enable Location in your device settings to discover nearby neighbors.',
            [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Open Settings', onPress: () => Linking.openSettings()}
            ]
          );
        }
      }
    });

    return unsubscribe;
  }, []);

  // Start BLE advertising when component mounts
  useEffect(() => {
    const startAdvertising = async () => {
      try {
        // Request Bluetooth permissions first
        console.log('Checking Bluetooth permissions...');
        const {Bluetooth} = await import('@localcommunity/rn-bluetooth');
        const hasPermissions = await Bluetooth.requestPermissions();

        if (!hasPermissions) {
          Alert.alert(
            'Bluetooth Permissions Needed',
            'Please grant Bluetooth permissions to discover nearby neighbors.',
            [
              {text: 'OK', onPress: async () => {
                // Try again after user acknowledges
                const granted = await Bluetooth.requestPermissions();
                if (!granted) {
                  console.error('Bluetooth permissions denied');
                }
              }}
            ]
          );
          return;
        }

        console.log('Bluetooth permissions granted');

        const user = await IdentityService.getCurrentUser();
        const identity = IdentityService.getCurrentIdentity();

        if (user && identity) {
          console.log('Starting BLE advertising for user:', user.displayName);

          // Set profile data for GATT server (when others connect to read profile)
          await BLEBroadcastService.setProfileData(JSON.stringify({
            userId: user.id,
            displayName: user.displayName,
            publicKey: user.id,
            profilePhoto: user.profilePhoto,
          }));

          // Start advertising presence
          await BLEBroadcastService.start({
            userId: user.id,
            displayName: user.displayName,
          });

          console.log('✅ BLE advertising started successfully');

          // Start listening for incoming connection requests
          BLEConnectionHandler.start();
          console.log('✅ BLE connection handler started');
        } else {
          console.warn('No user identity found, skipping BLE advertising');
        }
      } catch (error) {
        console.error('❌ Failed to start BLE advertising:', error);
      }
    };

    startAdvertising();

    // Cleanup: stop advertising and connection handler when component unmounts
    return () => {
      BLEBroadcastService.stop().catch(err =>
        console.warn('Error stopping advertising:', err)
      );
      BLEConnectionHandler.stop();
    };
  }, []);

  const loadEvents = async () => {
    try {
      // Get current user
      const user = await IdentityService.getCurrentUser();
      setCurrentUser(user);

      // Get all encrypted events from storage provider (local for MVP, REST/OrbitDB later)
      const encryptedEvents = await PostStorageService.fetchPosts(0); // Fetch all events since epoch

      // Get all connections for decryption
      const fetchedConnections = await ConnectionService.getConnections();
      setConnections(fetchedConnections);

      if (fetchedConnections.length === 0) {
        setEvents([]);
        return;
      }

      // Decrypt all events
      const decryptedEvents: Event[] = [];
      for (const encryptedEvent of encryptedEvents) {
        try {
          const decrypted = await EncryptionService.decryptEvent(
            encryptedEvent,
            fetchedConnections,
          );
          if (decrypted) {
            decryptedEvents.push(decrypted);
          }
        } catch (error) {
          console.warn('Failed to decrypt event:', error);
          // Skip events we can't decrypt
        }
      }

      // Sort by createdAt (newest first)
      decryptedEvents.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setEvents(decryptedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
      Alert.alert('Error', 'Failed to load events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const handleRSVP = (
    eventId: string,
    status: 'going' | 'interested' | 'not_going',
  ) => {
    setRsvpState(prev => {
      const currentStatus = prev[eventId]?.status;
      const currentCount = prev[eventId]?.count || 0;

      // If clicking the same status, toggle it off
      if (currentStatus === status) {
        return {
          ...prev,
          [eventId]: {
            status: 'not_going',
            count: Math.max(0, currentCount - 1),
          },
        };
      }

      // Otherwise, set new status
      return {
        ...prev,
        [eventId]: {
          status,
          count: currentStatus === 'not_going' ? currentCount + 1 : currentCount,
        },
      };
    });

    // TODO: In Week 3, this will POST to the server
  };

  const handleViewReplies = async (eventId: string) => {
    try {
      console.log('[HomeScreen] Viewing replies for event:', eventId);

      const event = events.find(e => e.id === eventId);
      const authorInfo = getAuthorInfo(event?.authorId || '');

      navigation.navigate('ThreadView', {
        threadId: eventId, // Event ID is the thread ID
        postContent: event?.content,
        postAuthor: authorInfo.displayName,
      });
    } catch (error) {
      console.error('[HomeScreen] Error viewing replies:', error);
      Alert.alert('Error', 'Failed to open replies. Please try again.');
    }
  };

  // Load thread reply counts
  useEffect(() => {
    const loadReplyCounts = async () => {
      const counts: {[threadId: string]: number} = {};
      for (const event of events) {
        if (event.isThread) {
          try {
            const count = await ThreadService.getReplyCount(event.id);
            counts[event.id] = count;
          } catch (error) {
            console.error(`[HomeScreen] Error loading reply count for ${event.id}:`, error);
          }
        }
      }
      setThreadReplyCounts(counts);
    };

    if (events.length > 0) {
      loadReplyCounts();
    }
  }, [events]);

  // Load events when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, []),
  );

  const getAuthorInfo = (authorId: string) => {
    // Check if it's the current user
    if (currentUser && currentUser.id === authorId) {
      return {
        displayName: currentUser.displayName,
        profilePhoto: currentUser.profilePhoto,
      };
    }

    // Look up in connections
    const connection = connections.find(c => c.userId === authorId);
    if (connection) {
      return {
        displayName: connection.displayName,
        profilePhoto: connection.profilePhoto,
      };
    }

    // Fallback
    return {
      displayName: 'Unknown',
      profilePhoto: undefined,
    };
  };

  const renderEvent = ({item}: {item: Event}) => {
    const authorInfo = getAuthorInfo(item.authorId);
    return (
      <EventCard
        event={item}
        authorName={authorInfo.displayName}
        authorPhoto={authorInfo.profilePhoto}
        onRSVP={handleRSVP}
        currentUserRSVP={rsvpState[item.id]?.status}
        attendeeCount={rsvpState[item.id]?.count}
        onViewReplies={handleViewReplies}
        replyCount={threadReplyCounts[item.id]}
      />
    );
  };

  const renderEmpty = () => (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {loading
          ? 'Loading events...'
          : 'No events yet. Connect with neighbors and create an event to get started!'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <Text style={styles.title}>Event Feed</Text>
        <Text style={styles.subtitle}>
          Discover what's happening in your neighborhood
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEvent}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#007AFF"
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 68,
    paddingBottom: 12,
    backgroundColor: '#F2F2F7',
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  listContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  placeholderText: {
    color: '#8E8E93',
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
  },
});

export default HomeScreen;
