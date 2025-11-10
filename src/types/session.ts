/**
 * Session types for event check-in and party management
 */

export interface Session {
  id: string;
  eventName: string;
  hostUserId: string;
  checkInTime: Date;
  expiresAt: Date; // checkInTime + 24 hours
  isActive: boolean;
}

export interface SessionConnection {
  sessionId: string;
  userId: string;
  connectedAt: Date;
}

