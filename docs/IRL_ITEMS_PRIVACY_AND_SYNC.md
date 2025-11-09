# IRL Item Privacy & Sync Plan

## Encryption Strategy
- Reuse `EncryptionService` hybrid model to wrap each IRL item payload (metadata + media key) per connection in `connectionIds`.
- Store raw media locally; only encrypted references/keys are shared via existing `PostStorageService`.
- Derive media key per item (32-byte random) and encrypt full-size photo before synchronizing; upload to peer via future transport (BLE transfer or REST).
- Extend `EncryptedEvent` schema or create `EncryptedIrlItem` variant with `itemId`, `mediaHash`, `wrappedKeys`, `caption`, and optional tags.
- Only allow sync when connection `status === 'mutual'` to ensure reciprocity; pending connections keep items local.

## Permissions & Transparency
- Show explicit camera/microphone permission rationale screen before requesting OS permissions.
- When location is captured, prompt separately and allow opting out; store `latitude/longitude` only if granted.
- Provide settings toggle in `SettingsScreen` to disable auto-syncing IRL items; default to manual share.
- Surface badge in capture UI when multi-cam unsupported and offer single-camera fallback.

## Storage & Retention
- Track local storage usage via `expo-file-system` and warn when cache exceeds configurable threshold (e.g., 500 MB).
- Allow users to delete items from `ConnectionDetailScreen` and `HomeScreen` carousel; deletions cascade to sync queue.
- Generate lightweight thumbnails at capture time using `expo-image-manipulator` to avoid large list payloads.

## Sync Workflow
- Queue unsynced items in SQLite (`syncedAt IS NULL`); background job attempts delivery when:
  - Device on Wi-Fi or user explicitly approves cellular transfer.
  - Destination peer discovered via BLE or a future relay.
- After successful transfer & remote acknowledgment, set `syncedAt` and persist remote confirmation hash for audit.
- Handle failures with exponential backoff and user-facing status chips (e.g., “Waiting to share”).

## Fallback UX
- If front camera unavailable, display toast “PiP unavailable on this device” and continue with back camera only.
- Offer manual selfie upload pathway using `expo-image-picker` as an alternative PiP input.
- When permissions are denied, show actionable CTA leading to OS settings plus text-based logging option for accessibility.

