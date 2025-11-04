/**
 * Request validation middleware
 */

import {Request, Response, NextFunction} from 'express';
import validator from 'validator';

/**
 * Validate post creation request
 */
export const validatePostCreation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const {id, authorId, timestamp, encryptedContent, iv, wrappedKeys} = req.body;

  // Validate required fields exist
  if (!id || !authorId || !encryptedContent || !iv || !wrappedKeys) {
    res.status(400).json({
      error: 'Missing required fields',
      required: ['id', 'authorId', 'timestamp', 'encryptedContent', 'iv', 'wrappedKeys'],
    });
    return;
  }

  // Validate field types and formats
  if (typeof id !== 'string' || !validator.isUUID(id)) {
    res.status(400).json({error: 'Invalid id format (must be UUID)'});
    return;
  }

  if (typeof authorId !== 'string' || authorId.length < 10 || authorId.length > 100) {
    res.status(400).json({error: 'Invalid authorId format'});
    return;
  }

  if (typeof timestamp !== 'number' || timestamp < 0) {
    res.status(400).json({error: 'Invalid timestamp'});
    return;
  }

  // Validate timestamp is not too far in the future (allow 1 hour clock skew)
  const maxFutureTimestamp = Date.now() + 60 * 60 * 1000;
  if (timestamp > maxFutureTimestamp) {
    res.status(400).json({error: 'Timestamp too far in the future'});
    return;
  }

  if (typeof encryptedContent !== 'string' || encryptedContent.length === 0) {
    res.status(400).json({error: 'Invalid encryptedContent'});
    return;
  }

  // Limit content size (10MB limit already in express.json, but double-check)
  if (encryptedContent.length > 10 * 1024 * 1024) {
    res.status(400).json({error: 'Encrypted content too large (max 10MB)'});
    return;
  }

  if (typeof iv !== 'string' || iv.length === 0) {
    res.status(400).json({error: 'Invalid iv'});
    return;
  }

  if (typeof wrappedKeys !== 'object' || Array.isArray(wrappedKeys)) {
    res.status(400).json({error: 'Invalid wrappedKeys format'});
    return;
  }

  // Validate wrappedKeys structure
  const wrappedKeysCount = Object.keys(wrappedKeys).length;
  if (wrappedKeysCount === 0 || wrappedKeysCount > 100) {
    res.status(400).json({
      error: 'Invalid number of wrapped keys (must be 1-100)',
    });
    return;
  }

  // Validate each wrapped key entry
  for (const [lookupId, keyData] of Object.entries(wrappedKeys)) {
    if (typeof lookupId !== 'string' || lookupId.length === 0) {
      res.status(400).json({error: 'Invalid lookupId in wrappedKeys'});
      return;
    }

    if (
      typeof keyData !== 'object' ||
      !keyData ||
      typeof (keyData as any).wrappedKey !== 'string' ||
      typeof (keyData as any).keyWrapIV !== 'string'
    ) {
      res.status(400).json({
        error: 'Invalid wrapped key format (must have wrappedKey and keyWrapIV)',
      });
      return;
    }
  }

  next();
};

/**
 * Validate query parameters for fetching posts
 */
export const validateGetPosts = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const {since, limit} = req.query;

  if (since !== undefined) {
    const sinceNum = parseInt(since as string);
    if (isNaN(sinceNum) || sinceNum < 0) {
      res.status(400).json({error: 'Invalid since parameter (must be positive number)'});
      return;
    }
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      res.status(400).json({error: 'Invalid limit parameter (must be 1-1000)'});
      return;
    }
  }

  next();
};

/**
 * Validate UUID parameter
 */
export const validateUuidParam = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];

    if (!value || !validator.isUUID(value)) {
      res.status(400).json({error: `Invalid ${paramName} (must be UUID)`});
      return;
    }

    next();
  };
};
