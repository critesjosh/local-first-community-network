import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IdentityService from '../services/IdentityService';
import {Bluetooth} from '@localcommunity/rn-bluetooth';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({onComplete}) => {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateIdentity = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name Required', 'Please enter a display name');
      return;
    }

    setIsCreating(true);
    try {
      // Create identity first
      await IdentityService.createIdentity(displayName.trim());

      // Request Bluetooth permissions
      console.log('Requesting Bluetooth permissions...');
      const hasPermissions = await Bluetooth.requestPermissions();

      if (!hasPermissions) {
        Alert.alert(
          'Bluetooth Permissions Required',
          'This app needs Bluetooth permissions to discover nearby neighbors. Please grant permissions in your device settings.',
          [
            {text: 'Open Settings', onPress: () => Linking.openSettings()},
            {text: 'Continue Anyway', onPress: () => onComplete()},
          ]
        );
        return;
      }

      console.log('Bluetooth permissions granted');
      onComplete();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert(
        'Identity Creation Failed',
        `There was an error creating your identity:\n\n${errorMessage}\n\nPlease check the console for details and try again.`,
      );
      console.error('Identity creation error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>🔐</Text>
            <Text style={styles.stepTitle}>True Privacy</Text>
            <Text style={styles.stepDescription}>
              Your identity is secured with cryptographic keys generated on this device.
              No email, no phone number, no tracking.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setStep(1)}>
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>🤝</Text>
            <Text style={styles.stepTitle}>In-Person Connections</Text>
            <Text style={styles.stepDescription}>
              Connect with neighbors by tapping phones together via Bluetooth.
              Only real, verified connections can see your events.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setStep(2)}>
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep(0)}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.emoji}>📅</Text>
            <Text style={styles.stepTitle}>Local Events</Text>
            <Text style={styles.stepDescription}>
              Discover what's happening in your neighborhood. Block parties,
              garage sales, skill shares - all encrypted and private.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setStep(3)}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep(1)}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        );

      case 3:
        return (
          <KeyboardAvoidingView
            style={styles.stepContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Text style={styles.emoji}>👤</Text>
            <Text style={styles.stepTitle}>Choose Your Name</Text>
            <Text style={styles.stepDescription}>
              How should your neighbors know you? You can change this later.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Display Name"
              placeholderTextColor="#8E8E93"
              value={displayName}
              onChangeText={setDisplayName}
              autoFocus
              maxLength={50}
              editable={!isCreating}
            />

            <TouchableOpacity
              style={[
                styles.primaryButton,
                isCreating && styles.disabledButton,
              ]}
              onPress={handleCreateIdentity}
              disabled={isCreating}>
              {isCreating ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Identity</Text>
              )}
            </TouchableOpacity>

            {!isCreating && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setStep(2)}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            )}
          </KeyboardAvoidingView>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressContainer}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i === step && styles.progressDotActive,
              i < step && styles.progressDotCompleted,
            ]}
          />
        ))}
      </View>
      {renderStep()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C7C7CC',
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: '#34C759',
  },
  stepContainer: {
    flex: 1,
    padding: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 72,
    marginBottom: 32,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 16,
    color: '#3C3C43',
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 24,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 24,
    backgroundColor: 'white',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default OnboardingScreen;