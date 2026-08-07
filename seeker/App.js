/**
 * Gift2U Seeker / Android shell
 * Loads the production web game in a full-screen WebView.
 * Free Energy on Seeker → native AdMob rewarded (completion callback).
 * Web browser still uses Monetag (handled entirely in the web app).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

const DEFAULT_URL = 'https://gift2u.fun/play';

/** Live AdMob IDs — hardcoded so release builds never fall back to Google test units. */
const LIVE_ADMOB_APP_ID = 'ca-app-pub-2758551027842720~3312205373';
const LIVE_ADMOB_REWARDED = 'ca-app-pub-2758551027842720/9012802776';

/**
 * Marks the page as Gift2U Seeker shell so Free Energy uses AdMob, never Monetag.
 * Must run before game JS evaluates Free Energy.
 */
const SEEKER_SHELL_INJECT = `
(function(){
  try {
    window.__GIFT2U_SEEKER_SHELL__ = true;
    window.__GIFT2U_ADMOB__ = true;
    window.__GIFT2U_ADMOB_UNIT__ = '${LIVE_ADMOB_REWARDED}';
    try { sessionStorage.setItem('gift2u_seeker','1'); } catch (e) {}
    try { localStorage.setItem('gift2u_seeker','1'); } catch (e) {}
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('seeker') !== '1') {
        u.searchParams.set('seeker','1');
        window.history.replaceState(null,'',u.toString());
      }
    } catch (e) {}
  } catch (e) {}
  true;
})();
`;

/** MWA account.address is base64 → base58 for the web UI */
function mwaAddressToBase58(base64Address) {
  const bytes = Buffer.from(String(base64Address), 'base64');
  return new PublicKey(bytes).toBase58();
}

/** Always use live rewarded unit unless app.json forces test mode. */
const getRewardedUnitId = () => {
  const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
  if (extra.admobUseTestIds === true || extra.admobUseTestIds === 'true') {
    return TestIds.REWARDED;
  }
  if (extra.admobRewardedUnitId && String(extra.admobRewardedUnitId).startsWith('ca-app-pub-')) {
    const id = String(extra.admobRewardedUnitId);
    // Never silently use Google sample units in store builds
    if (id.includes('3940256099942544')) return LIVE_ADMOB_REWARDED;
    return id;
  }
  return LIVE_ADMOB_REWARDED;
};

const useTestAds = () => {
  const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
  return extra.admobUseTestIds === true || extra.admobUseTestIds === 'true';
};

export default function App() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const adBusyRef = useRef(false);
  const adsReadyRef = useRef(false);

  const uri = useMemo(() => {
    const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
    const base = extra.webUrl || DEFAULT_URL;
    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}seeker=1`;
  }, []);

  const rewardedUnitId = useMemo(() => {
    if (useTestAds()) return TestIds.REWARDED;
    return getRewardedUnitId();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await mobileAds().initialize();
        if (!cancelled) {
          adsReadyRef.current = true;
          console.log('[Gift2U Seeker] AdMob initialized, unit=', rewardedUnitId);
        }
      } catch (e) {
        console.warn('[Gift2U Seeker] AdMob init failed', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rewardedUnitId]);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const injectJsCallback = useCallback((fnName, payload) => {
    const json = JSON.stringify(payload);
    const eventName =
      fnName === '__gift2uOnAdResult'
        ? 'gift2u-ad-result'
        : fnName === '__gift2uOnWalletResult'
          ? 'gift2u-wallet-result'
          : '';
    const eventLine = eventName
      ? `try { window.dispatchEvent(new CustomEvent('${eventName}', { detail: ${json} })); } catch (e) {}`
      : '';
    const js = `
      (function(){
        try {
          window.__GIFT2U_SEEKER_SHELL__ = true;
          window.__GIFT2U_ADMOB__ = true;
        } catch (e) {}
        try {
          if (typeof window.${fnName} === 'function') {
            window.${fnName}(${json});
          }
        } catch (e) {}
        ${eventLine}
        true;
      })();
    `;
    try {
      webRef.current?.injectJavaScript(js);
    } catch (e) {
      console.warn(`[Gift2U Seeker] inject ${fnName} failed`, e?.message || e);
    }
  }, []);

  const injectAdResult = useCallback(
    (payload) => injectJsCallback('__gift2uOnAdResult', payload),
    [injectJsCallback],
  );

  const injectWalletResult = useCallback(
    (payload) => injectJsCallback('__gift2uOnWalletResult', payload),
    [injectJsCallback],
  );

  /**
   * Native Mobile Wallet Adapter (Seed Vault / Phantom / etc. on Seeker).
   * WebView MWA does NOT work — must run here, same idea as AdMob for ads.
   *
   * cluster MUST be 'mainnet-beta' | 'devnet' | 'testnet'
   * (NOT 'solana:mainnet' — that invalid param was shown as "cancelled")
   */
  const connectWalletNative = useCallback(
    async (requestId) => {
      try {
        const auth = await transact(async (wallet) => {
          return wallet.authorize({
            cluster: 'mainnet-beta',
            identity: {
              name: 'Gift2U',
              uri: 'https://gift2u.fun',
              // Relative path only when icon is set (MWA rule)
              icon: '/Gift2u_logo.png',
            },
          });
        });

        const account = auth?.accounts?.[0];
        if (!account?.address) {
          injectWalletResult({
            requestId,
            success: false,
            error: 'No wallet account returned. Try again.',
          });
          return;
        }

        let address;
        try {
          address = mwaAddressToBase58(account.address);
        } catch (convErr) {
          // Some wallets may already return base58
          const raw = String(account.address || '');
          if (raw.length >= 32 && raw.length <= 64 && !raw.includes('/')) {
            address = raw;
          } else {
            throw convErr;
          }
        }

        const label = account.label || account.display_address || 'Seeker wallet';
        injectWalletResult({
          requestId,
          success: true,
          address,
          label: String(label),
          authToken: auth.auth_token || null,
        });
        console.log('[Gift2U Seeker] wallet connected', address);
      } catch (e) {
        const msg = e?.message || e?.name || String(e);
        const code = e?.code != null ? String(e.code) : '';
        const data = e?.data != null ? String(e.data) : '';
        const full = [code && `code ${code}`, msg, data].filter(Boolean).join(' · ');
        console.warn('[Gift2U Seeker] wallet connect failed', full, e);
        // Only say "cancelled" for real user cancel — not for protocol errors
        const userCancel =
          /user.?cancel|cancelled by user|rejected by user|declined by user/i.test(msg) ||
          code === 'ERROR_AUTHENTICATE' && /cancel/i.test(msg);
        injectWalletResult({
          requestId,
          success: false,
          error: userCancel
            ? 'You cancelled the wallet prompt. Tap Connect again and approve.'
            : full || 'Could not connect wallet. Is Seed Vault set up on this Seeker?',
        });
      }
    },
    [injectWalletResult],
  );

  const showRewardedAd = useCallback(
    (requestId) => {
      if (adBusyRef.current) {
        injectAdResult({
          requestId,
          success: false,
          error: 'An ad is already playing. Try again in a moment.',
        });
        return;
      }
      adBusyRef.current = true;

      const fail = (error) => {
        adBusyRef.current = false;
        injectAdResult({
          requestId,
          success: false,
          error: error || 'Ad failed',
          network: 'AdMob',
        });
      };

      try {
        const rewarded = RewardedAd.createForAdRequest(rewardedUnitId, {
          requestNonPersonalizedAdsOnly: false,
        });

        let earned = false;
        const unsubs = [];

        const cleanup = () => {
          unsubs.forEach((u) => {
            try {
              u();
            } catch {
              /* ignore */
            }
          });
        };

        unsubs.push(
          rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
            rewarded.show().catch((e) => {
              cleanup();
              fail(e?.message || 'Could not show ad');
            });
          }),
        );

        unsubs.push(
          rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            earned = true;
          }),
        );

        unsubs.push(
          rewarded.addAdEventListener(AdEventType.CLOSED, () => {
            cleanup();
            adBusyRef.current = false;
            if (earned) {
              injectAdResult({
                requestId,
                success: true,
                network: 'AdMob',
              });
            } else {
              injectAdResult({
                requestId,
                success: false,
                error: 'Ad closed before reward. Watch the full ad for Free Energy.',
                network: 'AdMob',
              });
            }
          }),
        );

        unsubs.push(
          rewarded.addAdEventListener(AdEventType.ERROR, (err) => {
            cleanup();
            fail(err?.message || 'Ad failed to load');
          }),
        );

        rewarded.load();
      } catch (e) {
        fail(e?.message || 'AdMob not available');
      }
    },
    [injectAdResult, rewardedUnitId],
  );

  const onWebMessage = useCallback(
    (event) => {
      let data;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;

      if (data.type === 'WATCH_REWARDED_AD' && data.requestId) {
        if (!adsReadyRef.current) {
          // Still try — initialize may be racing
          mobileAds()
            .initialize()
            .then(() => {
              adsReadyRef.current = true;
              showRewardedAd(data.requestId);
            })
            .catch((e) => {
              injectAdResult({
                requestId: data.requestId,
                success: false,
                error: e?.message || 'Ads not ready',
              });
            });
          return;
        }
        showRewardedAd(data.requestId);
        return;
      }

      if (data.type === 'CONNECT_WALLET' && data.requestId) {
        connectWalletNative(data.requestId);
      }
    },
    [injectAdResult, showRewardedAd, connectWalletNative],
  );

  /** Wallet deep links / MWA must leave the WebView (Seed Vault, Phantom, etc.) */
  const handleWalletUrl = useCallback((url) => {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    const isWallet =
      u.startsWith('solana-wallet:') ||
      u.startsWith('solana:') ||
      u.startsWith('intent:') ||
      u.startsWith('phantom:') ||
      u.startsWith('solflare:') ||
      u.startsWith('backpack:') ||
      u.includes('://phantom.app/') ||
      u.includes('://solflare.com/') ||
      u.includes('://backpack.app/');
    if (!isWallet) return false;
    Linking.openURL(url).catch((e) =>
      console.warn('[Gift2U Seeker] open wallet url failed', e?.message || e),
    );
    return true;
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.flex}>
        <WebView
          ref={webRef}
          source={{ uri }}
          style={styles.flex}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            // Re-stamp shell flag after every navigation (SPA can drop ?seeker=1)
            try {
              webRef.current?.injectJavaScript(SEEKER_SHELL_INJECT);
            } catch (e) {
              /* ignore */
            }
          }}
          onNavigationStateChange={(nav) => {
            setCanGoBack(nav.canGoBack);
            if (nav?.url) handleWalletUrl(nav.url);
          }}
          onShouldStartLoadWithRequest={(req) => {
            if (handleWalletUrl(req?.url)) return false;
            return true;
          }}
          onMessage={onWebMessage}
          injectedJavaScriptBeforeContentLoaded={SEEKER_SHELL_INJECT}
          injectedJavaScript={SEEKER_SHELL_INJECT}
          applicationNameForUserAgent="Gift2USeeker"
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Ads use native AdMob only — never allow Monetag popups in this shell
          setSupportMultipleWindows={false}
          originWhitelist={['*']}
          mixedContentMode="compatibility"
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
        />
        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color="#fbef43" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  flex: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
});
