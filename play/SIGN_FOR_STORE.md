# Sign Seeker AdMob APK for Solana Mobile Store

The portal error **"Debug APKs are not supported"** means the APK was signed with the Android **debug** key.  
Store needs the **same production keystore** as your first release (`gift2u-twa/android.keystore`, alias `Gift2u`).

## Fast path: re-sign the APK you already built

```bash
cd ~/gift_memecoin/seeker

# 1) Copy unsigned-or-debug release APK (or use existing)
APK=android/app/build/outputs/apk/release/app-release.apk

# 2) Sign with production keystore (you will be prompted for password)
/home/tower/Android/Sdk/build-tools/35.0.0/apksigner sign \
  --ks /home/tower/gift2u-twa/android.keystore \
  --ks-key-alias Gift2u \
  --out Gift2U-seeker-store-release.apk \
  "$APK"

# 3) Verify it is NOT "Android Debug"
/home/tower/Android/Sdk/build-tools/35.0.0/apksigner verify --print-certs \
  Gift2U-seeker-store-release.apk
```

You should see something like:

```text
Signer #1 certificate DN: CN=sebastien latour, OU=owner, O=Gift2u, C=ca
```

**Not** `CN=Android Debug`.

Upload **`Gift2U-seeker-store-release.apk`** to publish.solanamobile.com.

---

## Proper rebuild (recommended once)

Create `android/keystore.properties` (do not commit passwords):

```properties
storeFile=/home/tower/gift2u-twa/android.keystore
storePassword=YOUR_PASSWORD
keyAlias=Gift2u
keyPassword=YOUR_PASSWORD
```

Then:

```bash
cd ~/gift_memecoin/seeker/android
./gradlew clean assembleRelease
```

Output:

```text
app/build/outputs/apk/release/app-release.apk
```

Verify cert, then upload that file.

---

## Version (must be higher than store)

Current store TWA was **versionCode 4**. Seeker gradle should be **versionCode 5** / **1.0.3**.
