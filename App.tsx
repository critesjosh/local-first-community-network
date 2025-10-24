/**
 * Local Community Network
 * Privacy-first neighborhood event discovery
 */

import React, {useEffect, useState} from 'react';
import 'react-native-gesture-handler';
import {ActivityIndicator, View, StyleSheet} from 'react-native';
import * as Updates from 'expo-updates';
import {Buffer} from 'buffer';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import IdentityService from './src/services/IdentityService';
import BLEBroadcastService from './src/services/bluetooth/BLEBroadcastService';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasIdentity, setHasIdentity] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check for EAS updates and reload if available
      await checkForUpdates();

      // Initialize identity service
      await IdentityService.init();

      // Check if user has identity
      const identityExists = await IdentityService.hasIdentity();
      setHasIdentity(identityExists);

      if (identityExists) {
        await startBroadcasting();
      }
    } catch (error) {
      console.error('App initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkForUpdates = async () => {
    try {
      if (__DEV__) {
        // Skip update checks in development
        return;
      }

      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        console.log('Update available, downloading...');
        await Updates.fetchUpdateAsync();
        console.log('Update downloaded, reloading app...');
        await Updates.reloadAsync();
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  };

  const startBroadcasting = async () => {
    try {
      const user = await IdentityService.getCurrentUser();
      const identity = IdentityService.getCurrentIdentity();
      
      if (user && identity) {
        console.log('🚀 Starting BLE broadcasting for user:', user.displayName);
        
        // Build full profile for GATT server
        const fullProfile = {
          userId: user.id,
          displayName: user.displayName,
          publicKey: Buffer.from(identity.publicKey).toString('base64'),
          profilePhoto: user.profilePhoto,
        };
        
        await BLEBroadcastService.start(
          {
            userId: user.id,
            displayName: user.displayName,
          },
          fullProfile
        );
        console.log('✅ BLE broadcasting started successfully');
      } else {
        console.error('❌ Cannot start broadcasting: missing user or identity');
      }
    } catch (error) {
      console.error('❌ Failed to start BLE broadcasting:', error);
      
      // Provide user-friendly error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('permission')) {
        console.error('💡 Please grant Bluetooth permissions in device settings');
      } else if (errorMessage.includes('powered off')) {
        console.error('💡 Please turn on Bluetooth in device settings');
      } else if (errorMessage.includes('not enabled')) {
        console.error('💡 Please enable Bluetooth in device settings');
      } else if (errorMessage.includes('not available')) {
        console.error('💡 Bluetooth is not available on this device');
      } else if (errorMessage.includes('initializing')) {
        console.log('⏳ Bluetooth is still initializing...');
      } else {
        console.error('💡 BLE advertising failed:', errorMessage);
      }
    }
  };

  const handleOnboardingComplete = async () => {
    setHasIdentity(true);
    await startBroadcasting();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!hasIdentity) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return <AppNavigator />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
});

export default App;
