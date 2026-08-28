#!/usr/bin/env bash
# Play AAB only. Password is typed here (take your time), never written to disk.
set -euo pipefail
cd "$(dirname "$0")"

echo "Google Play release build (play/ only)"
echo "Keystore: /home/tower/gift2u-twa/android.keystore  alias: Gift2u"
echo
read -r -s -p "Keystore password: " GIFT2U_KEYSTORE_PASSWORD
echo
if [ -z "${GIFT2U_KEYSTORE_PASSWORD}" ]; then
  echo "Empty password — aborted."
  exit 1
fi

export GIFT2U_KEYSTORE_PASSWORD
export GIFT2U_KEY_PASSWORD="${GIFT2U_KEYSTORE_PASSWORD}"

./gradlew bundleRelease

AAB="app/build/outputs/bundle/release/app-release.aab"
echo
if [ -f "$AAB" ]; then
  echo "Done. Upload this AAB to Play Console:"
  echo "  $(pwd)/$AAB"
else
  echo "Build finished but AAB not found at $AAB"
  exit 1
fi
