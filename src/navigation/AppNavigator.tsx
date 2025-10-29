import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Text, View, Image} from 'react-native';
import IdentityService from '../services/IdentityService';
import {base64ToDataUri} from '../utils/imageUtils';

// Screens
import HomeScreen from '../screens/HomeScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';
import ConnectScreen from '../screens/ConnectScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProfileEditScreen from '../screens/ProfileEditScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ConnectionScanScreen from '../screens/ConnectionScanScreen';
import ConnectionDetailScreen from '../screens/ConnectionDetailScreen';

// Type imports
import {RootStackParamList, MainTabParamList} from '../types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

const MainTabs = () => {
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>();

  useEffect(() => {
    const loadProfilePhoto = async () => {
      const user = await IdentityService.getCurrentUser();
      if (user?.profilePhoto) {
        setProfilePhoto(user.profilePhoto);
      }
    };
    loadProfilePhoto();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: false,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Feed',
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 24, color}}>☰</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Connections"
        component={ConnectionsScreen}
        options={{
          title: 'Connections',
          headerShown: false,
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 24, color}}>👥</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Connect"
        component={ConnectScreen}
        options={{
          title: 'Connect',
          headerShown: true,
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 24, color}}>🪩</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({color, size}) => {
            if (profilePhoto) {
              return (
                <Image
                  source={{uri: base64ToDataUri(profilePhoto)}}
                  style={{
                    width: size || 24,
                    height: size || 24,
                    borderRadius: (size || 24) / 2,
                    borderWidth: 1,
                    borderColor: color,
                  }}
                />
              );
            }
            return (
              <View
                style={{
                  width: size || 24,
                  height: size || 24,
                  borderRadius: (size || 24) / 2,
                  borderWidth: 2,
                  borderColor: color,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{fontSize: 12, color}}>👤</Text>
              </View>
            );
          },
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 24, color}}>⚙️</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="ConnectionScan"
            component={ConnectionScanScreen}
            options={{presentation: 'modal'}}
          />
          <Stack.Screen
            name="ConnectionDetail"
            component={ConnectionDetailScreen}
          />
          <Stack.Screen
            name="ProfileEdit"
            component={ProfileEditScreen}
            options={{
              presentation: 'modal',
              headerShown: true,
              headerTitle: 'Edit Profile',
              headerBackTitle: 'Back',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default AppNavigator;