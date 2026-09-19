# Walk2u

**Native Android app** — package `fun.gift2u.walk2u`  
Code: `walk2u/shell/`

STEPN-style **GPS** walk + **signal bars** (not a Gift Tap WebView).

## Rules (frozen)

| Rule | Decision |
|------|----------|
| Walk2u points | 1 Walk2u per 1,000 steps (from GPS distance) |
| $G2U milestones | From km walked (later server) |
| No shoe | Cannot start |
| Energy | 1 block = 5 minutes rewarded walk |
| Tracking | **GPS** + accuracy bars (strong / good / weak / poor) |
| Durability | Drains by km |

## Build APK (on your PC)

```bash
cd walk2u/shell
npm install
npx expo prebuild --platform android   # if android/ missing
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

APK: `android/app/build/outputs/apk/release/app-release.apk`  
→ Drive / USB → phone → Install → open **Walk2u** → **Link Health Connect / pedometer**.

## In-app flow

1. Home → **+ Demo shoe** / **+1 energy**  
2. **Start walking** → allow location once  
3. Watch **GPS bars** while you walk → **End walk**  
4. km from GPS; steps ≈ distance ÷ stride  

Rebuild after this change (`expo prebuild` if permissions changed, then `assembleRelease`).
