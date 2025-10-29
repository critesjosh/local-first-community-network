/**
 * Rate limiting middleware to prevent abuse
 */

import rateLimit from 'express-rate-limit';

// General API rate limiter
// Increased to support auto-refresh polling (every 15-30 seconds)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 minutes (20 per minute)
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter rate limiter for POST requests
export const createPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 posts per 15 minutes
  message: {
    error: 'Too many posts created from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests, even successful ones
});

// Very strict rate limiter for health checks and other high-frequency endpoints
export const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    error: 'Too many requests, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
