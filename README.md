# Shilagram

**Shilagram is a serverless, peer-to-peer messenger for Android. Messages travel directly between devices and never pass through a message server.**

---

## Purpose

Shilagram is built on the idea that a conversation should belong only to the people taking part in it. There is no server storing your messages, no account that requires a phone number or email address, and no third party with access to message content. Each user's identity is a cryptographic key that they control. Trust is established by comparing key fingerprints directly.

The app is guided by three principles: **confidentiality**, with every connection encrypted; **sovereignty**, with data kept on your device; and **elegance in use**, without compromising security.

---

## Features

### Encryption and Identity

- **End-to-end encryption**: each user has an ECDSA P-256 identity key. Each connection uses an ephemeral ECDH key, derived via HKDF and protected with AES-GCM.
- **Identity pinning**: a contact's public key is pinned on first contact, and fingerprints can be compared to verify it.
- **Two-step verification**: a password requested after the lock PIN, with an optional hint and growing delays after failed attempts.

### Messaging

- Direct chats and groups, with delivery ticks.
- **Self-destructing messages** with timers from 10 seconds to one week.
- An offline queue that delivers messages when both sides are online. Reactions and pins are kept for 7 days.
- Voice and video calls using WebRTC.
- Adding friends by key or QR code.
- Custom status (emoji, sticker, or photo) with timers from 1 hour to 30 days.

### Media and Files

- Photos, files up to 10 MB, voice messages, and stickers.
- **Sh-Fill folder**: a visible folder on your phone containing `صور` (Photos), `فيديو` (Videos), `صوتيات` (Audio), and `تسجيلات الشاشة` (Screen Recordings). Files are saved automatically and can be viewed full screen.

### Backup

- Encrypted backups protected by a password, using PBKDF2 with AES-GCM.

### Experience

- Arabic and English interface.
- Foreground service and notifications to keep connections alive while the app runs in the background.

---

## Technical Architecture

The app runs in a WebView inside an Android application.

Assets: index.html, style.css, i18n.js, crypto.js, db.js, app.js, features.js, plus vendored peerjs, qrcode, and jsQR.

Java: MainActivity, ShFill, KeepAliveService.

Tests: features.test.js and crypto.test.js.

CI/CD: GitHub workflows for testing and building the APK (artifact: shilagram-apk).

**PeerJS** is used for signaling only, so messages never pass through a server. Data is stored in **IndexedDB**, which replaces the older localStorage storage. Bundled libraries are verified against app/src/main/assets/LIBS.sha256.

To run the crypto tests, use the command node --test tests/crypto.test.js

---

## Installation and Signing

For updates to install over an existing copy, add these GitHub repository secrets:

- SHILA\_KS\_B64: the PKCS12 keystore, encoded in Base64, with the alias shila.
- SHILA\_KS\_PASS: the keystore password.

**Settings → About** compares your build with the latest GitHub release.

---

## Known Limitations

- There is no push server, so both people must have the app running to exchange messages.
- The two-step verification password cannot be recovered. A password recovery wipes the app data.
- Sh-Fill files are not encrypted and are stored in shared storage. On Android 11 and later, sideloaded APKs require "All files access."
- Each device is tied to one key.
- Some networks require a TURN server. The default is Open Relay.
