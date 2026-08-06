# Free Energy ads on Seeker — simple steps

## Big idea (3 lines)

1. Your old phone app (`gift2u-twa`) only opens the website. It cannot run phone ads.
2. The new phone app is the folder **`gift_memecoin/seeker`**. That one has AdMob ads.
3. Website = Monetag. New Seeker APK = AdMob. Same Free Energy button.

---

## What you do (in order)

### Step 1 — Put the website online

Deploy the game site the way you always do (so Free Energy code is live on gift2u.fun).

Without this, the phone still loads old web code.

---

### Step 2 — Build the ads APK (from WSL / terminal)

```bash
cd /home/tower/gift_memecoin/seeker
npm install
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
```

When it finishes, the APK is usually here:

```text
/home/tower/gift_memecoin/seeker/android/app/build/outputs/apk/release/app-release.apk
```

(If that path is missing, look under `seeker/android/app/build/outputs/apk/`.)

---

### Step 3 — Install on your Seeker phone

1. Copy the APK to the phone (USB, Drive, etc.)
2. Open the file on the phone and install it
3. Open **Gift2U**
4. Tap Free Energy → you should get a full-screen test ad (Google test ads until you add real AdMob IDs)

Or with USB debugging:

```bash
adb install -r /home/tower/gift_memecoin/seeker/android/app/build/outputs/apk/release/app-release.apk
```

---

### Step 4 — Later: put it on the dApp Store

When Free Energy works on your phone:

1. Go to https://publish.solanamobile.com  
2. Open your Gift2U app  
3. New version → upload this new APK  
4. Submit  

Same package name if possible: `fun.gift2u.tap` (check app.json). Signing key may differ from TWA — store rules may treat it as update or new app. If upload fails, use the portal help / keep testing with sideload first.

---

## About gift2u-twa

| App | Folder | Free Energy |
|-----|--------|-------------|
| Old Seeker app | `~/gift2u-twa` | Website only (Monetag), no native AdMob |
| New ads app | `gift_memecoin/seeker` | Native AdMob |

For **ads built into the APK**, use **`seeker`**, not `gift2u-twa`.

---

## Money later (optional)

1. Create account at https://admob.google.com  
2. Add Android app package `fun.gift2u.tap`  
3. Create a Rewarded ad unit  
4. Put the IDs in `seeker/app.json`  
5. Set `admobUseTestIds` to false  
6. Rebuild the APK (Step 2 again)

Until then, test ads are fine.
