/**
 * Gift2U Seeker / Android shell
 * Loads the production web game in a full-screen WebView.
 * Same game as the website — Solana MWA works inside the WebView on Android/Seeker.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

const DEFAULT_URL = 'https://gift2u.fun/play';

export default function App() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const uri = useMemo(() => {
    const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
    const base = extra.webUrl || DEFAULT_URL;
    // Mark traffic as coming from the Seeker shell (optional analytics / UX)
    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}seeker=1`;
  }, []);

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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.flex}>
        <WebView
          ref={webRef}
          source={{ uri }}
          style={styles.flex}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          // Required for many wallet deep links / MWA from WebView
          originWhitelist={['*']}
          mixedContentMode="compatibility"
          // Android: allow third-party cookies if needed by auth
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
