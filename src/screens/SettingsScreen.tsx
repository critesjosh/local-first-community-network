import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

const SettingsScreen = () => {
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
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
  settingLabel: {
    fontSize: 16,
    color: '#000',
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
