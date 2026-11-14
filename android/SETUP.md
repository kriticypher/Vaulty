# Running Vaultly on Android (WebView wrapper)

`android/` is a tiny native shell around the existing React frontend — the
same Vite + Express + Prisma backend, viewed in a hardened WebView that adds
Android niceties: persistent login cookies, a native file picker for invoice
uploads, and native downloads (CSV export / invoice PDFs go to the phone's
**Downloads** folder via `window.VaultlyAndroid.download(url, name)`).

## One-time setup (Android Studio)

1. Open Android Studio → **File ▸ Open…** → select the `android/` folder
   (not the repo root) → **Open** → **Trust project**.
2. Let the Gradle sync finish (first sync downloads dependencies — a few
   minutes). If Android Studio asks about a Gradle JDK, pick its embedded
   **jbr-21** (default).

## Run on the emulator

3. Start the two dev servers on your Mac, in this order:

   ```bash
   # Terminal 1 — backend (port 8000)
   cd backend-node && node src/server.js

   # Terminal 2 — frontend (port 5173)
   cd frontend && npm run dev -- --host
   ```

   (`--host` isn't strictly required for the emulator, but it also enables
   real-device use later without changing anything.)

4. In Android Studio: **Device Manager ▸ Create Virtual Device** (Pixel API 34+
   is fine) → select it → **Run ▶**.
5. The emulator's Chrome-WebView loads `http://10.0.2.2:5173` (`10.0.2.2` is
   the emulator's alias for your Mac's localhost). Register/log in and use the
   app normally — uploads, OCR, search, CSV export all work.

## Run on a real phone (optional)

6. Enable **Developer options ▸ USB debugging** on the phone, connect USB, and
   run `adb reverse` so the phone's `localhost` maps to your Mac:

   ```bash
   adb reverse tcp:5173 tcp:5173
   adb reverse tcp:8000 tcp:8000
   ```

7. In `android/app/src/main/java/com/vaulty/app/MainActivity.kt`, change the
   start URL to localhost:

   ```kotlin
   private val startUrl = "http://localhost:5173"
   ```

   (Keep the Mac servers running; both ports are forwarded to your laptop.)

> Alternative without adb: point both `startUrl` and the frontend at the
> laptop's LAN IP (e.g. `http://192.168.1.5:5173` — find it with
> `ipconfig getifaddr en0`). The frontend API base auto-derives from the page
> host, so nothing else needs changing. Both machines must be on the same Wi-Fi.

## What works / what's different in the wrapper

| Feature | Behaviour |
| --- | --- |
| Login / sessions | Session cookie persisted by the WebView — survives app restarts |
| Upload + OCR | Native Android file picker via the `<input type="file">` |
| Export CSV | Saved to **Downloads** (`vaultly-invoices.csv`), with a notification |
| Invoice download | Saved to **Downloads** with its original filename |
| Invoice preview | Downloads the file to **Downloads** (WebView can't open blob: viewers) |
| Back button | Walks WebView history, then exits |

## Notes

- The app allows **cleartext HTTP** (`usesCleartextTraffic`) because dev is
  plain `http://`. For a real production build you'd serve over HTTPS and turn
  this off.
- The frontend no longer hardcodes `localhost:8000` — `api.js` derives the API
  host from `location.hostname`, so the same build works in the browser, on the
  emulator (`10.0.2.2`), and on a device (`localhost` via adb reverse).
- The Gradle wrapper (Gradle 8.9), AGP 8.7.3 and Kotlin 2.0.21 versions match
  current Android Studio; the shell has **zero third-party libraries**, so
  dependency updates are rarely needed.
- `local.properties` (SDK path) is machine-specific and gitignored.

## Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| Backend "stops by itself" right after starting | Port 8000 is already taken (an old backend is still running). Kill it: `kill $(lsof -ti :8000)` — the backend now prints exactly this advice. |
| App shows "Webpage not available — ERR_CONNECTION_REFUSED" | The Vite dev server isn't running. Start it: `cd frontend && npm run dev -- --host`. |
| App loads but API calls fail | The backend isn't running. Start it: `cd backend-node && node src/server.js`. |
| Page looks like the desktop layout (sidebar on the left) | The WebView cached an old page. Reopen the app, or in Android Studio **App Inspection ▸ clear WebView data** — or bump the session: force-stop the app and relaunch. |
| Emulator can't reach the servers | Both servers must run on the Mac *before* launching the app; check `lsof -ti :8000` and `lsof -ti :5173` both return a PID. |
