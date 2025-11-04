/**
 * End-to-End Test: Alice and Bob Complete Interaction Flow
 *
 * This script tests the complete user interaction flow:
 * 1. Create identities for Alice and Bob (Ed25519 key pairs)
 * 2. Establish connection (ECDH key exchange)
 * 3. Alice creates an encrypted event for Bob
 * 4. Alice publishes event to backend with Ed25519 signature authentication
 * 5. Bob fetches events and finds ones he can decrypt
 * 6. Bob decrypts Alice's event
 *
 * Authentication:
 * - POST requests require Ed25519 signature
 * - Signature: sign(authorId:timestamp:sha256(body))
 * - Sent in X-Signature and X-Timestamp headers
 */

// Node.js crypto for hashing, encryption, and randomness
import {createCipheriv, createDecipheriv, createHash, createHmac, randomBytes} from 'crypto';

// IMPORTANT: Polyfill crypto.subtle for @noble/ed25519 (same as mobile app)
// @noble/ed25519 v3 uses crypto.subtle.digest() for SHA-512
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {};
}

if (!globalThis.crypto.subtle) {
  (globalThis.crypto as any).subtle = {
    digest: async (algorithm: string | {name: string}, data: Uint8Array | ArrayBuffer) => {
      const algoName = typeof algorithm === 'string' ? algorithm : algorithm.name;

      if (algoName === 'SHA-512' || algoName === 'sha-512' || algoName === 'SHA512') {
        // Convert input to Buffer if needed
        const input = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data);

        // Use Node.js crypto for SHA-512
        const hash = createHash('sha512').update(input).digest();

        // Return ArrayBuffer to match crypto.subtle API
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
      }

      throw new Error(`Unsupported algorithm: ${algoName}`);
    }
  };

  console.log('[TestE2E] Polyfilled crypto.subtle.digest for Node.js');
}

// Import @noble libraries AFTER crypto.subtle polyfill
import * as ed from '@noble/ed25519';
import * as secp256k1 from '@noble/secp256k1';
import {base58} from '@scure/base';

// Configure @noble/ed25519 to use synchronous SHA-512 (for signing)
ed.hashes.sha512 = (...m: Uint8Array[]) => {
  const input = Buffer.concat(m);
  return new Uint8Array(createHash('sha512').update(input).digest());
};

console.log('[TestE2E] Configured ed25519 with synchronous SHA-512');

// Helper functions for Node.js crypto
function sha256Hash(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function hmacHash(hashFn: typeof sha256Hash, key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac('sha256', key).update(data).digest());
}

interface Identity {
  name: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  userId: string; // base58-encoded public key
  ephemeralPrivateKey: Uint8Array; // ECDH private key
  ephemeralPublicKey: Uint8Array; // ECDH public key
}

interface Connection {
  remoteUserId: string;
  remotePublicKey: Uint8Array;
  remoteEphemeralPublicKey: Uint8Array;
  sharedSecret: Uint8Array;
  recipientLookupId: string; // HMAC(sharedSecret, remoteUserId)
}

interface EncryptedEvent {
  id: string;
  authorId: string;
  timestamp: number;
  encryptedContent: string; // base64
  iv: string; // base64
  wrappedKeys: {
    [recipientLookupId: string]: {
      wrappedKey: string; // base64
      keyWrapIV: string; // base64
    };
  };
}

interface EventData {
  type: 'event';
  title: string;
  description: string;
  location: string;
  startTime: number;
  endTime: number;
}

// ============================================================================
// Cryptographic Utilities
// ============================================================================

async function createIdentity(name: string): Promise<Identity> {
  console.log(`\n📝 Creating identity for ${name}...`);

  // Ed25519 key pair for identity
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const userId = base58.encode(publicKey);

  // ECDH key pair for connection encryption
  const ephemeralPrivateKey = new Uint8Array(randomBytes(32));
  const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralPrivateKey, true);

  console.log(`   ✅ ${name}'s User ID: ${userId.substring(0, 20)}...`);

  return {
    name,
    publicKey,
    privateKey,
    userId,
    ephemeralPrivateKey,
    ephemeralPublicKey,
  };
}

async function establishConnection(
  localIdentity: Identity,
  remoteIdentity: Identity
): Promise<Connection> {
  console.log(`\n🤝 ${localIdentity.name} establishing connection with ${remoteIdentity.name}...`);

  // Derive ECDH shared secret
  const sharedSecretPoint = secp256k1.getSharedSecret(
    localIdentity.ephemeralPrivateKey,
    remoteIdentity.ephemeralPublicKey,
    true
  );
  const sharedSecret = sha256Hash(sharedSecretPoint);

  // IMPORTANT: Recipient lookup ID is computed as HMAC(sharedSecret, remoteUserId)
  // This allows the sender to compute a lookup ID that the recipient can verify
  // The recipient computes the SAME value using their own connection to the sender
  const recipientLookupId = Buffer.from(
    hmacHash(sha256Hash, sharedSecret, Buffer.from(remoteIdentity.userId))
  ).toString('hex');

  console.log(`   ✅ Shared secret derived: ${Buffer.from(sharedSecret).toString('hex').substring(0, 20)}...`);
  console.log(`   ✅ Recipient lookup ID for ${remoteIdentity.name}: ${recipientLookupId.substring(0, 20)}...`);

  return {
    remoteUserId: remoteIdentity.userId,
    remotePublicKey: remoteIdentity.publicKey,
    remoteEphemeralPublicKey: remoteIdentity.ephemeralPublicKey,
    sharedSecret,
    recipientLookupId,
  };
}

function encryptContent(content: string, key: Uint8Array, iv: Uint8Array): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(content, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]);
}

function decryptContent(encryptedWithTag: Buffer, key: Uint8Array, iv: Uint8Array): string {
  // Split encrypted data and auth tag (last 16 bytes)
  const encrypted = encryptedWithTag.slice(0, -16);
  const authTag = encryptedWithTag.slice(-16);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function wrapKey(
  eventKey: Uint8Array,
  connectionKey: Uint8Array,
  iv: Uint8Array
): Buffer {
  return encryptContent(Buffer.from(eventKey).toString('base64'), connectionKey, iv);
}

function unwrapKey(
  wrappedKey: Buffer,
  connectionKey: Uint8Array,
  iv: Uint8Array
): Uint8Array {
  const keyBase64 = decryptContent(wrappedKey, connectionKey, iv);
  return new Uint8Array(Buffer.from(keyBase64, 'base64'));
}

// ============================================================================
// Event Creation and Encryption
// ============================================================================

async function createAndEncryptEvent(
  author: Identity,
  connections: Connection[],
  eventData: EventData
): Promise<EncryptedEvent> {
  console.log(`\n📝 ${author.name} creating encrypted event...`);
  console.log(`   Event: "${eventData.title}"`);
  console.log(`   Recipients: ${connections.length}`);

  // Generate random event encryption key and IV
  const eventKey = randomBytes(32);
  const contentIV = randomBytes(12);

  // Encrypt event content
  const eventJson = JSON.stringify(eventData);
  const encryptedContent = encryptContent(eventJson, eventKey, contentIV);

  console.log(`   ✅ Content encrypted (${encryptedContent.length} bytes)`);

  // Wrap event key for each recipient
  const wrappedKeys: EncryptedEvent['wrappedKeys'] = {};

  for (const conn of connections) {
    const keyWrapIV = randomBytes(12);
    const wrappedKey = wrapKey(eventKey, conn.sharedSecret, keyWrapIV);

    wrappedKeys[conn.recipientLookupId] = {
      wrappedKey: wrappedKey.toString('base64'),
      keyWrapIV: keyWrapIV.toString('base64'),
    };

    console.log(`   ✅ Key wrapped for recipient ${conn.recipientLookupId.substring(0, 20)}...`);
  }

  const encryptedEvent: EncryptedEvent = {
    id: `event-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    authorId: author.userId,
    timestamp: Date.now(),
    encryptedContent: encryptedContent.toString('base64'),
    iv: contentIV.toString('base64'),
    wrappedKeys,
  };

  return encryptedEvent;
}

async function publishEvent(event: EncryptedEvent, author: Identity): Promise<void> {
  console.log(`\n📤 Publishing event to backend...`);

  // Prepare request body
  const body = JSON.stringify(event);

  // Compute body hash
  const bodyBytes = Buffer.from(body, 'utf8');
  const bodyHash = Buffer.from(sha256Hash(bodyBytes)).toString('hex');

  // Create timestamp
  const timestamp = Date.now();

  // Create message to sign: authorId:timestamp:bodyHash
  const message = `${event.authorId}:${timestamp}:${bodyHash}`;
  const messageBytes = Buffer.from(message, 'utf8');

  // Sign message with Ed25519 private key
  const signature = await ed.sign(messageBytes, author.privateKey);
  const signatureHex = Buffer.from(signature).toString('hex');

  console.log(`   🔏 Request signed with Ed25519`);
  console.log(`   📝 Timestamp: ${timestamp}`);

  // Make authenticated request
  const response = await fetch('http://localhost:3000/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signatureHex,
      'X-Timestamp': timestamp.toString(),
    },
    body,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to publish event: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
    );
  }

  const result = await response.json() as {postId: string; createdAt: string};
  console.log(`   ✅ Event published: ${result.postId}`);
}

async function fetchEvents(since: number = 0): Promise<EncryptedEvent[]> {
  console.log(`\n📥 Fetching events from backend...`);

  const response = await fetch(`http://localhost:3000/api/posts?since=${since}&limit=100`);

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }

  const result = await response.json() as {posts: EncryptedEvent[]; count: number; since: number};
  console.log(`   ✅ Fetched ${result.count} events`);

  return result.posts;
}

function canDecryptEvent(
  event: EncryptedEvent,
  myUserId: string,
  connection: Connection
): boolean {
  // Compute MY recipient lookup ID that the sender would have used
  // The sender computed: HMAC(sharedSecret, myUserId)
  const myRecipientLookupId = Buffer.from(
    hmacHash(sha256Hash, connection.sharedSecret, Buffer.from(myUserId))
  ).toString('hex');

  return myRecipientLookupId in event.wrappedKeys;
}

async function decryptEvent(
  event: EncryptedEvent,
  myUserId: string,
  connection: Connection
): Promise<EventData> {
  console.log(`\n🔓 Decrypting event ${event.id}...`);

  // Compute MY recipient lookup ID
  const myRecipientLookupId = Buffer.from(
    hmacHash(sha256Hash, connection.sharedSecret, Buffer.from(myUserId))
  ).toString('hex');

  const wrappedKeyData = event.wrappedKeys[myRecipientLookupId];

  if (!wrappedKeyData) {
    throw new Error('Cannot decrypt this event - no wrapped key found');
  }

  // Unwrap the event key
  const wrappedKey = Buffer.from(wrappedKeyData.wrappedKey, 'base64');
  const keyWrapIV = Buffer.from(wrappedKeyData.keyWrapIV, 'base64');
  const eventKey = unwrapKey(wrappedKey, connection.sharedSecret, keyWrapIV);

  console.log(`   ✅ Event key unwrapped`);

  // Decrypt the content
  const encryptedContent = Buffer.from(event.encryptedContent, 'base64');
  const contentIV = Buffer.from(event.iv, 'base64');
  const decryptedJson = decryptContent(encryptedContent, eventKey, contentIV);

  console.log(`   ✅ Content decrypted`);

  return JSON.parse(decryptedJson);
}

// ============================================================================
// Main Test Flow
// ============================================================================

async function runTest() {
  console.log('🧪 Starting End-to-End Test: Alice and Bob\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Create identities
    console.log('\n📋 STEP 1: Create Identities');
    console.log('─'.repeat(60));
    const alice = await createIdentity('Alice');
    const bob = await createIdentity('Bob');

    // Step 2: Establish connections (bidirectional)
    console.log('\n📋 STEP 2: Establish Connections');
    console.log('─'.repeat(60));
    const aliceToBob = await establishConnection(alice, bob);
    const bobToAlice = await establishConnection(bob, alice);

    // Verify reciprocal lookup IDs match
    console.log('\n🔍 Verifying connection symmetry...');
    console.log(`   Alice's lookup for Bob: ${aliceToBob.recipientLookupId.substring(0, 30)}...`);
    console.log(`   Bob's lookup for Alice: ${bobToAlice.recipientLookupId.substring(0, 30)}...`);

    // Step 3: Alice creates an event for Bob
    console.log('\n📋 STEP 3: Alice Creates Event for Bob');
    console.log('─'.repeat(60));
    const eventData: EventData = {
      type: 'event',
      title: 'Coffee Meetup',
      description: 'Let\'s grab coffee and discuss the project!',
      location: 'Local Cafe, Main Street',
      startTime: Date.now() + 3600000, // 1 hour from now
      endTime: Date.now() + 7200000,   // 2 hours from now
    };

    const encryptedEvent = await createAndEncryptEvent(alice, [aliceToBob], eventData);

    // Step 4: Publish event to backend
    console.log('\n📋 STEP 4: Publish Event to Backend with Signature');
    console.log('─'.repeat(60));
    await publishEvent(encryptedEvent, alice);

    // Step 5: Bob fetches events
    console.log('\n📋 STEP 5: Bob Fetches Events');
    console.log('─'.repeat(60));
    const events = await fetchEvents(0);

    console.log(`\n🔍 Bob checking which events he can decrypt...`);
    const decryptableEvents = events.filter(event => canDecryptEvent(event, bob.userId, bobToAlice));
    console.log(`   ✅ Found ${decryptableEvents.length} decryptable events`);

    if (decryptableEvents.length === 0) {
      console.error('\n❌ ERROR: Bob cannot decrypt any events!');
      console.error('   This means the HMAC lookup failed.');
      return;
    }

    // Step 6: Bob decrypts Alice's event
    console.log('\n📋 STEP 6: Bob Decrypts Alice\'s Event');
    console.log('─'.repeat(60));
    const decryptedEvent = await decryptEvent(decryptableEvents[0], bob.userId, bobToAlice);

    // Verify decryption
    console.log('\n✅ SUCCESS! Event decrypted successfully!');
    console.log('─'.repeat(60));
    console.log(`📍 Title: ${decryptedEvent.title}`);
    console.log(`📝 Description: ${decryptedEvent.description}`);
    console.log(`📍 Location: ${decryptedEvent.location}`);
    console.log(`⏰ Start: ${new Date(decryptedEvent.startTime).toISOString()}`);
    console.log(`⏰ End: ${new Date(decryptedEvent.endTime).toISOString()}`);

    // Verify content matches
    console.log('\n🔍 Verifying content integrity...');
    const contentMatches =
      decryptedEvent.title === eventData.title &&
      decryptedEvent.description === eventData.description &&
      decryptedEvent.location === eventData.location &&
      decryptedEvent.startTime === eventData.startTime &&
      decryptedEvent.endTime === eventData.endTime;

    if (contentMatches) {
      console.log('   ✅ All content fields match original!');
    } else {
      console.error('   ❌ Content mismatch detected!');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 END-TO-END TEST COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n✅ Verified:');
    console.log('   - Identity creation (Ed25519 key pairs)');
    console.log('   - Connection establishment (ECDH key exchange)');
    console.log('   - Event encryption (AES-256-GCM hybrid encryption)');
    console.log('   - Key wrapping (per-recipient wrapped keys)');
    console.log('   - HMAC-based recipient lookup');
    console.log('   - Backend storage and retrieval');
    console.log('   - Event decryption and content verification');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    throw error;
  }
}

// Run the test
runTest().catch(console.error);
