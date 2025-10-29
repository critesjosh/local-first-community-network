# Changelog

## [Unreleased] - 2025-10-28

### Added

#### Auto-Refresh Functionality
- **HomeScreen**: Automatic polling for new posts every 15 seconds
  - Posts appear automatically without manual pull-to-refresh
  - Proper cleanup when navigating away to prevent memory leaks

- **ThreadViewScreen**: Automatic polling for new replies every 10 seconds
  - Replies appear automatically in real-time conversations
  - Proper cleanup when leaving thread view

#### Database Caching for REST API
- **RESTPostStorage**: Posts fetched from REST API are now cached in local SQLite database
  - Enables offline access to previously viewed posts
  - Required for thread operations (replies need access to parent post)
  - Added validation to ensure `wrappedKeys` is properly formatted before caching

- **RESTPostStorage**: Thread replies are now cached in local database
  - Enables offline access to previously viewed replies
  - Enables accurate reply count calculations

#### Reply Count from Backend API
- **ThreadService**: Now fetches reply counts from backend API when using REST storage
  - Endpoint: `GET /api/threads/:threadId/replies/count`
  - Falls back to local database for local storage mode
  - Provides accurate counts without needing to load all replies

### Fixed

#### Thread Reply Author Display
- **ThreadViewScreen**: Fixed "Unknown" author names for replies
  - Now checks if reply author is the current user before looking in connections
  - Correctly displays author's display name and profile photo
  - Matches behavior of post author display in HomeScreen

#### Reply Count Always Showing Zero
- **HomeScreen**: Removed incorrect `event.isThread` check
  - Every event can have replies (all posts are threads by design)
  - Now loads reply counts for all events, not just ones marked with non-existent property
  - Added detailed logging for debugging reply count loading

#### Post Deletion Issues
- **HomeScreen**: Fixed posts disappearing after delete
  - Implemented optimistic UI update (filter locally before API call)
  - Added error recovery to reload events if delete fails
  - Added detailed logging to track event filtering

- **PostService**: Fixed DELETE request authentication
  - DELETE requests now include `authorId` in request body (required by auth middleware)
  - Signature format updated to match backend: `${authorId}:${timestamp}:${bodyHash}`
  - Properly includes Content-Type header

#### Backend Authorization
- **postController**: Added authorization check for post deletion
  - Only post authors can delete their own posts
  - Returns 403 Forbidden if authenticated user is not the post author
  - Prevents unauthorized deletion of other users' posts

#### Database Error Handling
- **Database.ts**: Enhanced error handling in `saveEncryptedEvent`
  - Validates required fields (id, authorId, timestamp) before insertion
  - Safely handles `wrappedKeys` serialization with fallback to empty object
  - Provides default values for optional fields to prevent NULL errors

- **Database.ts**: Safer JSON parsing in `getEncryptedEvent`
  - Try-catch around JSON.parse for `wrapped_keys` field
  - Validates `eventId` parameter before querying
  - Uses `row.datetime` as primary timestamp source with fallback

#### Rate Limiting
- **rateLimitMiddleware**: Increased API rate limits to support auto-refresh
  - Changed from 100 requests per 15 minutes to 300 requests per 15 minutes
  - Allows ~20 requests per minute (well above polling requirements)
  - Prevents 429 "Too Many Requests" errors during auto-refresh

### Changed

#### Configuration
- **app.json**: Updated API URL from `192.168.50.38:3000` to `192.168.50.222:3000`
  - Updated to match current backend server IP address

#### Code Quality
- **HomeScreen**: Wrapped `loadEvents` in `useCallback` for proper memoization
  - Ensures stable reference for auto-refresh interval
  - Added detailed console logging for debugging

- **HomeScreen**: Added logging throughout event loading process
  - Tracks number of encrypted events fetched
  - Tracks number of events successfully decrypted
  - Helps diagnose issues with post loading

### Technical Details

#### Thread Reply Flow
1. Client creates reply with encrypted content using thread key
2. POST to `/api/threads/:threadId/replies` with signature authentication
3. Backend stores reply in `thread_replies` table
4. Reply is cached in client's local database for offline access
5. Auto-refresh polls for new replies every 10 seconds
6. Reply count updates automatically

#### Post Caching Strategy
- When fetching posts from REST API, each post is saved to local SQLite database
- Caching enables:
  - Offline access to previously viewed content
  - Thread operations (need parent post to get thread key)
  - Fast local queries for reply counts
  - Reduced bandwidth on subsequent app launches

#### Rate Limiting Strategy
- Backend: 300 requests per 15 minutes (20/minute)
- HomeScreen polling: Every 15 seconds (~4/minute)
- ThreadView polling: Every 10 seconds (~6/minute)
- Reply count queries: ~2-4/minute
- Total: ~10-14 requests/minute (well within limits)

### Files Modified

#### Backend
- `src/controllers/postController.ts` - Added authorization check for delete
- `src/middleware/rateLimitMiddleware.ts` - Increased rate limits

#### Frontend
- `app.json` - Updated API URL
- `src/screens/HomeScreen.tsx` - Auto-refresh, reply count fix, delete fix
- `src/screens/ThreadViewScreen.tsx` - Auto-refresh, author display fix
- `src/services/PostService.ts` - Fixed DELETE authentication
- `src/services/ThreadService.ts` - Reply count from API
- `src/services/storage/Database.ts` - Enhanced error handling
- `src/services/storage/RESTPostStorage.ts` - Post and reply caching
