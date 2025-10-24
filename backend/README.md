# Local Community Network - Backend API

Backend server for Local Community Network that stores and relays encrypted posts. **The server cannot decrypt content** - all encryption/decryption happens on the client.

## Features

- 📮 **Encrypted Post Storage**: Stores encrypted events with HMAC-obfuscated recipient lookup
- 🔒 **End-to-End Encryption**: Server cannot decrypt content
- 🚀 **Simple REST API**: POST and GET endpoints for posts
- 📊 **PostgreSQL Storage**: Reliable database with JSON support
- 🔍 **Efficient Queries**: Indexed for fast retrieval

## Tech Stack

- **Node.js** + **TypeScript**
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **pg** - PostgreSQL client

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Set up database:**
   ```bash
   # Create database (if needed)
   createdb local_community

   # Run schema setup
   npm run db:setup
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

Server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T12:00:00.000Z",
  "service": "local-community-backend"
}
```

### Create Post
```
POST /api/posts
Content-Type: application/json
```

Body:
```json
{
  "id": "uuid",
  "authorId": "base58-public-key",
  "timestamp": 1698765432000,
  "encryptedContent": "base64-encrypted-data",
  "iv": "base64-iv",
  "wrappedKeys": {
    "HMAC-lookup-id-1": {
      "wrappedKey": "base64-wrapped-key",
      "keyWrapIV": "base64-iv"
    },
    "HMAC-lookup-id-2": {
      "wrappedKey": "base64-wrapped-key",
      "keyWrapIV": "base64-iv"
    }
  }
}
```

Response:
```json
{
  "success": true,
  "postId": "uuid",
  "createdAt": "2025-10-24T12:00:00.000Z"
}
```

### Get Posts
```
GET /api/posts?since={timestamp}&limit={limit}
```

Query Parameters:
- `since`: Unix timestamp in milliseconds (default: 0)
- `limit`: Maximum posts to return (default: 100, max: 1000)

Response:
```json
{
  "posts": [...],
  "count": 10,
  "since": 1698765432000
}
```

### Get Single Post
```
GET /api/posts/:id
```

Response: Single encrypted post object

## Database Schema

### Posts Table

```sql
CREATE TABLE posts (
  id VARCHAR(36) PRIMARY KEY,
  author_id VARCHAR(100) NOT NULL,
  timestamp BIGINT NOT NULL,
  encrypted_content TEXT NOT NULL,
  iv VARCHAR(100) NOT NULL,
  wrapped_keys JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_posts_timestamp ON posts (timestamp DESC);
CREATE INDEX idx_posts_author ON posts (author_id);
CREATE INDEX idx_posts_wrapped_keys ON posts USING GIN (wrapped_keys);
```

## Development

```bash
# Start development server with auto-reload
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

### Railway.app (Recommended)

1. Create new project on Railway
2. Add PostgreSQL service
3. Connect GitHub repository
4. Set environment variables from `.env.example`
5. Deploy!

### Docker

```dockerfile
# Coming soon
```

## Security Notes

- **Server cannot decrypt content**: All post data is end-to-end encrypted
- **HMAC-based recipient lookup**: Server cannot determine who can read each post
- **No authentication yet**: MVP stores all posts publicly (add signature-based auth in Week 3)
- **Rate limiting recommended**: Add in production

## Performance

- **Efficient hybrid encryption**: Content encrypted once, keys wrapped per recipient (77x smaller)
- **Indexed queries**: Fast lookups by timestamp and author
- **JSONB wrapped_keys**: Efficient recipient matching

## License

MIT
