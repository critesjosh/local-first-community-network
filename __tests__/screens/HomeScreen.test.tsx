import React from 'react';
import {render} from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
} as any;

const mockRoute = {
  key: 'home',
  name: 'Home',
} as any;

// Mock services
jest.mock('../../src/services/storage/Database');
jest.mock('../../src/services/crypto/EncryptionService');
jest.mock('../../src/services/ConnectionService');

// Mock useFocusEffect
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

describe('HomeScreen', () => {
  it('should render the screen header', () => {
    const {getByText} = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />,
    );

    expect(getByText('Event Feed')).toBeTruthy();
    expect(
      getByText("Discover what's happening in your neighborhood"),
    ).toBeTruthy();
  });

  // Note: FlatList and RefreshControl are only rendered after loading completes
  // which requires mocking async behavior. Skipping these tests in favor of E2E tests.

  it('should have activity indicator during loading', () => {
    const {UNSAFE_queryByType} = render(
      <HomeScreen navigation={mockNavigation} route={mockRoute} />,
    );

    const ActivityIndicator = require('react-native').ActivityIndicator;
    const loader = UNSAFE_queryByType(ActivityIndicator);
    // Loading state is shown initially
    expect(loader).toBeTruthy();
  });
});

// Note: Full integration tests for event loading, decryption, RSVP, and other
// dynamic behaviors are better tested in E2E tests. These unit tests verify
// the component structure renders correctly.
