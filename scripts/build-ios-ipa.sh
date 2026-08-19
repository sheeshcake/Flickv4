#!/usr/bin/env bash
# Build an unsigned Release IPA for sideloading (Sideloadly / AltStore / TrollStore).
# Expo CLI has no --archive / --exportArchive in SDK 57.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

APP_VERSION="${APP_VERSION:-2.1.5}"
ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE:-1}"
OUT_DIR="${ROOT}/build"
IPA="${OUT_DIR}/Flick.ipa"
DERIVED="${OUT_DIR}/DerivedData"

mkdir -p "$OUT_DIR"
rm -rf "$DERIVED" "${OUT_DIR}/Payload" "$IPA"

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${APP_VERSION}" ios/Flick/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${ANDROID_VERSION_CODE}" ios/Flick/Info.plist

xcodebuild \
  -workspace ios/Flick.xcworkspace \
  -scheme Flick \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  MARKETING_VERSION="${APP_VERSION}" \
  CURRENT_PROJECT_VERSION="${ANDROID_VERSION_CODE}" \
  build

APP="${DERIVED}/Build/Products/Release-iphoneos/Flick.app"
if [ ! -d "$APP" ]; then
  echo "Flick.app was not produced at ${APP}" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}/Payload"
cp -R "$APP" "${OUT_DIR}/Payload/"
(
  cd "$OUT_DIR"
  zip -qry "Flick.ipa" Payload
  rm -rf Payload
)

echo "IPA: ${IPA} (${APP_VERSION})"
