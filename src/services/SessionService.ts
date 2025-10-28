/**
 * SessionService - Manages event/party sessions
 * 
 * Handles:
 * - Checking in to events (connecting with host)
 * - Tracking connections made at events
 * - Auto-expiring sessions after 24 hours
 * - Leaving parties manually
 */

import {Session, SessionConnection} from '../types/session';
import Database from './storage/Database';
import ConnectionService from './ConnectionService';
import {generateUUID} from '../utils/crypto';
import {log, logError} from '../utils/logger';

type SessionListener = (session: Session | null) => void;

class SessionServiceClass {
  private currentSession: Session | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;
  private listeners: Set<SessionListener> = new Set();

  /**
   * Initialize the session service and load active session
   */
  async init(): Promise<void> {
    try {
      this.currentSession = await Database.getCurrentSession();
      
      if (this.currentSession) {
        // Check if session has expired
        if (new Date() >= this.currentSession.expiresAt) {
          await log('[SessionService] Current session has expired, cleaning up');
          await this.endSession();
        } else {
          await log('[SessionService] Restored active session:', this.currentSession.eventName);
          this.startSessionTimer();
        }
      }
    } catch (error) {
      await logError('[SessionService] Error initializing:', error);
    }
  }

  /**
   * Check in to an event by connecting with the host
   * @param hostDeviceId BLE device ID of the host
   * @param eventName Name of the event
   */
  async checkInToEvent(hostDeviceId: string, eventName: string): Promise<boolean> {
    try {
      await log(`[SessionService] Checking in to event: ${eventName}`);

      // Connect with the host
      const result = await ConnectionService.requestConnection(hostDeviceId);
      
      if (!result) {
        await logError('[SessionService] Failed to connect with host');
        return false;
      }

      // Create new session
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

      const session: Session = {
        id: generateUUID(),
        eventName,
        hostUserId: result.profile.userId,
        checkInTime: now,
        expiresAt,
        isActive: true,
      };

      // End any existing session before creating new one
      if (this.currentSession) {
        await this.endSession();
      }

      // Save to database
      await Database.createSession(session);
      
      // Add host connection to session
      await Database.addConnectionToSession(session.id, result.profile.userId);

      this.currentSession = session;
      this.startSessionTimer();
      this.notifyListeners();

      await log(`[SessionService] ✅ Checked in to ${eventName}`);
      return true;
    } catch (error) {
      await logError('[SessionService] Error checking in to event:', error);
      return false;
    }
  }

  /**
   * Leave the current party/event
   */
  async leaveParty(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    await log('[SessionService] Leaving party:', this.currentSession.eventName);
    await this.endSession();
  }

  /**
   * Get the current active session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Check if there's an active session
   */
  isSessionActive(): boolean {
    if (!this.currentSession) {
      return false;
    }
    
    // Check if expired
    return new Date() < this.currentSession.expiresAt;
  }

  /**
   * Get time remaining in current session (in milliseconds)
   */
  getSessionTimeRemaining(): number {
    if (!this.currentSession) {
      return 0;
    }

    const now = new Date();
    const remaining = this.currentSession.expiresAt.getTime() - now.getTime();
    return Math.max(0, remaining);
  }

  /**
   * Add a connection to the current session
   * Called automatically when connections are made while in a session
   */
  async addConnectionToSession(userId: string): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      await Database.addConnectionToSession(this.currentSession.id, userId);
      await log(`[SessionService] Added connection to session: ${userId}`);
    } catch (error) {
      await logError('[SessionService] Error adding connection to session:', error);
    }
  }

  /**
   * Get all connections made at the current session
   */
  async getSessionConnections(): Promise<string[]> {
    if (!this.currentSession) {
      return [];
    }

    try {
      return await Database.getSessionConnections(this.currentSession.id);
    } catch (error) {
      await logError('[SessionService] Error getting session connections:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const sessions = await Database.getAllSessions();
      const now = new Date();

      for (const session of sessions) {
        if (now >= session.expiresAt) {
          await log(`[SessionService] Cleaning up expired session: ${session.eventName}`);
          await Database.endSession(session.id);
        }
      }
    } catch (error) {
      await logError('[SessionService] Error cleaning up expired sessions:', error);
    }
  }

  /**
   * Add a listener for session changes
   */
  addListener(listener: SessionListener): void {
    this.listeners.add(listener);
    // Immediately notify of current state
    listener(this.currentSession);
  }

  /**
   * Remove a session listener
   */
  removeListener(listener: SessionListener): void {
    this.listeners.delete(listener);
  }

  /**
   * End the current session
   */
  private async endSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const sessionId = this.currentSession.id;
    
    // Stop timer
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    // Update database
    await Database.endSession(sessionId);

    // Clear current session
    this.currentSession = null;
    this.notifyListeners();

    await log('[SessionService] Session ended');
  }

  /**
   * Start a timer to auto-expire the session
   */
  private startSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }

    const timeRemaining = this.getSessionTimeRemaining();
    
    if (timeRemaining > 0) {
      this.sessionTimer = setTimeout(() => {
        log('[SessionService] Session expired (24 hours elapsed)');
        this.endSession();
      }, timeRemaining);

      log(`[SessionService] Session timer set for ${Math.round(timeRemaining / 1000 / 60)} minutes`);
    }
  }

  /**
   * Notify all listeners of session change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentSession);
      } catch (error) {
        logError('[SessionService] Error in listener:', error);
      }
    });
  }
}

const SessionService = new SessionServiceClass();
export default SessionService;

