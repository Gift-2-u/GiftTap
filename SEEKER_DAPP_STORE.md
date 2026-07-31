# Gift2U: Web + Solana Seeker dApp Store

You keep **one game** (this Vite React app). Delivery is dual:

| Surface | What it is |
|--------|------------|
| **Web** | `https://gift2u.fun` — play in any browser (as now) |
| **Seeker dApp Store** | Android APK wrapping the same site (PWA / TWA) or Expo WebView shell |

Solana Mobile’s official path for web games: **PWA → Bubblewrap TWA → signed APK → dApp Store**.  
See: [Publishing a Web App](https://docs.solanamobile.com/recipes/general/publishing-a-web-app)

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │  Gift2U web app (this repo) │
                    │  Vite + React + wallets     │
                    │  Deployed on Vercel / CDN   │
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        Browser users      Seeker / Android      Future native
        gift2u.fun         dApp Store APK         (optional RN)
                           (TWA or WebView)
```

Same Supabase, same game wallet, same Solana connect (MWA works best inside the store app / HTTPS).

---

## Part A — Keep shipping the web app (unchanged workflow)

```bash
cd /home/tower/gift_memecoin   # or your clone
npm run dev      # local
npm run build    # production
# Deploy dist/ to Vercel / your host → https://gift2u.fun
```

Ensure production is **HTTPS** so Mobile Wallet Adapter can register.

---

## Part B — Official path: PWA → Bubblewrap APK (recommended for Seeker store)

### 1. PWA files (already added in this repo)

- `public/manifest.webmanifest`
- Linked from `index.html`
- Icons: `public/Gift2u_logo.png`

After deploy, check:

- `https://gift2u.fun/manifest.webmanifest`
- Lighthouse → PWA section (optional)

### 2. Build a Trusted Web Activity (TWA) with Bubblewrap

On a machine with Node + Java (JDK 17+):

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://gift2u.fun/manifest.webmanifest
# Follow prompts: package id e.g. fun.gift2u.tap
bubblewrap build
```

You get a **signed release APK** (or AAB if configured).

Details: [Build and sign an APK](https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk)

### 3. Submit to Solana dApp Store

1. Create publisher account: [publish.solanamobile.com](https://publish.solanamobile.com)  
2. Prepare assets (icons, screenshots, listing text)  
3. Submit the APK through the publisher portal  
4. Wait for review (typically a few business days)

Guides:

- [dApp publishing setup](https://docs.solanamobile.com/dapp-publishing/setup)  
- [Submit a new app](https://docs.solanamobile.com/dapp-store/submit-new-app)

---

## Part C — Optional: Expo WebView shell (`seeker/`)

For a true **SDK-style** Android project (React Native + WebView loading the live site):

```bash
cd seeker
npm install
# Set your production URL in app.json extra.webUrl
npx expo prebuild --platform android
npx expo run:android
```

Then sign the APK and submit the same way as Part B.

This is useful if you later want native splash screens, push, or deeper Seed Vault UI without rewriting Gift Tap.

---

## Wallet connect on Seeker

| Context | Behavior |
|---------|----------|
| Web (Chrome on phone) | MWA / in-app browser (see WalletHub Solana tab) |
| Seeker / TWA APK | Same site; MWA works well with Seed Vault / installed wallets |
| Opened inside Phantom browser | Phantom injects provider → Select Wallet works like desktop |

Keep testing wallets on **https://gift2u.fun**.

---

## Checklist

- [x] Web game (current repo)
- [x] PWA manifest for store wrapping
- [x] Seeker Expo shell scaffold (`seeker/`)
- [x] Publishing guide (this file)
- [ ] Deploy latest web to `https://gift2u.fun`
- [ ] Bubblewrap APK (or Expo Android build)
- [ ] Submit on publish.solanamobile.com

---

## Notes

- **One game codebase** — do not fork Gift Tap for Seeker.  
- **Do not use localhost** for store / MWA testing.  
- Monetag `sw.js` remains separate; PWA can still use the same origin.  
- If you change domain, update `manifest.webmanifest` and Bubblewrap Digital Asset Links.  
