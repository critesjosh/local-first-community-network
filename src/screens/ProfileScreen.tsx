import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {MainTabScreenProps} from '../types/navigation';
import IdentityService from '../services/IdentityService';
import {User} from '../types/models';
import {base64ToDataUri} from '../utils/imageUtils';

type Props = MainTabScreenProps<'Profile'>;

const ProfileScreen = ({navigation}: Props) => {
  const [user, setUser] = useState<User | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const loadUserProfile = async () => {
    try {
      const currentUser = await IdentityService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setProfilePhoto(currentUser.profilePhoto);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reload profile when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadUserProfile();
    }, []),
  );

  const handleEditProfile = () => {
    navigation.navigate('ProfileEdit');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          Your identity in the neighborhood network
        </Text>

        <TouchableOpacity
          style={styles.profileCard}
          onPress={handleEditProfile}
          activeOpacity={0.7}>
          <View style={styles.avatar}>
            {profilePhoto ? (
              <Image
                source={{uri: base64ToDataUri(profilePhoto)}}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {user?.displayName ? user.displayName[0].toUpperCase() : '?'}
              </Text>
            )}
          </View>

          <Text style={styles.displayName}>
            {user?.displayName || 'Loading...'}
          </Text>

          <Text style={styles.userId}>
            ID: {user ? `${user.id.substring(0, 8)}...` : '...'}
          </Text>

          <View style={styles.chevronContainer}>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Your Identity</Text>
          <Text style={styles.infoText}>
            Your identity is secured with cryptographic keys generated on this
            device. No email or phone number required.
          </Text>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
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
  profileCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarText: {
    fontSize: 48,
    color: 'white',
    fontWeight: 'bold',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  userId: {
    fontSize: 14,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
    textAlign: 'center',
  },
  chevronContainer: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -15,
  },
  chevron: {
    fontSize: 30,
    color: '#C7C7CC',
    fontWeight: '300',
  },
  infoCard: {
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  infoText: {
    fontSize: 14,
    color: '#3C3C43',
    lineHeight: 20,
  },
});

export default ProfileScreen;