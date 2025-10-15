/**
 * Local Community Network
 * Privacy-first neighborhood event discovery
 */

import React, {useEffect, useState} from 'react';
import 'react-native-gesture-handler';
import {ActivityIndicator, View, StyleSheet} from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import IdentityService from './src/services/IdentityService';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasIdentity, setHasIdentity] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize identity service
      await IdentityService.init();

      // Check if user has identity
      const identityExists = await IdentityService.hasIdentity();
      setHasIdentity(identityExists);
    } catch (error) {
      console.error('App initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingComplete = () => {
    setHasIdentity(true);
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
