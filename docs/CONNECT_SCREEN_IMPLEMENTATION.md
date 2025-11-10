# Connect Screen Implementation

## Overview
Implemented a new "Connect" tab that provides a streamlined connection experience with automatic background scanning, optimistic UI, and event session management.

## What Changed

### New Files Created

1. **`src/types/session.ts`**
   - Session and SessionConnection interfaces
   - Type definitions for event/party session management

2. **`src/services/SessionService.ts`**
   - Manages event check-in and party sessions
   - Tracks connections made at events
   - Auto-expires sessions after 24 hours
   - Listeners for session state changes

3. **`src/screens/ConnectScreen.tsx`**
   - New tab screen replacing the modal ConnectionScanScreen
   - Auto-starts BLE scanning on mount (no button needed)
   - Shows inline connection progress with optimistic UI
   - Displays current session status
   - Allows check-in to events and leaving parties

### Modified Files

1. **`src/services/storage/Database.ts`**
   - Added `sessions` table for event session tracking
   - Added `session_connections` table for tracking connections made at events
   - Added session management methods:
     - `createSession()`
     - `getCurrentSession()`
     - `getAllSessions()`
     - `endSession()`
     - `addConnectionToSession()`
     - `getSessionConnections()`

2. **`src/types/navigation.ts`**
   - Replaced `CreateEvent` with `Connect` in MainTabParamList

3. **`src/navigation/AppNavigator.tsx`**
   - Replaced CreateEvent tab with Connect tab
   - Imported ConnectScreen component

4. **`App.tsx`**
   - Added SessionService import
   - Added session cleanup on app initialization

## Key Features

### 1. Automatic Background Scanning
- BLE scanning starts automatically when the Connect tab is active
- No manual "Start Scan" button needed
- Uses pulsed scanning for better iOS compatibility
- Continues scanning even while connections are in progress

### 2. Optimistic UI
- Connection attempts show inline progress immediately
- No blocking "Connecting..." overlay
- Device cards show "Connecting..." state while request is in progress
- Other devices remain interactive during connections

### 3. Session Management
- **Check In**: Connect with event host to start a session
- **Session Timer**: 24-hour auto-expiry from check-in time
- **Session Tracking**: All connections made at the event are tagged
- **Leave Party**: Manual session end before 24 hours

### 4. Connection States
Devices display different states based on connection status:
- **Connect**: No existing connection (blue button)
- **Connecting...**: Connection in progress (spinner)
- **✓ Connected**: Mutual connection established (green)
- **⏳ Pending**: Waiting for other person to accept (orange)
- **👋 Accept**: Incoming connection request (blue, tappable)

## User Flow

### Connecting Without Session
1. User opens Connect tab
2. App automatically starts scanning for nearby devices
3. Discovered devices appear in list with signal strength
4. User taps device card → "Connecting..." shows inline
5. Connection completes → status updates to "✓ Connected"
6. User can continue connecting with other devices

### Connecting With Session
1. User taps "Check In to Event"
2. Scans QR code or enters event code (TODO)
3. Connects with event host
4. Session created with 24-hour timer
5. All subsequent connections at that location are tagged to the session
6. Session card shows event name and time remaining
7. User can "Leave Party" to end session early

## Database Schema

### Sessions Table
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  host_user_id TEXT NOT NULL,
  check_in_time INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1
);
```

### Session Connections Table
```sql
CREATE TABLE session_connections (
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id),
  FOREIGN KEY(session_id) REFERENCES sessions(id),
  FOREIGN KEY(user_id) REFERENCES connections(user_id)
);
```

## API Reference

### SessionService

#### `init(): Promise<void>`
Initialize service and restore active session

#### `checkInToEvent(hostDeviceId: string, eventName: string): Promise<boolean>`
Check in to an event by connecting with the host

#### `leaveParty(): Promise<void>`
Leave the current party/event

#### `getCurrentSession(): Session | null`
Get the current active session

#### `isSessionActive(): boolean`
Check if there's an active session

#### `getSessionTimeRemaining(): number`
Get milliseconds remaining in current session

#### `addConnectionToSession(userId: string): Promise<void>`
Add a connection to the current session

#### `getSessionConnections(): Promise<string[]>`
Get all user IDs connected at current session

#### `cleanupExpiredSessions(): Promise<void>`
Clean up sessions older than 24 hours

## Testing

To test the implementation:

```bash
# Rebuild the app
yarn ios --device="iPhone JG (2)"
yarn ios --device="iPhone Wiz"
```

### Test Scenarios

1. **Basic Connection Flow**
   - Open Connect tab on both devices
   - Verify devices discover each other automatically
   - Tap to connect
   - Verify inline "Connecting..." state
   - Verify connection completes and shows "✓ Connected"

2. **Multiple Simultaneous Connections**
   - Have 3+ devices nearby
   - Connect with multiple devices
   - Verify UI doesn't block
   - Verify all connections complete successfully

3. **Session Management**
   - Tap "Check In to Event"
   - Create session with a name
   - Verify session card shows event name and timer
   - Make several connections
   - Verify connections are tagged to session
   - Leave party and verify session ends

4. **Session Expiry**
   - Create a session
   - Wait 24 hours (or manually adjust expires_at in database)
   - Reopen app
   - Verify expired session is cleaned up

## Future Enhancements

1. **QR Code Scanning**: Implement QR code scanner for event check-in
2. **Event Codes**: Allow manual entry of event codes
3. **Session History**: View past sessions and connections made
4. **Session Sharing**: Share session info with others
5. **Proximity Detection**: Auto check-in when near event location
6. **Session Analytics**: Show connection graph at events

## Notes

- CreateEvent screen moved from tab bar (will be modal from Home screen later)
- ConnectionScanScreen still exists for backward compatibility but is no longer the primary flow
- Sessions automatically clean up on app launch
- All BLE operations remain unchanged - only UI/UX improved

