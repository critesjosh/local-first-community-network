import React from 'react';
import {render} from '@testing-library/react-native';
import CreateEventScreen from '../../src/screens/CreateEventScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as any;

// Mock services - these are integration points we don't need to test in unit tests
jest.mock('../../src/services/crypto/EncryptionService');
jest.mock('../../src/services/ConnectionService');
jest.mock('../../src/services/IdentityService');
jest.mock('../../src/services/storage/Database');
jest.mock('../../src/utils/crypto');

describe('CreateEventScreen', () => {
  it('should render the screen', () => {
    const {getAllByText, getByText, getByPlaceholderText} = render(
      <CreateEventScreen navigation={mockNavigation} route={{} as any} />,
    );

    // Verify key UI elements are rendered (title appears twice - header and button)
    const createEventTexts = getAllByText('Create Event');
    expect(createEventTexts.length).toBeGreaterThan(0);
    expect(
      getByText("Share what's happening in your neighborhood"),
    ).toBeTruthy();
    expect(getByPlaceholderText("What's happening?")).toBeTruthy();
    expect(getByPlaceholderText('Where is it? (optional)')).toBeTruthy();
    expect(
      getByPlaceholderText('Tell neighbors more about the event (optional)'),
    ).toBeTruthy();
  });

  it('should have form fields with correct properties', () => {
    const {getByPlaceholderText} = render(
      <CreateEventScreen navigation={mockNavigation} route={{} as any} />,
    );

    const titleInput = getByPlaceholderText("What's happening?");
    const descriptionInput = getByPlaceholderText(
      'Tell neighbors more about the event (optional)',
    );
    const locationInput = getByPlaceholderText('Where is it? (optional)');

    // Check maxLength constraints
    expect(titleInput.props.maxLength).toBe(100);
    expect(descriptionInput.props.maxLength).toBe(500);
    expect(locationInput.props.maxLength).toBe(200);

    // Check multiline
    expect(descriptionInput.props.multiline).toBe(true);
  });

  it('should display date time picker button', () => {
    const {getAllByText} = render(
      <CreateEventScreen navigation={mockNavigation} route={{} as any} />,
    );

    // Date time should be displayed
    const changeTimeButton = getAllByText('Change Time');
    expect(changeTimeButton.length).toBeGreaterThan(0);
  });

  it('should display photo picker button', () => {
    const {getByText} = render(
      <CreateEventScreen navigation={mockNavigation} route={{} as any} />,
    );

    expect(getByText('Tap to add a photo (optional)')).toBeTruthy();
  });

  it('should have required field markers', () => {
    const {getAllByText} = render(
      <CreateEventScreen navigation={mockNavigation} route={{} as any} />,
    );

    // Check for required markers (*)
    const requiredMarkers = getAllByText('*');
    expect(requiredMarkers.length).toBeGreaterThanOrEqual(2); // Title and Date/Time are required
  });
});

// Note: Full integration tests for form submission, validation, and service integration
// would be better tested in E2E tests or with more sophisticated mocking of React Native
// components like DateTimePicker. These unit tests focus on verifying the UI renders correctly.
