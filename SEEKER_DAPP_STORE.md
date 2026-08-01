# Gift2U → Solana Seeker dApp Store

**Chosen path: Option A — Bubblewrap (Trusted Web Activity)**

One game codebase (this Vite app).  
- **Web:** `https://gift2u.fun`  
- **Seeker:** signed APK that opens the same site in Chrome TWA  

Expo shell in `seeker/` is optional later if you need native features (push, etc.). Not required for first store release.

Official docs: [Publishing a Web App](https://docs.solanamobile.com/recipes/general/publishing-a-web-app)

---

## Why Bubblewrap

| | |
|--|--|
| Product | Same site as browser users |
| Updates | Deploy web → Seeker users see changes (no APK for most game updates) |
| Effort | Lowest path to first store release |
| Solana Mobile | Recommended for websites / PWAs |

---

## Prerequisites (your machine)

- Node.js 18+
- Java JDK 17+
- Android SDK command-line tools (Bubblewrap can help install)
- Publisher account: [publish.solanamobile.com](https://publish.solanamobile.com)
- App created + **App NFT minted** (mainnet wallet, enough SOL)
- Live site HTTPS: `https://gift2u.fun` with working PWA manifest

Check:

- https://gift2u.fun/manifest.webmanifest  
- https://gift2u.fun/play loads the game  

Repo already has:

- `public/manifest.webmanifest`
- Linked from `index.html`
- Icons under `public/`

---

## Step 1 — Install Bubblewrap

```bash
npm install -g @bubblewrap/cli
bubblewrap --version
```

---

## Step 2 — Init project from your live PWA

Use a **new empty folder** (not inside this git repo unless you want to commit the Android project):

```bash
mkdir -p ~/gift2u-twa && cd ~/gift2u-twa
bubblewrap init --manifest https://gift2u.fun/manifest.webmanifest
```

Suggested answers:

| Prompt | Value |
|--------|--------|
| Package / Application ID | `fun.gift2u.tap` |
| App name | `Gift2U` |
| Launcher name | `Gift2U` |
| Theme color | `#0f172a` |
| Start URL | leave as manifest (`/play` or full URL) |
| Signing key | create new (save passwords & keystore path) |

**Important:** never lose the keystore + passwords. Every future update must use the same signing key.

---

## Step 3 — Build signed release APK

```bash
cd ~/gift2u-twa
bubblewrap build
```

Output is typically something like:

- `./app-release-signed.apk`  
  or under `./app/build/outputs/apk/release/`

That **signed APK** is what you upload to the Publisher Portal.

---

## Step 4 — Digital Asset Links (so TWA stays full-screen)

Bubblewrap prints a **SHA-256 fingerprint** for your signing key. Host this file on your site:

**URL:** `https://gift2u.fun/.well-known/assetlinks.json`

Example (replace fingerprint after build):

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "fun.gift2u.tap",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:…REPLACE_WITH_BUBBLEWRAP_FINGERPRINT…"
      ]
    }
  }
]
```

In this repo, put the file at:

```
public/.well-known/assetlinks.json
```

Then redeploy the website so the URL is live. Without this, the app may open with a browser URL bar (still works, looks less “native”).

---

## Step 5 — First release on Publisher Portal

1. Open [publish.solanamobile.com](https://publish.solanamobile.com) → your app  
2. You should see: **No releases yet. Create your first release**  
3. **New Version** / Create release  
4. Upload the **signed** APK from Step 3  
5. Fill listing: screenshots, short description, version name (`1.0.0`), version code (`1`)  
6. Submit  
7. Wallet on **Mainnet** — approve **every** prompt (upload + release NFT)  
8. Wait for review  

Store listing ideas (you used these before):

- **Subtitle:** Play-to-earn gift tap game on Solana  
- **Description:** Gift Tap on Gift2U — open gift boxes, earn shards, manage your in-app Solana wallet. Same game as gift2u.fun, optimized for Seeker.

---

## After you’re live

| Change | Need new APK? |
|--------|----------------|
| Game UI, economy, wallet fixes | **No** — deploy website |
| Package name / signing key | Avoid changing |
| Store screenshots / copy | Portal only |
| Android permissions / TWA config | **Yes** — `bubblewrap build` + new release |
| Bump store version for policy | **Yes** — new release APK |

---

## Checklist

- [x] Web game + PWA manifest in repo  
- [x] Path chosen: Bubblewrap (not Expo for v1)  
- [ ] App NFT minted (mainnet)  
- [ ] `bubblewrap init` + `build`  
- [ ] Keystore backed up safely  
- [ ] `assetlinks.json` deployed  
- [ ] First release uploaded + submitted  
- [ ] Approved in dApp Store  

---

## Optional later: Expo (`seeker/`)

Only if you need native push, deep Seed Vault UI, etc.  
Until then, ignore `seeker/` for publishing.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Wallet: network is devnet | Switch wallet to **Mainnet** |
| Mint / release fails | More mainnet SOL (~0.02+) |
| Manifest 404 | Deploy site; check `/manifest.webmanifest` |
| TWA shows URL bar | Fix `assetlinks.json` fingerprint + package name |
| Lost keystore | Cannot update same app; treat as new package (bad) |
