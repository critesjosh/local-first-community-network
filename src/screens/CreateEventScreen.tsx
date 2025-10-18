import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import {MainTabScreenProps} from '../types/navigation';
import {Event} from '../types/models';
import EncryptionService from '../services/crypto/EncryptionService';
import ConnectionService from '../services/ConnectionService';
import IdentityService from '../services/IdentityService';
import Database from '../services/storage/Database';
import {generateUUID} from '../utils/crypto';

type Props = MainTabScreenProps<'CreateEvent'>;

const CreateEventScreen = ({navigation}: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [datetime, setDatetime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>();
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const newDate = new Date(datetime);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      setDatetime(newDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const newDate = new Date(datetime);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setDatetime(newDate);
    }
  };

  const handlePickImage = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to add images to events.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      });

      if (result.canceled) {
        return;
      }

      if (result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setPhoto(asset.base64);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const validateForm = (): boolean => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter an event title.');
      return false;
    }

    if (datetime <= new Date()) {
      Alert.alert('Validation Error', 'Please select a future date and time.');
      return false;
    }

    return true;
  };

  const handleCreateEvent = async () => {
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
      if (connections.length === 0) {
        Alert.alert(
          'No Connections',
          'You need to connect with at least one person to share events. Would you like to add a connection now?',
          [
            {text: 'Later', style: 'cancel'},
            {
              text: 'Add Connection',
              onPress: () => {
                navigation.navigate('Connections');
              },
            },
          ],
        );
        setIsSubmitting(false);
        return;
      }

      // Create event object
      const event: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
      } = {
        id: generateUUID(),
        authorId: currentUser.id,
        title: title.trim(),
        description: description.trim() || undefined,
        datetime,
        location: location.trim() || undefined,
        photo,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Encrypt event for all connections
      const encryptedEvent = await EncryptionService.encryptEvent(
        event,
        connections,
      );

      // Save encrypted event to database
      await Database.saveEncryptedEvent(encryptedEvent);

      // Success!
      Alert.alert(
        'Event Created!',
        `Your event "${title}" has been created and shared with ${connections.length} ${
          connections.length === 1 ? 'connection' : 'connections'
        }.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setTitle('');
              setDescription('');
              setLocation('');
              setDatetime(new Date());
              setPhoto(undefined);
              setPhotoUri(undefined);
              // Navigate to home
              navigation.navigate('Home');
            },
          },
        ],
      );
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert(
        'Error',
        'Failed to create event. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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
          <Text style={styles.title}>Create Event</Text>
          <Text style={styles.subtitle}>
            Share what's happening in your neighborhood
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>
              Event Title <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="What's happening?"
              placeholderTextColor="#8E8E93"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />

            <Text style={styles.label}>
              Date & Time <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateTimeButtonText}>
                  {formatDateTime(datetime)}
                </Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={datetime}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={datetime}
                mode="time"
                display="default"
                onChange={handleTimeChange}
              />
            )}

            <TouchableOpacity
              style={styles.changeTimeButton}
              onPress={() => setShowTimePicker(true)}>
              <Text style={styles.changeTimeButtonText}>Change Time</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Where is it? (optional)"
              placeholderTextColor="#8E8E93"
              value={location}
              onChangeText={setLocation}
              maxLength={200}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Tell neighbors more about the event (optional)"
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />

            <Text style={styles.label}>Photo</Text>
            <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
              {photoUri ? (
                <Image source={{uri: photoUri}} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>
                    Tap to add a photo (optional)
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {photoUri && (
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => {
                  setPhoto(undefined);
                  setPhotoUri(undefined);
                }}>
                <Text style={styles.removePhotoButtonText}>Remove Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.createButton,
                isSubmitting && styles.createButtonDisabled,
              ]}
              onPress={handleCreateEvent}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.createButtonText}>Create Event</Text>
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
    paddingTop: 60,
    paddingBottom: 60,
  },
  content: {
    padding: 20,
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
    marginBottom: 20,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
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
  dateTimeContainer: {
    marginBottom: 8,
  },
  dateTimeButton: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'white',
  },
  dateTimeButtonText: {
    fontSize: 16,
    color: '#000',
  },
  changeTimeButton: {
    marginBottom: 20,
    padding: 8,
  },
  changeTimeButtonText: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'center',
  },
  photoButton: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  removePhotoButton: {
    padding: 8,
    marginBottom: 20,
  },
  removePhotoButtonText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
  },
});

export default CreateEventScreen;
