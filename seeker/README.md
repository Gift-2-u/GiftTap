# Gift2U — Seeker / Android shell

Thin **Expo (React Native)** app that loads the **same** web game (`https://gift2u.fun/play`) in a WebView.

- **Website** = full game in the browser  
- **This package** = installable APK for Solana Seeker dApp Store  

## Setup

```bash
cd seeker
npm install
# Copy logo (optional)
# mkdir -p assets && cp ../public/Gift2u_logo.png assets/icon.png
```

Set production URL in `app.json` → `expo.extra.webUrl` if needed.

## Run on Android device / emulator

```bash
npx expo prebuild --platform android
npx expo run:android
```

Requires Android SDK / Android Studio. Seeker device optional for local dev.

## Build release APK

- **EAS:** `npx eas build -p android --profile production`  
- Or Gradle after prebuild: `cd android && ./gradlew assembleRelease`

Then submit the APK via [publish.solanamobile.com](https://publish.solanamobile.com).

## Prefer the official PWA path?

Solana Mobile also supports wrapping the live site with **Bubblewrap** (Trusted Web Activity) without Expo. See `../SEEKER_DAPP_STORE.md`.
