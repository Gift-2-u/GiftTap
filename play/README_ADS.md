# Gift2U Seeker — Free Energy (AdMob)

## Split

| Surface | Network |
|---------|---------|
| Browser web app | Monetag (unchanged in `src/adService.js`) |
| Seeker APK WebView | Google AdMob **Rewarded** (native) |

## Flow

1. Web UI detects `?seeker=1` → `showRewardedAdWaterfall` posts `WATCH_REWARDED_AD` to the shell.
2. `seeker/App.js` loads/shows AdMob rewarded.
3. On reward + close → injects `window.__gift2uOnAdResult({ requestId, success: true })`.
4. Web grants +100 daily cap (same Supabase logic as web).

## Install & rebuild (you deploy)

```bash
cd seeker
npm install
npx expo prebuild --platform android --clean
# then build APK / run on Seeker
npx expo run:android
# or EAS / gradle release
```

`react-native-google-mobile-ads` needs a **dev/production build** (not Expo Go).

## Production AdMob IDs

In `seeker/app.json`:

1. Create an app in [AdMob](https://admob.google.com) (Android package `fun.gift2u.tap`).
2. Create a **Rewarded** ad unit.
3. Set:

```json
"plugins": [
  ["react-native-google-mobile-ads", {
    "androidAppId": "ca-app-pub-XXXXXXXX~YYYYYYYY",
    "iosAppId": "ca-app-pub-XXXXXXXX~ZZZZZZZZ"
  }]
],
"extra": {
  "admobUseTestIds": false,
  "admobRewardedUnitId": "ca-app-pub-XXXXXXXX/REWARDED_UNIT",
  "webUrl": "https://gift2u.fun/play"
}
```

4. Rebuild the native app after changing App ID / plugin.

Default config uses **Google test IDs** so you can verify the bridge without a live account.

## Web deploy

Ship the updated `src/adService.js` + `GiftTap.jsx` to production web so Seeker WebView gets the Seeker branch (`?seeker=1`). Monetag path is unchanged for normal browsers.
