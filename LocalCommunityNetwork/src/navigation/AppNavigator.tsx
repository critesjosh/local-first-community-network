import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

// Screens
import HomeScreen from '../screens/HomeScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ConnectionScanScreen from '../screens/ConnectionScanScreen';
import ConnectionDetailScreen from '../screens/ConnectionDetailScreen';

// Type imports
import {RootStackParamList, MainTabParamList} from '../types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Feed',
        }}
      />
      <Tab.Screen
        name="Connections"
        component={ConnectionsScreen}
        options={{
          title: 'Connections',
        }}
      />
      <Tab.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{
          title: 'New Event',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default AppNavigator;