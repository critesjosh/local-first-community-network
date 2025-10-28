# Duplicate Connections Fix

## The Problem

Connections were being duplicated with the same device but different connection IDs. This happened because:

1. **No UNIQUE constraint on `user_id`**: The `connections` table only had a primary key on `id` (UUID), not on `user_id`
2. **Both sides created connections**: When Device A connected to Device B:
   - Device A created: `id="uuid-1"`, `user_id="device-B-userId"`, `status="pending-sent"`
   - Device B created: `id="uuid-2"`, `user_id="device-A-userId"`, `status="pending-received"`
3. **INSERT OR REPLACE didn't work**: Because it only checked the `id` field, not `user_id`

## The Solution

### 1. Database Schema Changes

**Added UNIQUE constraint and index on `user_id`:**

```sql
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,  -- Added UNIQUE constraint
  ...
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_user_id 
  ON connections(user_id);
```

### 2. Smart UPSERT Logic

**Updated `saveConnection()` method:**

```typescript
async saveConnection(connection: Connection): Promise<void> {
  // Check if connection already exists for this user_id
  const existing = await this.getConnectionByUserId(connection.userId);
  
  if (existing) {
    // UPDATE existing connection, preserving original id and connected_at
    UPDATE connections SET ... WHERE user_id = ?
  } else {
    // INSERT new connection
    INSERT INTO connections ...
  }
}
```

**Key improvements:**
- Checks for existing connection by `user_id` BEFORE inserting
- Updates existing connection instead of creating duplicate
- Preserves original `id` and `connected_at` timestamp
- Updates status, display name, and other fields

### 3. Migration to Clean Existing Duplicates

**Added automatic cleanup:**

```typescript
private async cleanupDuplicateConnections(): Promise<void> {
  // 1. Find all user_ids with multiple connections
  // 2. For each duplicate, keep only the most recent connection
  // 3. Delete older duplicates
}
```

**Migration runs automatically on app startup** and:
- Detects existing duplicate connections
- Keeps the most recent connection per user
- Deletes older duplicates
- Creates unique index after cleanup

## How It Works Now

### Normal Connection Flow

1. **Device A initiates connection to Device B:**
   - Checks if connection exists for Device B's userId
   - If not, creates new connection with `status="pending-sent"`

2. **Device B receives connection request:**
   - Checks if connection exists for Device A's userId
   - If not, creates new connection with `status="pending-received"`
   - If exists with `status="pending-sent"`, upgrades to `"mutual"`

3. **Device A receives response:**
   - Updates existing connection status (no new record created!)

### Result

✅ **Only ONE connection record per user_id** on each device  
✅ **Status updates happen in-place** (no duplicates)  
✅ **Existing duplicates cleaned up automatically** on next app launch

## Testing

To verify the fix works:

1. **Fresh install**: Connect two devices - should see only one connection per user
2. **Existing install**: Restart app - duplicates should be cleaned up automatically
3. **Re-connect**: Try connecting to same device multiple times - should update, not duplicate

## Next Steps

- ✅ Database schema updated
- ✅ UPSERT logic implemented
- ✅ Migration added for cleanup
- ✅ Unique index created
- 🔄 Test on physical devices to confirm

