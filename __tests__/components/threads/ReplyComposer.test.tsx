/**
 * Tests for ReplyComposer Component
 */

import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import ReplyComposer from '../../../src/components/threads/ReplyComposer';

describe('ReplyComposer', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();
  const threadId = 'thread-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render when visible', () => {
    const {getByText, getByPlaceholderText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    expect(getByText('Reply to Thread')).toBeTruthy();
    expect(getByPlaceholderText('Write your reply...')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Post Reply')).toBeTruthy();
  });

  it('should not render when not visible', () => {
    const {queryByText} = render(
      <ReplyComposer
        visible={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    expect(queryByText('Reply to Thread')).toBeNull();
  });

  it('should call onClose when close button pressed', () => {
    const {getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const closeButton = getByText('✕');
    fireEvent.press(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when cancel button pressed', () => {
    const {getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const cancelButton = getByText('Cancel');
    fireEvent.press(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should update text input value', () => {
    const {getByPlaceholderText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply content');

    expect(textInput.props.value).toBe('Test reply content');
  });

  it('should disable submit button when content is empty', () => {
    const {getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const submitButton = getByText('Post Reply').parent;
    expect(submitButton?.props.disabled).toBe(true);
  });

  it('should enable submit button when content is not empty', () => {
    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply').parent;
    expect(submitButton?.props.disabled).toBe(false);
  });

  it('should disable submit button for whitespace-only content', () => {
    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, '   '); // Only whitespace

    const submitButton = getByText('Post Reply').parent;
    expect(submitButton?.props.disabled).toBe(true);
  });

  it('should call onSubmit with trimmed content when submit pressed', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, '  Test reply  ');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('Test reply');
    });
  });

  it('should close modal after successful submit', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('should clear content after successful submit', async () => {
    mockOnSubmit.mockResolvedValue(undefined);

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(textInput.props.value).toBe('');
    });
  });

  it('should show loading indicator while submitting', async () => {
    const delayedSubmit = jest.fn(
      () => new Promise(resolve => setTimeout(resolve, 100)),
    );

    const {getByPlaceholderText, getByText, UNSAFE_queryByType} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={delayedSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    // Should show ActivityIndicator while submitting
    const activityIndicator = UNSAFE_queryByType(
      require('react-native').ActivityIndicator,
    );
    expect(activityIndicator).toBeTruthy();

    await waitFor(() => {
      expect(delayedSubmit).toHaveBeenCalled();
    });
  });

  it('should disable all buttons while submitting', async () => {
    const delayedSubmit = jest.fn(
      () => new Promise(resolve => setTimeout(resolve, 100)),
    );

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={delayedSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    // All buttons should be disabled while submitting
    const cancelButton = getByText('Cancel').parent;
    const closeButton = getByText('✕').parent;
    const submitButtonParent = submitButton.parent;

    expect(cancelButton?.props.disabled).toBe(true);
    expect(closeButton?.props.disabled).toBe(true);
    expect(submitButtonParent?.props.disabled).toBe(true);

    await waitFor(() => {
      expect(delayedSubmit).toHaveBeenCalled();
    });
  });

  it('should not close on submit error', async () => {
    mockOnSubmit.mockRejectedValue(new Error('Network error'));

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    // Should not close on error
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should not clear content on submit error', async () => {
    mockOnSubmit.mockRejectedValue(new Error('Network error'));

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    // Content should be preserved on error
    expect(textInput.props.value).toBe('Test reply');
  });

  it('should prevent multiple submissions', async () => {
    const delayedSubmit = jest.fn(
      () => new Promise(resolve => setTimeout(resolve, 100)),
    );

    const {getByPlaceholderText, getByText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={delayedSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    fireEvent.changeText(textInput, 'Test reply');

    const submitButton = getByText('Post Reply');

    // Press submit multiple times
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(delayedSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle multiline content', () => {
    const {getByPlaceholderText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    const multilineContent = 'Line 1\nLine 2\nLine 3';
    fireEvent.changeText(textInput, multilineContent);

    expect(textInput.props.value).toBe(multilineContent);
  });

  it('should handle unicode and emojis', () => {
    const {getByPlaceholderText} = render(
      <ReplyComposer
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        threadId={threadId}
      />,
    );

    const textInput = getByPlaceholderText('Write your reply...');
    const unicodeContent = 'Hello 世界! 🌍 🎉';
    fireEvent.changeText(textInput, unicodeContent);

    expect(textInput.props.value).toBe(unicodeContent);
  });
});
