# Privacy Policy for Local Community Network

**Effective Date:** November 8, 2024
**Last Updated:** November 8, 2024

## Introduction

Local Community Network ("we," "our," or "the app") is a privacy-first mobile application designed to help you discover local events and build neighborhood connections. This Privacy Policy explains how we collect, use, store, and protect your information.

## Our Privacy Commitment

We believe in privacy by design. Your data stays primarily on your device, and when data is shared with our servers, it is end-to-end encrypted so that we cannot read your content.

## Information We Collect

### Information You Provide

- **Display Name**: A name you choose to identify yourself to your connections
- **Profile Photo** (optional): An image you select from your photo library or take with your camera
- **Posts and Events**: Content you create and share with your connections
- **Photos**: Images you add to events or your profile

### Information Automatically Collected

- **Cryptographic Identity**: The app generates an Ed25519 key pair on your device. Your public key serves as your unique identifier. Your private key never leaves your device.
- **Connection Data**: Records of people you've connected with via Bluetooth verification
- **Device Information**: Basic device identifiers required for Bluetooth communication
- **Usage Data**: Information about how you use the app (stored locally)

### Location Information

We collect approximate location data **only when you use Bluetooth scanning features**. This is required by Android for Bluetooth Low Energy scanning and is used exclusively to:
- Discover nearby users broadcasting their profiles
- Verify in-person proximity for connections

**We do not:**
- Track your continuous location
- Store your location history
- Share your location with third parties
- Use location for advertising or analytics

## How We Use Your Information

We use the collected information to:

1. **Enable Core Features**:
   - Create and manage your identity
   - Facilitate Bluetooth-verified connections with nearby users
   - Display your profile to people you connect with
   - Encrypt and sync your posts across devices

2. **Provide Security**:
   - Authenticate your identity using cryptographic keys
   - Encrypt your posts end-to-end before server sync
   - Verify in-person connections via Bluetooth proximity

3. **Improve the App**:
   - Fix bugs and improve performance
   - Develop new features

## How We Store Your Information

### Local Storage (On Your Device)

- **Secure Storage**: Your private cryptographic keys are stored in your device's secure storage (iOS Keychain / Android Keystore)
- **Local Database**: Posts, events, connections, and user data are stored in an encrypted SQLite database on your device
- **App Preferences**: Settings and preferences stored locally

### Server Storage

- **Encrypted Posts**: When you create posts, they are encrypted on your device before being sent to our servers at `yourland.adjacentpossible.dev`
- **We Cannot Read Your Content**: Posts are encrypted with keys that only you and your intended recipients possess
- **Metadata**: We store minimal metadata needed for post delivery (encrypted recipient identifiers, timestamps)

## Data Sharing and Disclosure

### We Do Not Sell Your Data

We never sell, rent, or trade your personal information to third parties for marketing purposes.

### When We Share Data

- **With Your Connections**: When you create a post or event, it's encrypted and shared only with your selected connections
- **Service Providers**: We use Expo (expo.dev) for app updates and distribution. They may collect minimal usage data as described in their privacy policy
- **Legal Requirements**: We may disclose information if required by law, subpoena, or to protect our rights or safety

### We Do Not Share With

- Advertisers or marketing companies
- Data brokers
- Social media platforms
- Analytics companies (beyond basic app performance metrics)

## Bluetooth and Nearby Connections

### How Bluetooth Works in Our App

- **Broadcasting**: When you enable connections, the app broadcasts a short identifier via Bluetooth
- **Scanning**: When you scan for nearby users, your device detects other users' broadcasts
- **Connection**: When you connect with someone, you exchange public keys for end-to-end encryption
- **Proximity-Based**: Connections require both users to be physically nearby (typically within 3 meters)

### What We Don't Do

- Track your physical location over time
- Share your location with other users (beyond immediate Bluetooth proximity)
- Use Bluetooth for advertising or tracking

## Permissions We Request

### Required Permissions

1. **Bluetooth**: To verify in-person connections and build your local network
2. **Location** (Android only): Required by Android OS for Bluetooth scanning; we do not access your actual location

### Optional Permissions

1. **Camera**: To take photos for your profile or events (only when you choose to)
2. **Photo Library**: To select existing photos (only when you choose to)

You can deny optional permissions and still use core app features.

## Data Retention

- **Local Data**: Stored on your device until you delete it or uninstall the app
- **Server Data**: Encrypted posts are retained for 90 days or until you delete them
- **Account Deletion**: You can reset your identity at any time in Settings, which deletes all local data. To delete server data, contact us at privacy@builddetroit.xyz

## Your Rights and Choices

You have the right to:

1. **Access Your Data**: View all data stored locally in the app
2. **Delete Your Data**: Reset your identity or delete individual posts/events
3. **Export Your Data**: Backup your identity and data (encrypted)
4. **Control Sharing**: Choose exactly who sees each post or event
5. **Revoke Permissions**: Disable Bluetooth, camera, or photo access at any time in device settings

## Children's Privacy

Our app is not directed to children under 13. We do not knowingly collect information from children under 13. If you believe a child has provided us with personal information, please contact us immediately.

## Security Measures

We implement industry-standard security measures:

- **End-to-End Encryption**: AES-256-GCM encryption for all posts
- **Cryptographic Keys**: Ed25519 digital signatures and ECDH key exchange
- **Secure Storage**: Private keys stored in device-level secure storage
- **No Password Storage**: We never store passwords (your private key is your identity)
- **Transport Security**: All server communication uses HTTPS/TLS

## Third-Party Services

We use the following third-party services:

1. **Expo** (expo.dev): For app updates and distribution
   - [Expo Privacy Policy](https://expo.dev/privacy)

2. **Server Hosting**: Our backend server is hosted at `yourland.adjacentpossible.dev`

These services have their own privacy policies. We encourage you to review them.

## International Users

Your information may be transferred to and stored on servers in the United States. By using the app, you consent to this transfer.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of significant changes by:
- Posting a notice in the app
- Updating the "Last Updated" date at the top of this policy

## Contact Us

If you have questions about this Privacy Policy or your data, contact us:

**Email**: privacy@builddetroit.xyz
**Project**: Local Community Network
**Website**: [Your website URL]

## Your California Privacy Rights

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):

- Right to know what personal information we collect
- Right to delete your personal information
- Right to opt-out of sale (note: we do not sell personal information)
- Right to non-discrimination

To exercise these rights, contact us at privacy@builddetroit.xyz.

## Data Protection Officer

For EU residents or GDPR inquiries, contact our data protection representative:

**Email**: privacy@builddetroit.xyz

---

## Summary (Plain Language)

**What we collect**: Your name, optional photo, posts/events you create, and records of people you've connected with via Bluetooth.

**Why**: To let you create an identity, connect with nearby people, and share encrypted posts with your connections.

**How we protect it**: Your posts are encrypted so we can't read them. Your private key never leaves your device. We don't track your location or sell your data.

**Your control**: You can delete everything at any time. You choose exactly who sees each post.

**Questions?** Email privacy@builddetroit.xyz

---

**By using Local Community Network, you agree to this Privacy Policy.**
