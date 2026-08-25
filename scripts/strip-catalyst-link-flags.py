#!/usr/bin/env python3
"""Drop iOS-only pod linker flags from Pods-Flick xcconfigs (Mac Catalyst)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUPPORT = ROOT / "ios/Pods/Target Support Files/Pods-Flick"
LIBS = (
    "ReactNativeFs",
    "ReactNativeStaticServer",
    "react-native-background-downloader",
    "react-native-webrtc",
)


def strip_xcconfig(path: Path) -> None:
    text = path.read_text()
    for lib in LIBS:
        text = text.replace(f' -l"{lib}"', "")
        text = text.replace(f' "${{PODS_CONFIGURATION_BUILD_DIR}}/{lib}"', "")
    text = text.replace(' -framework "WebRTC"', "")
    path.write_text(text)


def patch_frameworks_sh(path: Path) -> None:
    if not path.exists():
        return
    original = '  install_framework "${PODS_XCFRAMEWORKS_BUILD_DIR}/JitsiWebRTC/WebRTC.framework"'
    replacement = (
        '  if [ "${EFFECTIVE_PLATFORM_NAME}" != "-maccatalyst" ]; then '
        'install_framework "${PODS_XCFRAMEWORKS_BUILD_DIR}/JitsiWebRTC/WebRTC.framework"; fi'
    )
    text = path.read_text()
    if original in text:
        path.write_text(text.replace(original, replacement))


def main() -> None:
    if not SUPPORT.exists():
        return
    for name in ("Pods-Flick.debug.xcconfig", "Pods-Flick.release.xcconfig"):
        path = SUPPORT / name
        if path.exists():
            strip_xcconfig(path)
    patch_frameworks_sh(SUPPORT / "Pods-Flick-frameworks.sh")


if __name__ == "__main__":
    main()
