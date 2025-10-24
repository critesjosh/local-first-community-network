/**
 * Tests for RESTPostStorage
 */

import '../../../__tests__/setup';
import RESTPostStorage from '../../../src/services/storage/RESTPostStorage';
import {EncryptedEvent} from '../../../src/services/crypto/EncryptionService';

// Mock fetch
global.fetch = jest.fn();

// Mock IdentityService
const mockGetKeyPair = jest.fn();
jest.mock('../../../src/services/IdentityService', () => ({
  getKeyPair: mockGetKeyPair,
}));

// Mock KeyManager
const mockSignData = jest.fn();
jest.mock('../../../src/services/crypto/KeyManager', () => {
  return jest.fn().mockImplementation(() => ({
    signData: mockSignData,
  }));
});

describe('RESTPostStorage', () => {
  let storage: RESTPostStorage;
  const mockApiUrl = 'http://localhost:3000';
  const mockKeyPair = {
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(64).fill(2),
  };
  const mockSignature = new Uint8Array(64).fill(3);

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new RESTPostStorage({
      type: 'rest',
      apiUrl: mockApiUrl,
    });

    // Mock IdentityService.getKeyPair()
    mockGetKeyPair.mockResolvedValue(mockKeyPair);

    // Mock KeyManager.signData()
    mockSignData.mockResolvedValue(mockSignature);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should throw error if apiUrl is not provided', () => {
      expect(() => {
        new RESTPostStorage({type: 'rest'});
      }).toThrow('RESTPostStorage requires apiUrl in config');
    });

    it('should create instance with valid config', () => {
      const instance = new RESTPostStorage({
        type: 'rest',
        apiUrl: mockApiUrl,
      });
      expect(instance).toBeInstanceOf(RESTPostStorage);
    });
  });

  describe('publishPost', () => {
    const mockEvent: EncryptedEvent = {
      id: 'event-1',
      authorId: 'author-123',
      timestamp: Date.now(),
      encryptedContent: 'encrypted-content',
      iv: 'initialization-vector',
      wrappedKeys: {
        'recipient-1': {
          wrappedKey: 'wrapped-key-1',
          keyWrapIV: 'key-wrap-iv-1',
        },
      },
    };

    it('should successfully publish post with valid signature', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({postId: 'post-123', createdAt: new Date().toISOString()}),
      });

      await storage.publishPost(mockEvent);

      // Verify fetch was called
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];

      // Verify URL
      expect(url).toBe(`${mockApiUrl}/api/posts`);

      // Verify method
      expect(options.method).toBe('POST');

      // Verify headers include signature and timestamp
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Signature']).toBeDefined();
      expect(options.headers['X-Timestamp']).toBeDefined();

      // Verify body is the encrypted event
      const body = JSON.parse(options.body);
      expect(body).toEqual(mockEvent);

      // Verify signature was created
      expect(mockSignData).toHaveBeenCalledTimes(1);
    });

    it('should throw error if no key pair available', async () => {
      mockGetKeyPair.mockResolvedValue(null);

      await expect(storage.publishPost(mockEvent)).rejects.toThrow(
        'Cannot publish: No key pair available'
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should throw error if API returns 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({error: 'Invalid signature'}),
      });

      await expect(storage.publishPost(mockEvent)).rejects.toThrow(
        'Failed to publish post: 401 Unauthorized'
      );
    });

    it('should throw error if API returns 500', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({error: 'Database error'}),
      });

      await expect(storage.publishPost(mockEvent)).rejects.toThrow(
        'Failed to publish post: 500 Internal Server Error'
      );
    });

    it('should sign message with correct format: authorId:timestamp:bodyHash', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({postId: 'post-123'}),
      });

      await storage.publishPost(mockEvent);

      // Verify signData was called with correct message format
      const signDataCall = mockSignData.mock.calls[0];
      const messageBytes = signDataCall[0];
      const message = new TextDecoder().decode(messageBytes);

      // Message should be: authorId:timestamp:bodyHash
      expect(message).toMatch(/^author-123:\d+:[a-f0-9]{64}$/);
    });

    it('should include current timestamp within reasonable range', async () => {
      const beforeCall = Date.now();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({postId: 'post-123'}),
      });

      await storage.publishPost(mockEvent);

      const afterCall = Date.now();

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const timestamp = parseInt(options.headers['X-Timestamp'], 10);

      expect(timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(timestamp).toBeLessThanOrEqual(afterCall);
    });
  });

  describe('fetchPosts', () => {
    const mockPosts: EncryptedEvent[] = [
      {
        id: 'event-1',
        authorId: 'author-123',
        timestamp: Date.now(),
        encryptedContent: 'encrypted-1',
        iv: 'iv-1',
        wrappedKeys: {},
      },
      {
        id: 'event-2',
        authorId: 'author-456',
        timestamp: Date.now(),
        encryptedContent: 'encrypted-2',
        iv: 'iv-2',
        wrappedKeys: {},
      },
    ];

    it('should fetch posts with since parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: mockPosts}),
      });

      const since = Date.now() - 86400000; // 24 hours ago
      const result = await storage.fetchPosts(since);

      expect(result).toEqual(mockPosts);

      // Verify fetch was called with correct URL
      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain(`${mockApiUrl}/api/posts`);
      expect(url).toContain(`since=${since}`);
    });

    it('should fetch posts with limit parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: mockPosts}),
      });

      const since = Date.now() - 86400000;
      const limit = 10;
      await storage.fetchPosts(since, limit);

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain(`limit=${limit}`);
    });

    it('should throw error if API returns error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(storage.fetchPosts(0)).rejects.toThrow(
        'Failed to fetch posts: 500 Internal Server Error'
      );
    });

    it('should return empty array if no posts', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: []}),
      });

      const result = await storage.fetchPosts(0);
      expect(result).toEqual([]);
    });
  });

  describe('subscribeToPosts', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should poll immediately and at 30 second intervals', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: []}),
      });

      const callback = jest.fn();
      storage.subscribeToPosts([], callback);

      // Should poll immediately
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Advance time by another 30 seconds
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should call callback for each new post', async () => {
      const mockPosts: EncryptedEvent[] = [
        {
          id: 'event-1',
          authorId: 'author-123',
          timestamp: Date.now(),
          encryptedContent: 'encrypted-1',
          iv: 'iv-1',
          wrappedKeys: {},
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: mockPosts}),
      });

      const callback = jest.fn();
      storage.subscribeToPosts([], callback);

      await Promise.resolve();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockPosts[0]);
    });

    it('should filter posts by userIds when provided', async () => {
      const mockPosts: EncryptedEvent[] = [
        {
          id: 'event-1',
          authorId: 'author-123',
          timestamp: Date.now(),
          encryptedContent: 'encrypted-1',
          iv: 'iv-1',
          wrappedKeys: {},
        },
        {
          id: 'event-2',
          authorId: 'author-456',
          timestamp: Date.now(),
          encryptedContent: 'encrypted-2',
          iv: 'iv-2',
          wrappedKeys: {},
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: mockPosts}),
      });

      const callback = jest.fn();
      storage.subscribeToPosts(['author-123'], callback);

      await Promise.resolve();

      // Should only call callback for author-123
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockPosts[0]);
    });

    it('should continue polling despite errors', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({posts: []}),
        });

      const callback = jest.fn();
      storage.subscribeToPosts([], callback);

      await Promise.resolve();

      // First call failed, but should continue
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe when unsubscribe function is called', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({posts: []}),
      });

      const callback = jest.fn();
      const unsubscribe = storage.subscribeToPosts([], callback);

      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Advance time and verify no more calls
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still only 1
    });
  });

  describe('getProviderType', () => {
    it('should return "rest"', () => {
      expect(storage.getProviderType()).toBe('rest');
    });
  });
});
