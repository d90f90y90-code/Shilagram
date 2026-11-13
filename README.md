# Shilagram

Serverless peer-to-peer messenger for Android (WebView app, PeerJS signaling only, no message server).

## Features
- Direct chats and groups, delivery ticks, offline queue (messages are delivered when both sides are online)
- **End-to-end encryption**: ECDSA P-256 identity key per user, ephemeral ECDH + HKDF + AES-GCM per connection
- **Identity pinning**: a contact's public key is pinned on first contact; a different key is rejected with a warning
  (Security screen shows fingerprints you can compare in person / over a call)
- **Self-destructing messages** (per chat: 10 s / 1 min / 1 h / 1 day / 1 week, deleted on both sides), **forwarding** (with a "forwarded from" label), **pinned messages** bar, **emoji reactions**, **typing indicator** (can be switched off in Privacy)
- **Two-step verification**: a password asked after the lock PIN (Privacy), with an optional hint; failed attempts are counted on disk with growing delays; also asked before exporting a backup
- **Update check** (Settings → About): compares the installed build with the GitHub `latest` release and opens the APK download
- **Status next to your name**: an emoji, a sticker from your library or a photo from your phone, with an optional timer (1 h … 30 days, or custom hours). Sent with the profile, so friends get it whenever they connect.
- Photos, files (≤10 MB), voice messages, stickers, reply, edit, delete for me / for everyone
- Voice and video calls (WebRTC)
- Add friends by key or by QR code
- Encrypted backup file (password, PBKDF2 + AES-GCM) with import
- **Sh-Fill**: a visible `Sh-Fill/` folder on the phone with `صور`, `فيديو`, `صوتيات`, `تسجيلات الشاشة`. Optional auto-save of received media and call recordings, "save all chats' media now", per-folder import, and a full-screen viewer (pinch / double-tap zoom, swipe, video + audio playback). Tapping a photo in a chat opens the same viewer.
- Foreground service + notifications, Arabic / English UI
- Storage in IndexedDB (migrates data from the previous localStorage version automatically)

## Layout
```
app/src/main/assets/   index.html style.css i18n.js crypto.js db.js app.js features.js (+ vendored peerjs, qrcode, jsQR)
app/src/main/java/     MainActivity (WebView host, permissions, notifications), ShFill (Sh-Fill folder + file server), KeepAliveService
tests/features.test.js timers / reactions / pins / queue / update logic
tests/crypto.test.js   handshake / impersonation / replay / tamper tests (node --test tests/crypto.test.js)
.github/workflows/     test + build (APK artifact: shilagram-apk)
```
Vendored library hashes are in `app/src/main/assets/LIBS.sha256` and checked in CI.

## Stable signing (so new builds update the installed app)
Add repository secrets `SHILA_KS_B64` (base64 of a PKCS12 keystore with alias `shila`) and `SHILA_KS_PASS`.
Without them CI signs with a throwaway debug key and the APK cannot update an installed copy.

## Known limits
- Reactions and pins sent while a friend is offline are queued (7 days) and delivered when they reconnect; typing indicators are live only.
- Self-destruct timers start when a message arrives (receiver) or is delivered (sender); copies in Sh-Fill and screenshots are not affected.
- Two-step verification password cannot be recovered; "Forgot password" wipes the app data.
- Sh-Fill files are plain (not encrypted) and live in shared storage; Android 11+ needs "All files access" for the app (sideloaded APK only, Google Play restricts this permission).
- No push server: both people must have the app running to exchange messages (foreground service helps while in background).
- One device per key. A TURN server is needed for some mobile networks (default list uses the free Open Relay; override in Settings).
