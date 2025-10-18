import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import IdentityService from '../services/IdentityService';
import {User} from '../types/models';

const ProfileScreen = () => {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const currentUser = await IdentityService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setDisplayName(currentUser.displayName);
        setProfilePhoto(currentUser.profilePhoto);
      } else {
        // Identity exists but user profile not found in database
        // This can happen if identity creation partially failed
        console.warn('[ProfileScreen] User profile not found, clearing identity to restart onboarding');
        
        // Clear the corrupted identity
        await IdentityService.clearIdentity();
        
        Alert.alert(
          'Profile Not Found',
          'Your profile data was not found. The app will now restart and you can create your identity again.',
          [
            {
              text: 'Restart',
              onPress: () => {
                // The simplest way to restart: close the app
                // User will need to manually reopen it
                if (Platform.OS === 'ios') {
                  // On iOS, we can't programmatically restart, so just show a message
                  Alert.alert('Please Restart', 'Please close and reopen the app to continue.');
                } else {
                  // On Android, we could use BackHandler.exitApp() but it's not ideal
                  Alert.alert('Please Restart', 'Please close and reopen the app to continue.');
                }
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name Required', 'Please enter a display name');
      return;
    }

    setIsSaving(true);
    try {
      await IdentityService.updateProfile({
        displayName: displayName.trim(),
        profilePhoto: profilePhoto,
      });
      Alert.alert('Success', 'Profile updated successfully');
      await loadUserProfile();
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
      console.error('Error updating profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPhoto = async () => {
    try {
      // Request permissions
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a profile picture.',
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        setProfilePhoto(imageUri);
        
        // Auto-save the profile with the new photo
        setIsSaving(true);
        try {
          await IdentityService.updateProfile({
            profilePhoto: imageUri,
          });
          await loadUserProfile();
        } catch (error) {
          Alert.alert('Error', 'Failed to save profile photo');
          console.error('Error saving profile photo:', error);
        } finally {
          setIsSaving(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const copyUserId = () => {
    if (user) {
      // In a real app, we'd use Clipboard API
      Alert.alert('User ID', `Your ID: ${user.id.substring(0, 16)}...`);
    }
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
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>
            Your identity in the neighborhood network
          </Text>

          <View style={styles.profileCard}>
          <TouchableOpacity 
            style={styles.avatar}
            onPress={handleAddPhoto}
            disabled={isSaving}
          >
            {profilePhoto ? (
              <Image 
                source={{uri: profilePhoto}} 
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {displayName ? displayName[0].toUpperCase() : '?'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="How should neighbors know you?"
            placeholderTextColor="#8E8E93"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!isSaving}
          />

          <TouchableOpacity
            style={styles.photoButton}
            onPress={handleAddPhoto}
            disabled={isSaving}>
            <Text style={styles.photoButtonText}>
              {profilePhoto ? 'Change Profile Photo' : 'Add Profile Photo'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.disabledButton]}
            onPress={handleSaveProfile}
            disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Save Profile</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Your Identity</Text>
          <Text style={styles.infoText}>
            Your identity is secured with cryptographic keys generated on this
            device. No email or phone number required.
          </Text>
          <TouchableOpacity onPress={copyUserId} style={styles.idContainer}>
            <Text style={styles.idLabel}>User ID:</Text>
            <Text style={styles.idText}>
              {user ? `${user.id.substring(0, 8)}...` : 'Loading...'}
            </Text>
          </TouchableOpacity>
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 60,
  },
  content: {
    paddingHorizontal: 20,
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
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 40,
    color: 'white',
    fontWeight: 'bold',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    alignSelf: 'flex-start',
    color: '#000',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    width: '100%',
  },
  photoButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 16,
  },
  photoButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  infoCard: {
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
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
    marginBottom: 12,
  },
  idContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#C7C7CC',
  },
  idLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3C3C43',
    marginRight: 8,
  },
  idText: {
    fontSize: 14,
    color: '#007AFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default ProfileScreen;