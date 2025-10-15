/**
 * Navigation type definitions for React Navigation
 */

import {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';

/**
 * Root Stack Navigator param list
 */
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  ConnectionScan: undefined;
  ConnectionDetail: {connectionId: string};
};

/**
 * Main Tab Navigator param list
 */
export type MainTabParamList = {
  Home: undefined;
  Connections: undefined;
  CreateEvent: undefined;
  Profile: undefined;
  Settings: undefined;
};

/**
 * Screen props for Root Stack screens
 */
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  StackScreenProps<RootStackParamList, T>;

/**
 * Screen props for Main Tab screens
 */
export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;
