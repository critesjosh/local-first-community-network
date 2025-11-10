import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {MainTabScreenProps} from '../types/navigation';
import {Event} from '../types/models';
import EncryptionService from '../services/crypto/EncryptionService';
import ConnectionService from '../services/ConnectionService';
import IdentityService from '../services/IdentityService';
import PostStorageService from '../services/storage/PostStorageService';
import {generateUUID} from '../utils/crypto';

type Props = MainTabScreenProps<'CreateEvent'>;

const CreateEventScreen = ({navigation}: Props) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): boolean => {
    if (!content.trim()) {
      Alert.alert('Validation Error', 'Please enter some content for your post.');
      return false;
    }

    return true;
  };

  const handleCreatePost = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const currentUser = await IdentityService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No user identity found');
      }

      // Get all connections
      const connections = await ConnectionService.getConnections();

      // Require at least one connection
      if (connections.length === 0) {
        Alert.alert(
          'No Connections',
          'You need at least one connection to create a post. Please add a connection first.',
          [
            {
              text: 'Add Connection',
              onPress: () => navigation.navigate('Connections'),
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
        );
        return;
      }

      // Create post object
      const event: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
      } = {
        id: generateUUID(),
        authorId: currentUser.id,
        content: content.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Encrypt post for all connections
      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        connections,
      );

      // Save encrypted post using storage provider
      await PostStorageService.publishPost(encryptedEvent);

      // Success!
      const successMessage = `Your post has been created and shared with ${connections.length} ${
        connections.length === 1 ? 'connection' : 'connections'
      }.`;

      Alert.alert(
        'Post Created!',
        successMessage,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setContent('');
              // Navigate to home
              navigation.navigate('Home');
            },
          },
        ],
      );
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert(
        'Error',
        'Failed to create post. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <View style={styles.headerSection}>
            <Text style={styles.title}>Create Event</Text>
            <Text style={styles.subtitle}>
              Share what's happening in your neighborhood
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>
              What's on your mind? <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Write your post here..."
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={8}
              value={content}
              onChangeText={setContent}
              maxLength={2000}
              textAlignVertical="top"
            />

            <Text style={styles.characterCount}>
              {content.length} / 2000
            </Text>

            <TouchableOpacity
              style={[
                styles.createButton,
                isSubmitting && styles.createButtonDisabled,
              ]}
              onPress={handleCreatePost}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.createButtonText}>Post</Text>
              )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  content: {
    paddingHorizontal: 20,
  },
  headerSection: {
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  form: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    height: 200,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'right',
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  createButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  createButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  required: {
    color: '#FF3B30',
  },
});

export default CreateEventScreen;
