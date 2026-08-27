#!/usr/bin/env bash
# Debug Mac Catalyst build. Produces build/macos/Flick.app and opens it.
# Uses ios/Flick.xcworkspace — Catalyst is an iOS target, not a separate Xcode project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  # Do not `source` — codesign identities contain parentheses (TEAMID).
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    export "${key}=${value}"
  done < .env
fi

APP_VERSION="${APP_VERSION:-2.1.5}"
ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE:-1}"
OUT_DIR="${ROOT}/build/macos"
DERIVED="${OUT_DIR}/DerivedData"
APP_DEST="${OUT_DIR}/Flick.app"

mkdir -p "$OUT_DIR"
rm -rf "$DERIVED" "$APP_DEST"

if [ ! -f ios/.xcode.env.local ]; then
  echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${APP_VERSION}" ios/Flick/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${ANDROID_VERSION_CODE}" ios/Flick/Info.plist

xcodebuild \
  -workspace ios/Flick.xcworkspace \
  -scheme Flick \
  -configuration Debug \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  MARKETING_VERSION="${APP_VERSION}" \
  CURRENT_PROJECT_VERSION="${ANDROID_VERSION_CODE}" \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build

APP="${DERIVED}/Build/Products/Debug-maccatalyst/Flick.app"
if [ ! -d "$APP" ]; then
  echo "Flick.app was not produced at ${APP}" >&2
  exit 1
fi

cp -R "$APP" "$APP_DEST"
# shellcheck source=sign.sh
source "${ROOT}/macos/sign.sh"
sign_catalyst_app "$APP_DEST"

echo "App: ${APP_DEST} (${APP_VERSION})"
open "$APP_DEST"
