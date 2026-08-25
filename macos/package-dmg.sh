#!/usr/bin/env bash
# Release Mac Catalyst archive packaged as a drag-and-drop DMG.
# Uses ios/Flick.xcworkspace — Catalyst is an iOS target, not a separate Xcode project.
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
OUT_DIR="${ROOT}/build/macos"
ARCHIVE="${OUT_DIR}/Flick.xcarchive"
DMG_ROOT="${OUT_DIR}/dmg_root"
APP_DEST="${OUT_DIR}/Flick.app"
DMG="${OUT_DIR}/Flick-${APP_VERSION}.dmg"

mkdir -p "$OUT_DIR"
rm -rf "$ARCHIVE" "$DMG_ROOT" "$APP_DEST" "$DMG"

if [ ! -f ios/.xcode.env.local ]; then
  echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${APP_VERSION}" ios/Flick/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${ANDROID_VERSION_CODE}" ios/Flick/Info.plist

xcodebuild \
  -workspace ios/Flick.xcworkspace \
  -scheme Flick \
  -configuration Release \
  -destination 'generic/platform=macOS,variant=Mac Catalyst' \
  -archivePath "$ARCHIVE" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  MARKETING_VERSION="${APP_VERSION}" \
  CURRENT_PROJECT_VERSION="${ANDROID_VERSION_CODE}" \
  DEBUG_INFORMATION_FORMAT=dwarf \
  SWIFT_ENABLE_EXPLICIT_MODULES=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  archive

APP="${ARCHIVE}/Products/Applications/Flick.app"
if [ ! -d "$APP" ]; then
  echo "Flick.app was not produced at ${APP}" >&2
  exit 1
fi

# Confirm this is a Catalyst Mac bundle, not an iPhone .app stuffed into a DMG.
if [ ! -d "${APP}/Contents" ]; then
  echo "Expected a Mac Catalyst bundle with Contents/ at ${APP}" >&2
  exit 1
fi

cp -R "$APP" "$APP_DEST"
# shellcheck source=sign.sh
source "${ROOT}/macos/sign.sh"
sign_catalyst_app "$APP_DEST"

mkdir -p "$DMG_ROOT"
cp -R "$APP_DEST" "${DMG_ROOT}/Flick.app"
ln -s /Applications "${DMG_ROOT}/Applications"

hdiutil create \
  -volname "Flick ${APP_VERSION}" \
  -srcfolder "$DMG_ROOT" \
  -ov \
  -format UDZO \
  "$DMG"

rm -rf "$DMG_ROOT"

echo "App: ${APP_DEST}"
echo "DMG: ${DMG} (${APP_VERSION})"
