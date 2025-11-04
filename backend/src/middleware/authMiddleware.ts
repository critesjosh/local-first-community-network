/**
 * Authentication Middleware
 *
 * Verifies Ed25519 signatures on API requests to prevent unauthorized post creation.
 *
 * Authentication Flow:
 * 1. Client signs: `${authorId}:${timestamp}:${sha256(requestBody)}`
 * 2. Client sends signature in X-Signature header (hex-encoded)
 * 3. Client sends timestamp in X-Timestamp header
 * 4. Server verifies signature matches authorId's public key
 * 5. Server checks timestamp is within 5 minutes to prevent replay attacks
 */

import {Request, Response, NextFunction} from 'express';
import {createHash} from 'crypto';
import {base58} from '@scure/base';

// Configure @noble/ed25519 for Node.js (same as mobile app polyfill)
import * as ed from '@noble/ed25519';
ed.hashes.sha512 = (...m: Uint8Array[]) => {
  const input = Buffer.concat(m);
  return new Uint8Array(createHash('sha512').update(input).digest());
};

interface AuthenticatedRequest extends Request {
  authorId?: string;
  timestamp?: number;
}

/**
 * Verify Ed25519 signature on request
 */
export async function verifySignature(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract headers
    const signature = req.headers['x-signature'] as string;
    const timestampStr = req.headers['x-timestamp'] as string;

    if (!signature) {
      res.status(401).json({error: 'Missing X-Signature header'});
      return;
    }

    if (!timestampStr) {
      res.status(401).json({error: 'Missing X-Timestamp header'});
      return;
    }

    // Parse timestamp
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      res.status(400).json({error: 'Invalid timestamp format'});
      return;
    }

    // Check timestamp is within 5 minutes (prevent replay attacks)
    const now = Date.now();
    const timeDiff = Math.abs(now - timestamp);
    const FIVE_MINUTES = 5 * 60 * 1000;

    if (timeDiff > FIVE_MINUTES) {
      res.status(401).json({
        error: 'Request timestamp too old or too far in future',
        timestamp,
        serverTime: now,
        diff: timeDiff,
      });
      return;
    }

    // Extract authorId from request body
    const {authorId} = req.body;
    if (!authorId) {
      res.status(400).json({error: 'Missing authorId in request body'});
      return;
    }

    // Decode authorId (base58) to public key
    let publicKey: Uint8Array;
    try {
      publicKey = base58.decode(authorId);
    } catch (error) {
      res.status(400).json({error: 'Invalid authorId format (not valid base58)'});
      return;
    }

    // Compute body hash
    const bodyJson = JSON.stringify(req.body);
    const bodyHash = createHash('sha256').update(bodyJson).digest('hex');

    // Reconstruct signed message: authorId:timestamp:bodyHash
    const message = `${authorId}:${timestamp}:${bodyHash}`;
    const messageBytes = Buffer.from(message, 'utf8');

    // Decode signature from hex
    const signatureBytes = Buffer.from(signature, 'hex');

    // Verify signature
    const isValid = await ed.verify(signatureBytes, messageBytes, publicKey);

    if (!isValid) {
      res.status(401).json({error: 'Invalid signature'});
      return;
    }

    console.log(`✅ Signature verified for ${authorId.substring(0, 20)}...`);

    // Attach verified data to request
    req.authorId = authorId;
    req.timestamp = timestamp;

    next();
  } catch (error) {
    console.error('Error verifying signature:', error);
    res.status(500).json({error: 'Internal server error during authentication'});
  }
}
