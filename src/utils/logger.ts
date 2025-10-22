/**
 * Logging utility with user display name prefix
 */
import IdentityService from '../services/IdentityService';

let cachedDisplayName: string | null = null;

/**
 * Get the current user's display name for logging
 */
async function getDisplayNamePrefix(): Promise<string> {
  if (cachedDisplayName) {
    return cachedDisplayName;
  }

  try {
    const user = await IdentityService.getCurrentUser();
    if (user) {
      cachedDisplayName = user.displayName;
      return cachedDisplayName;
    }
  } catch (error) {
    // Ignore errors, fallback to no prefix
  }

  return 'Unknown';
}

/**
 * Clear the cached display name (call when user logs out or changes name)
 */
export function clearLoggerCache(): void {
  cachedDisplayName = null;
}

/**
 * Log with user display name prefix
 */
export async function log(...args: any[]): Promise<void> {
  const prefix = await getDisplayNamePrefix();
  console.log(`[${prefix}]`, ...args);
}

/**
 * Log error with user display name prefix
 */
export async function logError(...args: any[]): Promise<void> {
  const prefix = await getDisplayNamePrefix();
  console.error(`[${prefix}]`, ...args);
}

/**
 * Log warning with user display name prefix
 */
export async function logWarn(...args: any[]): Promise<void> {
  const prefix = await getDisplayNamePrefix();
  console.warn(`[${prefix}]`, ...args);
}

/**
 * Synchronous log with cached display name (use when async is not possible)
 */
export function logSync(...args: any[]): void {
  const prefix = cachedDisplayName || 'Unknown';
  console.log(`[${prefix}]`, ...args);
}

/**
 * Synchronous error log with cached display name (use when async is not possible)
 */
export function logErrorSync(...args: any[]): void {
  const prefix = cachedDisplayName || 'Unknown';
  console.error(`[${prefix}]`, ...args);
}

/**
 * Initialize logger by caching display name
 */
export async function initLogger(): Promise<void> {
  await getDisplayNamePrefix();
}

export default {
  log,
  logError,
  logWarn,
  logSync,
  logErrorSync,
  initLogger,
  clearLoggerCache,
};
