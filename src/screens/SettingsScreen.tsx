import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Database from '../services/storage/Database';

const SettingsScreen = () => {
  const [autoAcceptConnections, setAutoAcceptConnections] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const autoAccept = await Database.getAutoAcceptConnections();
      setAutoAcceptConnections(autoAccept);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAcceptToggle = async (value: boolean) => {
    try {
      setAutoAcceptConnections(value);
      await Database.setAutoAcceptConnections(value);

      const message = value
        ? 'Connection requests will be automatically accepted.'
        : 'You will need to manually approve connection requests.';

      Alert.alert('Setting Updated', message);
    } catch (error) {
      console.error('Error updating auto-accept setting:', error);
      setAutoAcceptConnections(!value); // Revert on error
      Alert.alert('Error', 'Failed to update setting. Please try again.');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your connections, events, and messages. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Clear', style: 'destructive', onPress: () => {}},
      ],
    );
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
          <Text style={styles.title}>Settings</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connections</Text>
            <TouchableOpacity style={styles.settingItem}>
              <Text style={styles.settingLabel}>View All Connections</Text>
              <Text style={styles.settingValue}>0 connections</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy & Security</Text>
            <View style={styles.settingItem}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Auto-Accept Connections</Text>
                <Text style={styles.settingDescription}>
                  Automatically accept connection requests from nearby users
                </Text>
              </View>
              <Switch
                value={autoAcceptConnections}
                onValueChange={handleAutoAcceptToggle}
                trackColor={{false: '#D1D1D6', true: '#34C759'}}
                thumbColor={'white'}
                disabled={loading}
              />
            </View>
            <TouchableOpacity style={styles.settingItem}>
              <Text style={styles.settingLabel}>Export Data</Text>
              <Text style={styles.settingValue}>JSON</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Version</Text>
              <Text style={styles.settingValue}>0.0.1 (MVP)</Text>
            </View>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Build</Text>
              <Text style={styles.settingValue}>Development</Text>
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
              <Text style={styles.dangerButtonText}>Clear All Data</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Local Community Network
            </Text>
            <Text style={styles.footerSubtext}>
              Privacy-first neighborhood connections
            </Text>
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
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 16,
  },
  settingItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#000',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  settingValue: {
    fontSize: 16,
    color: '#8E8E93',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 14,
    color: '#8E8E93',
  },
});

export default SettingsScreen;
