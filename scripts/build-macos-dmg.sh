#!/usr/bin/env bash
# Build an ad-hoc signed Release Mac Catalyst app and wrap it in a UDZO DMG.
# Sideload intent matches the unsigned IPA (Gatekeeper: right-click → Open).
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
ANDROID_VERSION_CODE="${ANDROID_VERSION_CODE:-${ANDROID_VERSION_CODE:-1}}"
OUT_DIR="${ROOT}/build"
DMG="${OUT_DIR}/Flick.dmg"
DERIVED="${OUT_DIR}/DerivedData-maccatalyst"
STAGE="${OUT_DIR}/dmg-stage"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE" "$DMG"
python3 "$ROOT/scripts/strip-catalyst-link-flags.py"

CATALYST_ENTITLEMENTS="${OUT_DIR}/Flick.catalyst.entitlements"
cat > "$CATALYST_ENTITLEMENTS" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict/>
</plist>
EOF

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${APP_VERSION}" ios/Flick/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${ANDROID_VERSION_CODE}" ios/Flick/Info.plist

xcodebuild \
  -workspace ios/Flick.xcworkspace \
  -scheme Flick \
  -configuration Release \
  -destination 'generic/platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$DERIVED" \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS=arm64 \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="$CATALYST_ENTITLEMENTS" \
  DEVELOPMENT_TEAM="" \
  MARKETING_VERSION="${APP_VERSION}" \
  CURRENT_PROJECT_VERSION="${ANDROID_VERSION_CODE}" \
  build

APP="$(find "${DERIVED}/Build/Products" -name 'Flick.app' -type d | head -n 1 || true)"
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "Flick.app was not produced under ${DERIVED}/Build/Products" >&2
  exit 1
fi

# iOS 26 SDK rejects ad-hoc identity during compile; sign the product after.
#
# The RN prebuilt frameworks embed for Mac Catalyst with a MALFORMED macOS
# bundle layout: a real Mach-O at the framework root (instead of a symlink into
# Versions/Current), `Versions/Current` as a real dir (instead of a symlink to
# A), and resource `.bundle`s sitting in the framework root. codesign rejects
# that with "bundle format is ambiguous" / "unsealed contents present in the
# root directory", which is why the previous script swallowed the failure and
# shipped an UNSEALED (linker-signed) app whose signature could not be verified.
#
# Fix: normalize each versioned framework into a well-formed bundle (symlinked
# Current + root symlinks, resources relocated under Versions/A), then sign
# INSIDE-OUT (nested bundles, then framework wrappers, then the app), and fail
# hard on a bad signature so a broken build never reaches a DMG.
normalize_framework() {
  local fw="$1" name base entry
  name="$(basename "$fw" .framework)"
  [ -d "$fw/Versions/A" ] || return 0   # flat (iOS-style) framework: leave as-is
  ( cd "$fw/Versions" && { [ -L Current ] || { rm -rf Current; ln -s A Current; }; } )
  # The framework root may contain only symlinks + Versions. Relocate any real
  # entry into Versions/A and symlink it back.
  for entry in "$fw"/*; do
    base="$(basename "$entry")"
    [ "$base" = "Versions" ] && continue
    [ -L "$entry" ] && continue
    mv "$entry" "$fw/Versions/A/$base"
    ( cd "$fw" && ln -s "Versions/Current/$base" "$base" )
  done
  [ -e "$fw/$name" ] || ( cd "$fw" && ln -s "Versions/Current/$name" "$name" )
  if [ -d "$fw/Versions/A/Resources" ] && [ ! -e "$fw/Resources" ]; then
    ( cd "$fw" && ln -s Versions/Current/Resources Resources )
  fi
}

if [ -d "${APP}/Contents/Frameworks" ]; then
  find "${APP}/Contents/Frameworks" -maxdepth 1 -type d -name '*.framework' -print0 |
    while IFS= read -r -d '' fw; do normalize_framework "$fw"; done

  # Nested resource bundles first (deepest first).
  find "${APP}/Contents/Frameworks" -depth -type d -name '*.bundle' -print0 |
    while IFS= read -r -d '' b; do
      codesign --force --sign - --timestamp=none "$b"
    done
  # Loose Mach-O files (dylibs, helper executables).
  find "${APP}/Contents/Frameworks" -type f \( -name '*.dylib' -o -perm -111 \) -print0 |
    while IFS= read -r -d '' bin; do
      codesign --force --sign - --timestamp=none "$bin"
    done
  # Framework wrappers (now well-formed, so no --deep needed).
  find "${APP}/Contents/Frameworks" -maxdepth 1 -type d -name '*.framework' -print0 |
    while IFS= read -r -d '' fw; do
      codesign --force --sign - --timestamp=none "$fw"
    done
fi

# Seal the app itself. This writes Contents/_CodeSignature. Fail hard: a
# swallowed failure here is exactly what shipped an unsealed (linker-signed)
# bundle whose signature could not be verified for distribution.
codesign --force --sign - --timestamp=none \
  --entitlements "$CATALYST_ENTITLEMENTS" "$APP"

# Gate packaging on a valid signature so a broken build never reaches a DMG.
codesign --verify --deep --strict --verbose=2 "$APP"

mkdir -p "$STAGE"
cp -R "$APP" "${STAGE}/Flick.app"
ln -s /Applications "${STAGE}/Applications"

hdiutil create \
  -volname "Flick" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG"

rm -rf "$STAGE"

echo "DMG: ${DMG} (${APP_VERSION})"
