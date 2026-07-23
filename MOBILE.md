# TradeForge — Mobile (PWA + Android APK)

**One codebase → web, installable PWA, and a native Android APK.** The React app in
`frontend/` is already responsive (bottom tab bar on phones) and Capacitor-ready.

---

## 1. PWA (zero build tools — works today)

Deploy the web app (any static host) over HTTPS, open it on your phone's browser →
**Add to Home Screen**. It installs with an icon and launches full-screen. Nothing else
to do — `manifest.webmanifest`, service worker, and icons are already wired up.

---

## 2. Android APK (Capacitor)

### Prerequisites (on your machine)
- **Android Studio** (includes the Android SDK) — https://developer.android.com/studio
- **JDK 17** (bundled with recent Android Studio)
- Node.js 20+ (already used for the frontend)

### One-time dependency check
The Capacitor packages are already in `package.json`. If `node_modules` is fresh:
```powershell
cd frontend
npm install
```

### The hard dependency: a deployed backend
The APK is not served by a web server, so it can't use the `/api` dev proxy. It must call
your **deployed backend's absolute URL**. Before building the APK:

1. Deploy the backend (Render / Hugging Face Space / Railway) → e.g.
   `https://tradeforge-api.onrender.com`
2. Create `frontend/.env.production`:
   ```
   VITE_API_URL=https://tradeforge-api.onrender.com
   ```
3. On the backend, make sure `CORS_ORIGINS` includes the app origins (already the default):
   ```
   CORS_ORIGINS=https://localhost,capacitor://localhost,http://localhost,https://your-web-url
   ```

> For a quick **local** test without deploying, run the backend on your PC and set
> `VITE_API_URL=http://<your-PC-LAN-IP>:8000` (e.g. `http://192.168.1.5:8000`) so the phone
> on the same Wi-Fi can reach it. `http://localhost` won't work from the phone.

### Build the APK
```powershell
cd frontend
npm run build              # produces dist/ (bakes in VITE_API_URL)
npx cap add android        # one-time: creates the native android/ project
npx cap sync               # copies dist/ + plugins into the native project
npx cap open android       # opens Android Studio
```
In Android Studio: **Build ▸ Build Bundle(s)/APK(s) ▸ Build APK(s)**. The `.apk` lands in
`frontend/android/app/build/outputs/apk/debug/`. Copy it to your phone and install
(enable "install from unknown sources").

### After you change the React code
```powershell
npm run cap:sync           # = npm run build && npx cap sync
```
Then rebuild the APK in Android Studio. **No duplicate code — same `src/` drives everything.**

---

## 3. Publishing to the Play Store (optional)
- One-time Google Play Developer account: **$25**.
- Generate a signing keystore (`keytool`), build a signed **AAB** (`Build ▸ Generate Signed
  Bundle`), upload to the Play Console. Keep the `.keystore` safe — it's git-ignored.
- iOS requires a Mac + Xcode + Apple Developer account ($99/yr): `npx cap add ios`.

---

## App identity
Edit `frontend/capacitor.config.json` to change:
- `appId` — reverse-domain id (currently `com.tradeforge.app`); must be unique on the Play Store
- `appName` — display name under the icon (currently `TradeForge`)

App icons live in `frontend/public/icons/` (reused from the PWA). To customize the native
launcher icon specifically, use Android Studio's Image Asset Studio after `cap add android`.
