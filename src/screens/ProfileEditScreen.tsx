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
import {RootStackScreenProps} from '../types/navigation';
import IdentityService from '../services/IdentityService';
import {User} from '../types/models';
import {pickProfileImage, takeProfilePhoto, base64ToDataUri} from '../utils/imageUtils';

type Props = RootStackScreenProps<'ProfileEdit'>;

const ProfileEditScreen = ({navigation}: Props) => {
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
      Alert.alert('Success', 'Profile updated successfully', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
      console.error('Error updating profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPhoto = async () => {
    Alert.alert('Profile Photo', 'Choose a photo source', [
      {text: 'Take Photo', onPress: handleTakePhoto},
      {text: 'Choose from Library', onPress: handleChoosePhoto},
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const handleTakePhoto = async () => {
    try {
      setIsSaving(true);
      const result = await takeProfilePhoto();

      if (result) {
        const base64Image = result.base64;
        setProfilePhoto(base64Image);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', error.message || 'Failed to take photo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChoosePhoto = async () => {
    try {
      setIsSaving(true);
      const result = await pickProfileImage();

      if (result) {
        const base64Image = result.base64;
        setProfilePhoto(base64Image);
      }
    } catch (error) {
      console.error('Error choosing photo:', error);
      Alert.alert('Error', error.message || 'Failed to select photo');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}>
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.avatar}
            onPress={handleAddPhoto}
            disabled={isSaving}>
            {profilePhoto ? (
              <Image
                source={{uri: base64ToDataUri(profilePhoto)}}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {displayName ? displayName[0].toUpperCase() : '?'}
              </Text>
            )}
            <View style={styles.cameraIcon}>
              <Text style={styles.cameraIconText}>📷</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="How should neighbors know you?"
            placeholderTextColor="#8E8E93"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!isSaving}
            autoFocus={false}
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
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={isSaving}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 24,
  },
  content: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
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
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F2F2F7',
  },
  cameraIconText: {
    fontSize: 18,
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
    marginBottom: 24,
    width: '100%',
    backgroundColor: 'white',
  },
  photoButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
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
    marginBottom: 12,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default ProfileEditScreen;

