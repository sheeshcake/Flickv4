#!/usr/bin/env bash
# Sign a Mac Catalyst .app so TCC can grant camera / mic / files.
# Prefers MACOS_CODESIGN_IDENTITY, then Developer ID Application, then
# Apple Development, then ad-hoc (-). Always applies Hardened Runtime and
# macos/Flick.catalyst.entitlements.

resolve_macos_codesign_identity() {
  if [ -n "${MACOS_CODESIGN_IDENTITY:-}" ]; then
    printf '%s\n' "$MACOS_CODESIGN_IDENTITY"
    return
  fi

  local identities
  identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"
  local line=""
  line="$(printf '%s\n' "$identities" | grep -F 'Developer ID Application' | grep -v 'CSSMERR' | head -1 || true)"
  if [ -z "$line" ]; then
    line="$(printf '%s\n' "$identities" | grep -F 'Apple Development' | grep -v 'CSSMERR' | head -1 || true)"
  fi
  if [ -n "$line" ]; then
    awk '{print $2}' <<<"$line"
    return
  fi
  printf '%s\n' "-"
}

sign_catalyst_app() {
  local app="${1:?sign_catalyst_app: missing .app path}"
  local entitlements="${ROOT}/macos/Flick.catalyst.entitlements"
  if [ ! -f "$entitlements" ]; then
    echo "Missing entitlements: ${entitlements}" >&2
    exit 1
  fi
  if [ ! -d "$app" ]; then
    echo "Missing app bundle: ${app}" >&2
    exit 1
  fi

  local identity
  identity="$(resolve_macos_codesign_identity)"

  local -a extra=(--force --options runtime)
  if [ "$identity" != "-" ]; then
    extra+=(--timestamp)
  fi

  if [ -d "${app}/Contents/Frameworks" ]; then
    local fw
    while IFS= read -r fw; do
      codesign "${extra[@]}" --sign "$identity" "$fw"
    done < <(find "${app}/Contents/Frameworks" -name '*.framework' -maxdepth 2 -prune 2>/dev/null)
    local lib
    while IFS= read -r lib; do
      codesign "${extra[@]}" --sign "$identity" "$lib"
    done < <(find "${app}/Contents/Frameworks" -name '*.dylib' -maxdepth 3 2>/dev/null)
  fi

  codesign "${extra[@]}" --entitlements "$entitlements" --sign "$identity" "$app"
  echo "Signed ${app} identity=${identity}"
}
