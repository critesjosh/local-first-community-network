/**
 * Tests for Authentication Middleware
 */

import {Request, Response, NextFunction} from 'express';
import {verifySignature} from '../../middleware/authMiddleware.js';
import * as ed from '@noble/ed25519';
import {base58} from '@scure/base';
import {createHash} from 'crypto';

// Configure @noble/ed25519 for Node.js
ed.hashes.sha512 = (...m: Uint8Array[]) => {
  const input = Buffer.concat(m);
  return new Uint8Array(createHash('sha512').update(input).digest());
};

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  // Generate test key pair
  let testPrivateKey: Uint8Array;
  let testPublicKey: Uint8Array;
  let testAuthorId: string;

  beforeAll(async () => {
    testPrivateKey = ed.utils.randomPrivateKey();
    testPublicKey = await ed.getPublicKey(testPrivateKey);
    testAuthorId = base58.encode(testPublicKey);
  });

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({json: jsonMock});

    mockRequest = {
      headers: {},
      body: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();
  });

  describe('Valid signature', () => {
    it('should pass authentication with valid signature and timestamp', async () => {
      const timestamp = Date.now();
      const body = {
        authorId: testAuthorId,
        encryptedContent: 'test-content',
        iv: 'test-iv',
      };

      // Compute body hash
      const bodyJson = JSON.stringify(body);
      const bodyHash = createHash('sha256').update(bodyJson).digest('hex');

      // Create signature
      const message = `${testAuthorId}:${timestamp}:${bodyHash}`;
      const messageBytes = Buffer.from(message, 'utf8');
      const signature = await ed.sign(messageBytes, testPrivateKey);
      const signatureHex = Buffer.from(signature).toString('hex');

      // Set up request
      mockRequest.headers = {
        'x-signature': signatureHex,
        'x-timestamp': timestamp.toString(),
      };
      mockRequest.body = body;

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
    });

    it('should attach authorId and timestamp to request', async () => {
      const timestamp = Date.now();
      const body = {
        authorId: testAuthorId,
        encryptedContent: 'test-content',
      };

      const bodyJson = JSON.stringify(body);
      const bodyHash = createHash('sha256').update(bodyJson).digest('hex');
      const message = `${testAuthorId}:${timestamp}:${bodyHash}`;
      const messageBytes = Buffer.from(message, 'utf8');
      const signature = await ed.sign(messageBytes, testPrivateKey);

      mockRequest.headers = {
        'x-signature': Buffer.from(signature).toString('hex'),
        'x-timestamp': timestamp.toString(),
      };
      mockRequest.body = body;

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).authorId).toBe(testAuthorId);
      expect((mockRequest as any).timestamp).toBe(timestamp);
    });
  });

  describe('Missing headers', () => {
    it('should return 401 if X-Signature header is missing', async () => {
      mockRequest.headers = {
        'x-timestamp': Date.now().toString(),
      };
      mockRequest.body = {authorId: testAuthorId};

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Missing X-Signature header'});
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if X-Timestamp header is missing', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
      };
      mockRequest.body = {authorId: testAuthorId};

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Missing X-Timestamp header'});
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Invalid timestamp', () => {
    it('should return 400 if timestamp is not a valid number', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': 'not-a-number',
      };
      mockRequest.body = {authorId: testAuthorId};

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Invalid timestamp format'});
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if timestamp is too old (> 5 minutes)', async () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago

      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': oldTimestamp.toString(),
      };
      mockRequest.body = {authorId: testAuthorId};

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Request timestamp too old or too far in future',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if timestamp is too far in future (> 5 minutes)', async () => {
      const futureTimestamp = Date.now() + (6 * 60 * 1000); // 6 minutes in future

      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': futureTimestamp.toString(),
      };
      mockRequest.body = {authorId: testAuthorId};

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Request timestamp too old or too far in future',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept timestamp within 5 minute window', async () => {
      const recentTimestamp = Date.now() - (4 * 60 * 1000); // 4 minutes ago
      const body = {
        authorId: testAuthorId,
        encryptedContent: 'test',
      };

      const bodyJson = JSON.stringify(body);
      const bodyHash = createHash('sha256').update(bodyJson).digest('hex');
      const message = `${testAuthorId}:${recentTimestamp}:${bodyHash}`;
      const messageBytes = Buffer.from(message, 'utf8');
      const signature = await ed.sign(messageBytes, testPrivateKey);

      mockRequest.headers = {
        'x-signature': Buffer.from(signature).toString('hex'),
        'x-timestamp': recentTimestamp.toString(),
      };
      mockRequest.body = body;

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('Missing or invalid authorId', () => {
    it('should return 400 if authorId is missing from body', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': Date.now().toString(),
      };
      mockRequest.body = {
        encryptedContent: 'test',
      };

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Missing authorId in request body'});
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 400 if authorId is not valid base58', async () => {
      mockRequest.headers = {
        'x-signature': 'test-signature',
        'x-timestamp': Date.now().toString(),
      };
      mockRequest.body = {
        authorId: 'not-valid-base58!!!',
      };

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid authorId format (not valid base58)',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Invalid signature', () => {
    it('should return 401 if signature does not match', async () => {
      const timestamp = Date.now();
      const body = {
        authorId: testAuthorId,
        encryptedContent: 'test-content',
      };

      // Create a valid signature
      const bodyJson = JSON.stringify(body);
      const bodyHash = createHash('sha256').update(bodyJson).digest('hex');
      const message = `${testAuthorId}:${timestamp}:${bodyHash}`;
      const messageBytes = Buffer.from(message, 'utf8');
      const signature = await ed.sign(messageBytes, testPrivateKey);

      // Modify the signature to make it invalid
      const invalidSignature = Buffer.from(signature);
      invalidSignature[0] = invalidSignature[0] ^ 1; // Flip one bit

      mockRequest.headers = {
        'x-signature': invalidSignature.toString('hex'),
        'x-timestamp': timestamp.toString(),
      };
      mockRequest.body = body;

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Invalid signature'});
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if signature is for different body content', async () => {
      const timestamp = Date.now();
      const originalBody = {
        authorId: testAuthorId,
        encryptedContent: 'original-content',
      };

      // Sign original body
      const bodyJson = JSON.stringify(originalBody);
      const bodyHash = createHash('sha256').update(bodyJson).digest('hex');
      const message = `${testAuthorId}:${timestamp}:${bodyHash}`;
      const messageBytes = Buffer.from(message, 'utf8');
      const signature = await ed.sign(messageBytes, testPrivateKey);

      // But send different body
      const differentBody = {
        authorId: testAuthorId,
        encryptedContent: 'different-content',
      };

      mockRequest.headers = {
        'x-signature': Buffer.from(signature).toString('hex'),
        'x-timestamp': timestamp.toString(),
      };
      mockRequest.body = differentBody;

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Invalid signature'});
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if signature is for different timestamp', async () => {
      const originalTimestamp = Date.now();
      const body = {
        authorId: testAuthorId,
        encryptedContent: 'test-content',
      };

      // Sign with original timestamp
      const bodyJson = JSON.stringify(body);
      const bodyHash = createHash('sha256').update(bodyJson).digest('hex');
      const message = `${testAuthorId}:${originalTimestamp}:${bodyHash}`;
      const messageBytes = Buffer.from(message, 'utf8');
      const signature = await ed.sign(messageBytes, testPrivateKey);

      // But send different timestamp
      const differentTimestamp = originalTimestamp + 1000;

      mockRequest.headers = {
        'x-signature': Buffer.from(signature).toString('hex'),
        'x-timestamp': differentTimestamp.toString(),
      };
      mockRequest.body = body;

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({error: 'Invalid signature'});
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should return 500 if unexpected error occurs', async () => {
      // Create a request that will cause an error during verification
      mockRequest.headers = {
        'x-signature': 'invalid-hex',
        'x-timestamp': Date.now().toString(),
      };
      mockRequest.body = {
        authorId: testAuthorId,
      };

      await verifySignature(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error during authentication',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
