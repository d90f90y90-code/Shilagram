# Shilagram

Serverless peer-to-peer messenger for Android (WebView app, PeerJS signaling only, no message server).

## Features
- Direct chats and groups, delivery ticks, offline queue (messages are delivered when both sides are online)
- **End-to-end encryption**: ECDSA P-256 identity key per user, ephemeral ECDH + HKDF + AES-GCM per connection
- **Identity pinning**: a contact's public key is pinned on first contact; a different key is rejected with a warning
  (Security screen shows fingerprints you can compare in person / over a call)
- Photos, files (≤10 MB), voice messages, stickers, reply, edit, delete for me / for everyone
- Voice and video calls (WebRTC)
- Add friends by key or by QR code
- Encrypted backup file (password, PBKDF2 + AES-GCM) with import
- **Sh-Fill**: a visible `Sh-Fill/` folder on the phone with `صور`, `فيديو`, `صوتيات`, `تسجيلات الشاشة`. Optional auto-save of received media and call recordings, "save all chats' media now", per-folder import, and a full-screen viewer (pinch / double-tap zoom, swipe, video + audio playback). Tapping a photo in a chat opens the same viewer.
- Foreground service + notifications, Arabic / English UI
- Storage in IndexedDB (migrates data from the previous localStorage version automatically)

## Layout
```
app/src/main/assets/   index.html style.css i18n.js crypto.js db.js app.js (+ vendored peerjs, qrcode, jsQR)
app/src/main/java/     MainActivity (WebView host, permissions, notifications), ShFill (Sh-Fill folder + file server), KeepAliveService
tests/crypto.test.js   handshake / impersonation / replay / tamper tests (node --test tests/crypto.test.js)
.github/workflows/     test + build (APK artifact: shilagram-apk)
```
Vendored library hashes are in `app/src/main/assets/LIBS.sha256` and checked in CI.

## Stable signing (so new builds update the installed app)
Add repository secrets `SHILA_KS_B64` (base64 of a PKCS12 keystore with alias `shila`) and `SHILA_KS_PASS`.
Without them CI signs with a throwaway debug key and the APK cannot update an installed copy.

## Known limits
- Sh-Fill files are plain (not encrypted) and live in shared storage; Android 11+ needs "All files access" for the app (sideloaded APK only, Google Play restricts this permission).
- No push server: both people must have the app running to exchange messages (foreground service helps while in background).
- One device per key. A TURN server is needed for some mobile networks (default list uses the free Open Relay; override in Settings).
