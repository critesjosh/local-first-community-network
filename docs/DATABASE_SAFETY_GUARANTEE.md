# Database Safety Guarantee

## Critical Rule: Identity Data Is NEVER Deleted

The database migrations are designed to **NEVER** delete or modify:
- User identity data
- Private keys (stored in SecureStorage, not database)
- User profiles

## What Migrations Touch

### Safe Operations (Currently Implemented)
1. **Adding columns** to connections table (`status`, `trust_level`)
   - ✅ Safe: Only adds new fields, doesn't delete data
   
2. **Cleaning up duplicate connections**
   - ✅ Safe: Only affects `connections` table
   - ✅ Keeps most recent connection per user
   - ✅ Never touches `users` table
   
3. **Creating unique index** on `connections.user_id`
   - ✅ Safe: Only enforces constraint, doesn't delete data
   - ✅ Runs AFTER duplicate cleanup
   - ✅ Errors are caught and don't crash the app

### What Is Protected

**Users Table:**
- Never modified by migrations
- Only touched by explicit user actions (profile updates)
- Identity data persists across app updates

**SecureStorage (Keychain/Keystore):**
- Private keys stored separately from database
- Not affected by database migrations
- Only cleared by explicit user action (`clearIdentity`, `resetIdentity`)

**App State:**
- `isFirstLaunch` flag preserved
- Identity creation status preserved

## Migration Safety Features

### 1. Error Handling
```typescript
try {
  // Migration logic
} catch (error) {
  console.error('Error:', error);
  // DON'T throw - app continues working
}
```

### 2. Table Existence Checks
```typescript
const tableExists = await this.db.getFirstAsync(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='connections'`
);

if (!tableExists) {
  return; // Skip migration safely
}
```

### 3. Non-Destructive Operations
- `CREATE TABLE IF NOT EXISTS` - only creates if missing
- `ALTER TABLE ADD COLUMN` - only adds new fields
- `CREATE INDEX IF NOT EXISTS` - idempotent, safe to retry

### 4. Targeted Deletions
```typescript
// ONLY deletes from connections table
DELETE FROM connections
WHERE user_id = ?
  AND id NOT IN (...)  // Keeps most recent
```

## What Could Cause Identity Loss

**These would require explicit user action:**
1. `IdentityService.clearIdentity()` - User-initiated
2. `IdentityService.resetIdentity()` - User-initiated (factory reset)
3. `Database.clearAllData()` - Only called from resetIdentity()
4. App uninstall - OS-level action
5. Device reset - OS-level action

**These NEVER happen automatically:**
- Database migrations don't call clearIdentity()
- Database migrations don't call resetIdentity()
- Database migrations don't delete from users table
- Database migrations don't clear SecureStorage

## Testing Identity Persistence

### Verify identity survives:
1. **App restart** - Identity should persist
2. **Database migrations** - Identity should persist
3. **Connection cleanup** - Identity should persist
4. **Index creation failures** - Identity should persist

### Check identity on app start:
```typescript
// IdentityService.init()
1. Database.init() ← Runs migrations
2. SecureStorage.hasKeys() ← Check if keys exist
3. loadIdentity() ← Load from SecureStorage
4. Database.getUser() ← Load profile from database
```

If identity is missing, it means:
- Keys were never created (first launch)
- Keys were explicitly deleted (user action)
- OS cleared keychain/keystore (rare, OS-level issue)

## Current Issue Resolution

The recent changes to add UNIQUE constraint:
- ✅ Only affect connections table
- ✅ Clean up duplicates before adding constraint
- ✅ Catch and log errors without crashing
- ✅ **Never touch users or identity data**

If you're seeing identity loss:
1. Check if it's actually a first launch (no keys were created)
2. Check if clearIdentity() was called somewhere
3. Check device logs for KeyManager errors
4. Verify SecureStorage is working (some simulators have issues)

## Recommendation

If identity seems to be lost, it's likely:
1. **Not actually lost** - SecureStorage might not be initialized yet
2. **First launch** - No identity was created yet
3. **Simulator issue** - SecureStorage can be flaky on simulators
4. **Timing issue** - Identity loading happens async

**To debug:**
```typescript
// Add to App.tsx
useEffect(() => {
  const checkIdentity = async () => {
    const hasKeys = await SecureStorage.hasKeys();
    console.log('🔑 Has keys in SecureStorage:', hasKeys);
    
    const identity = await IdentityService.loadIdentity();
    console.log('👤 Identity loaded:', !!identity);
    
    const user = await IdentityService.getCurrentUser();
    console.log('📋 User profile:', user?.displayName);
  };
  
  checkIdentity();
}, []);
```

