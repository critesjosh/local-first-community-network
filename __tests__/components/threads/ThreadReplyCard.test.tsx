/**
 * Tests for ThreadReplyCard Component
 */

import React from 'react';
import {render} from '@testing-library/react-native';
import ThreadReplyCard from '../../../src/components/threads/ThreadReplyCard';
import {ThreadReply} from '../../../src/types/models';

describe('ThreadReplyCard', () => {
  const mockReply: ThreadReply = {
    id: 'reply-123',
    threadId: 'thread-456',
    authorId: 'author-789',
    content: 'This is a test reply',
    createdAt: new Date('2025-10-01T10:00:00Z'),
  };

  it('should render reply content', () => {
    const {getByText} = render(
      <ThreadReplyCard
        reply={mockReply}
        authorName="Alice"
      />,
    );

    expect(getByText('This is a test reply')).toBeTruthy();
  });

  it('should render author name', () => {
    const {getByText} = render(
      <ThreadReplyCard
        reply={mockReply}
        authorName="Bob"
      />,
    );

    expect(getByText('Bob')).toBeTruthy();
  });

  it('should render author initial when no photo provided', () => {
    const {getByText} = render(
      <ThreadReplyCard
        reply={mockReply}
        authorName="Charlie"
      />,
    );

    expect(getByText('C')).toBeTruthy();
  });

  it('should render time ago for recent reply', () => {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    const recentReply: ThreadReply = {
      ...mockReply,
      createdAt: twoMinutesAgo,
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={recentReply}
        authorName="Alice"
      />,
    );

    expect(getByText('2m ago')).toBeTruthy();
  });

  it('should render "just now" for very recent reply', () => {
    const justNow = new Date();

    const veryRecentReply: ThreadReply = {
      ...mockReply,
      createdAt: justNow,
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={veryRecentReply}
        authorName="Alice"
      />,
    );

    expect(getByText('just now')).toBeTruthy();
  });

  it('should render hours ago for older replies', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const olderReply: ThreadReply = {
      ...mockReply,
      createdAt: threeHoursAgo,
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={olderReply}
        authorName="Alice"
      />,
    );

    expect(getByText('3h ago')).toBeTruthy();
  });

  it('should render days ago for very old replies', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const veryOldReply: ThreadReply = {
      ...mockReply,
      createdAt: twoDaysAgo,
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={veryOldReply}
        authorName="Alice"
      />,
    );

    expect(getByText('2d ago')).toBeTruthy();
  });

  it('should handle long reply content', () => {
    const longContent = 'This is a very long reply that contains a lot of text. '.repeat(10);
    const longReply: ThreadReply = {
      ...mockReply,
      content: longContent,
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={longReply}
        authorName="Alice"
      />,
    );

    expect(getByText(longContent)).toBeTruthy();
  });

  it('should handle unicode and emojis in content', () => {
    const unicodeReply: ThreadReply = {
      ...mockReply,
      content: 'Hello 世界! 🌍 🎉',
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={unicodeReply}
        authorName="Alice"
      />,
    );

    expect(getByText('Hello 世界! 🌍 🎉')).toBeTruthy();
  });

  it('should handle empty content', () => {
    const emptyReply: ThreadReply = {
      ...mockReply,
      content: '',
    };

    const {getByText} = render(
      <ThreadReplyCard
        reply={emptyReply}
        authorName="Alice"
      />,
    );

    // Author name should still be visible
    expect(getByText('Alice')).toBeTruthy();
  });

  it('should render with author photo when provided', () => {
    const {UNSAFE_getByType} = render(
      <ThreadReplyCard
        reply={mockReply}
        authorName="Alice"
        authorPhoto="base64encodedphoto"
      />,
    );

    // Check that Image component is rendered
    const images = UNSAFE_getByType(require('react-native').Image);
    expect(images).toBeTruthy();
  });
});
