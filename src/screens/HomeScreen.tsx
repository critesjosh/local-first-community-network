import React, { useState, useCallback, useEffect } from 'react';
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
import PostService from '../services/PostService';
import {MainTabScreenProps} from '../types/navigation';
import {Buffer} from 'buffer';
import {ConnectionProfile} from '../types/bluetooth';

interface RSVPState {
  [eventId: string]: {
    status: "going" | "interested" | "not_going";
    count: number;
  };
}

type Props = MainTabScreenProps<'Home'>;

const HomeScreen: React.FC<Props> = ({navigation}) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rsvpState, setRsvpState] = useState<RSVPState>({});
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [threadReplyCounts, setThreadReplyCounts] = useState<{[threadId: string]: number}>({});

  // Initialize logger with user display name
  useEffect(() => {
    initLogger();
  }, []);

  // Subscribe to advertising state changes
  useEffect(() => {
    const handleAdvertisingStateChange = (advertising: boolean) => {
      setIsAdvertising(advertising);
    };

    BLEBroadcastService.addStateListener(handleAdvertisingStateChange);

    return () => {
      BLEBroadcastService.removeStateListener(handleAdvertisingStateChange);
    };
  }, []);

  // Listen for Bluetooth events from native layer
  useEffect(() => {
    const unsubscribe = addBluetoothListener((event) => {
      if (event.type === "error") {
        // Check if this is a Location Services warning
        if (
          event.code === "SCAN_DEBUG" &&
          event.message &&
          event.message.includes("Location Services") &&
          event.message.includes("disabled")
        ) {
          // Show alert to user
          Alert.alert(
            "Location Services Required",
            "BLE scanning requires Location Services to be enabled on Android. Please enable Location in your device settings to discover nearby neighbors.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
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
        console.log("Checking Bluetooth permissions...");
        const { Bluetooth } = await import("@localcommunity/rn-bluetooth");
        const hasPermissions = await Bluetooth.requestPermissions();

        if (!hasPermissions) {
          Alert.alert(
            "Bluetooth Permissions Needed",
            "Please grant Bluetooth permissions to discover nearby neighbors.",
            [
              {
                text: "OK",
                onPress: async () => {
                  // Try again after user acknowledges
                  const granted = await Bluetooth.requestPermissions();
                  if (!granted) {
                    console.error("Bluetooth permissions denied");
                  }
                },
              },
            ]
          );
          return;
        }

        console.log("Bluetooth permissions granted");

        const user = await IdentityService.getCurrentUser();
        const identity = IdentityService.getCurrentIdentity();

        if (user && identity) {
          console.log("Starting BLE advertising for user:", user.displayName);

          // Create minimal connection profile - only essential data for BLE transfer
          // Profile photos are too large for GATT reads/writes (512 byte limit) and will be synced separately
          const fullProfile: ConnectionProfile = {
            userId: user.id,
            displayName: user.displayName,
            publicKey: Buffer.from(identity.publicKey).toString("base64"),
            // Explicitly exclude profilePhoto - it causes 512-byte GATT read limit to be exceeded
          };

          console.log("[HomeScreen] 📋 Profile data prepared:", {
            userId: fullProfile.userId,
            displayName: fullProfile.displayName,
            publicKeyLength: fullProfile.publicKey.length,
          });

          // Start advertising presence (this will set the profile data internally)
          await BLEBroadcastService.start(
            {
              userId: user.id,
              displayName: user.displayName,
            },
            fullProfile
          );

          console.log("✅ BLE advertising started successfully");

          // Start the connection handler to receive connection requests/responses
          BLEConnectionHandler.start();
          console.log("✅ BLE connection handler started");
        } else {
          console.warn("No user identity found, skipping BLE advertising");
        }
      } catch (error) {
        console.error("❌ Failed to start BLE advertising:", error);
      }
    };

    startAdvertising();

    // Cleanup: stop advertising and connection handler when component unmounts
    return () => {
      BLEBroadcastService.stop().catch((err) =>
        console.warn("Error stopping advertising:", err)
      );
      BLEConnectionHandler.stop();
    };
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      // Get current user
      const user = await IdentityService.getCurrentUser();
      setCurrentUser(user);

      // Get all encrypted events from storage provider (local for MVP, REST/OrbitDB later)
      const encryptedEvents = await PostStorageService.fetchPosts(0); // Fetch all events since epoch
      console.log(`[HomeScreen] Fetched ${encryptedEvents.length} encrypted events`);

      // Get all connections for decryption
      const fetchedConnections = await ConnectionService.getConnections();
      setConnections(fetchedConnections);

      if (fetchedConnections.length === 0) {
        console.log('[HomeScreen] No connections, clearing events');
        setEvents([]);
        return;
      }

      // Decrypt all events
      const decryptedEvents: Event[] = [];
      for (const encryptedEvent of encryptedEvents) {
        try {
          const decrypted = await EncryptionService.decryptEvent(
            encryptedEvent,
            fetchedConnections
          );
          if (decrypted) {
            decryptedEvents.push(decrypted);
          }
        } catch (error) {
          console.warn("Failed to decrypt event:", error);
          // Skip events we can't decrypt
        }
      }

      console.log(`[HomeScreen] Decrypted ${decryptedEvents.length} events`);

      // Sort by createdAt (newest first)
      decryptedEvents.sort((a, b) => {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      setEvents(decryptedEvents);
    } catch (error) {
      console.error("Error loading events:", error);
      Alert.alert("Error", "Failed to load events. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []); // Empty deps - function doesn't depend on any props/state

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const handleRSVP = (
    eventId: string,
    status: "going" | "interested" | "not_going"
  ) => {
    setRsvpState((prev) => {
      const currentStatus = prev[eventId]?.status;
      const currentCount = prev[eventId]?.count || 0;

      // If clicking the same status, toggle it off
      if (currentStatus === status) {
        return {
          ...prev,
          [eventId]: {
            status: "not_going",
            count: Math.max(0, currentCount - 1),
          },
        };
      }

      // Otherwise, set new status
      return {
        ...prev,
        [eventId]: {
          status,
          count:
            currentStatus === "not_going" ? currentCount + 1 : currentCount,
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

  const handleDeletePost = async (eventId: string) => {
    try {
      console.log('[HomeScreen] Deleting post:', eventId);

      // Optimistically update UI first
      setEvents(prevEvents => {
        const filtered = prevEvents.filter(e => e.id !== eventId);
        console.log(`[HomeScreen] Filtered events: ${prevEvents.length} -> ${filtered.length}`);
        return filtered;
      });

      // Then delete from server/database
      await PostService.deletePost(eventId);

      console.log('[HomeScreen] Post deleted successfully');
    } catch (error) {
      console.error('[HomeScreen] Error deleting post:', error);
      Alert.alert('Error', 'Failed to delete post. Please try again.');
      // Reload events on error to restore state
      await loadEvents();
    }
  };

  // Load thread reply counts for all events (every event can have replies)
  useEffect(() => {
    const loadReplyCounts = async () => {
      console.log(`[HomeScreen] Loading reply counts for ${events.length} events`);
      const counts: {[threadId: string]: number} = {};
      for (const event of events) {
        try {
          const count = await ThreadService.getReplyCount(event.id);
          counts[event.id] = count;
          if (count > 0) {
            console.log(`[HomeScreen] Event ${event.id.substring(0, 8)} has ${count} replies`);
          }
        } catch (error) {
          console.error(`[HomeScreen] Error loading reply count for ${event.id}:`, error);
        }
      }
      setThreadReplyCounts(counts);
      console.log(`[HomeScreen] Reply counts loaded:`, counts);
    };

    if (events.length > 0) {
      loadReplyCounts();
    }
  }, [events]);

  // Auto-refresh: Poll for new posts every 15 seconds
  useEffect(() => {
    console.log('[HomeScreen] Setting up auto-refresh (15s interval)');

    const intervalId = setInterval(async () => {
      console.log('[HomeScreen] Auto-refreshing posts...');
      await loadEvents();
    }, 15000); // 15 seconds

    return () => {
      console.log('[HomeScreen] Cleaning up auto-refresh');
      clearInterval(intervalId);
    };
  }, [loadEvents]); // Depend on loadEvents

  // Load events when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [])
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
    const connection = connections.find((c) => c.userId === authorId);
    if (connection) {
      return {
        displayName: connection.displayName,
        profilePhoto: connection.profilePhoto,
      };
    }

    // Fallback
    return {
      displayName: "Unknown",
      profilePhoto: undefined,
    };
  };

  const renderEvent = ({ item }: { item: Event }) => {
    const authorInfo = getAuthorInfo(item.authorId);
    const isOwnPost = currentUser && currentUser.id === item.authorId;
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
        onDelete={handleDeletePost}
        isOwnPost={isOwnPost}
      />
    );
  };

  const renderEmpty = () => (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {loading
          ? "Loading events..."
          : "No events yet. Connect with neighbors and create an event to get started!"}
      </Text>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <Text
        style={styles.reportLink}
        onPress={() => Linking.openURL('mailto:report@adjacentpossible.dev')}
      >
        Report content violations
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
        <View
          style={[
            styles.advertisingBadge,
            isAdvertising
              ? styles.advertisingBadgeActive
              : styles.advertisingBadgeInactive,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isAdvertising ? styles.statusDotActive : styles.statusDotInactive,
            ]}
          />
          <Text style={styles.advertisingText}>
            {isAdvertising ? "Discoverable" : "Not advertising"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
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
    backgroundColor: "#F2F2F7",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#F2F2F7",
  },
  title: {
    fontSize: 34,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#8E8E93",
  },
  advertisingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  advertisingBadgeActive: {
    backgroundColor: "#E8F5E9",
  },
  advertisingBadgeInactive: {
    backgroundColor: "#FFF3E0",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotActive: {
    backgroundColor: "#4CAF50",
  },
  statusDotInactive: {
    backgroundColor: "#FF9800",
  },
  advertisingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  listContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    marginTop: 20,
  },
  placeholderText: {
    color: "#8E8E93",
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
  },
  footerContainer: {
    paddingVertical: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  reportLink: {
    fontSize: 12,
    color: '#8E8E93',
    textDecorationLine: 'underline',
  },
});

export default HomeScreen;
