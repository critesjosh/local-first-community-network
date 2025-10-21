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
import Database from '../services/storage/Database';
import EncryptionService from '../services/crypto/EncryptionService';
import ConnectionService from '../services/ConnectionService';
import BLEBroadcastService from '../services/bluetooth/BLEBroadcastService';
import IdentityService from '../services/IdentityService';
import {addBluetoothListener} from '@localcommunity/rn-bluetooth';

interface RSVPState {
  [eventId: string]: {
    status: 'going' | 'interested' | 'not_going';
    count: number;
  };
}

const HomeScreen = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rsvpState, setRsvpState] = useState<RSVPState>({});

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
        } else {
          console.warn('No user identity found, skipping BLE advertising');
        }
      } catch (error) {
        console.error('❌ Failed to start BLE advertising:', error);
      }
    };

    startAdvertising();

    // Cleanup: stop advertising when component unmounts
    return () => {
      BLEBroadcastService.stop().catch(err =>
        console.warn('Error stopping advertising:', err)
      );
    };
  }, []);

  const loadEvents = async () => {
    try {
      // Get all encrypted events from database
      const encryptedEvents = await Database.getEncryptedEvents();

      // Get all connections for decryption
      const connections = await ConnectionService.getConnections();

      if (connections.length === 0) {
        setEvents([]);
        return;
      }

      // Decrypt all events
      const decryptedEvents: Event[] = [];
      for (const encryptedEvent of encryptedEvents) {
        try {
          const decrypted = await EncryptionService.decryptEvent(
            encryptedEvent,
            connections,
          );
          if (decrypted) {
            decryptedEvents.push(decrypted);
          }
        } catch (error) {
          console.warn('Failed to decrypt event:', error);
          // Skip events we can't decrypt
        }
      }

      // Sort by datetime (newest first)
      decryptedEvents.sort((a, b) => {
        return new Date(b.datetime).getTime() - new Date(a.datetime).getTime();
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

  // Load events when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, []),
  );

  const renderEvent = ({item}: {item: Event}) => (
    <EventCard
      event={item}
      onRSVP={handleRSVP}
      currentUserRSVP={rsvpState[item.id]?.status}
      attendeeCount={rsvpState[item.id]?.count}
    />
  );

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
