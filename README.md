<div align="center">
  <img src="https://github.com/sheeshcake/Flickv4/blob/v2.x.x/assets/images/logo-full.png" alt="Flickv4 Logo" width="150" />
  <p><strong>Your Personal Streaming Sanctuary</strong></p>
  <p>Version <strong>2.0</strong> — a full overhaul. Rebuilt UI, Expo-native playback, background downloads, and first-class Android TV &amp; large-screen layouts.</p>
  
  <p>
    <img src="https://img.shields.io/badge/version-2.0-E50914?style=flat-square" alt="Version 2.0" />
    <img src="https://img.shields.io/badge/Expo-57-000020?style=flat-square&logo=expo" alt="Expo" />
    <img src="https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=flat-square&logo=react" alt="React Native" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20TV-lightgrey?style=flat-square" alt="Platform" />
    <img src="https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square" alt="License" />
  </p>
</div>

---

## What's New in 2.0

Flickv4 2.0 is a ground-up revamp—not a polish pass. The app was rebuilt on **Expo SDK 57**, **React Native 0.86**, and a modern UI stack so phone, tablet, and TV feel like one product.

### Overhaul highlights

| Area | What changed |
|------|----------------|
| **UI system** | New dark-first interface on **gluestack-ui v5** + **NativeWind v5** / Tailwind CSS v4—shared components, consistent spacing, and responsive layouts |
| **Player** | Custom player on **expo-video** with quality & aspect controls, subtitle tracks/overlay, episode drawer, PiP, and TV remote support |
| **Downloads** | Background downloads (direct + HLS), pause/resume, progress notifications via Notifee, and a redesigned Downloads screen |
| **TV & large screens** | Android TV / Leanback shell, side navigation, focusable UI, and Mac Catalyst layouts that share the TV grid |
| **Architecture** | Cleaner `src/` layout—hooks, services, navigators, and providers instead of a monolithic App |
| **Extras** | In-app update checks, Coming Soon handling, server settings, smarter continue-watching, and **watch party** (synced playback, chat, optional camera) |

### Still the same idea

No ads. No subscriptions. Movies and TV via TMDB metadata, offline watching when you need it, and a Netflix-inspired dark UI—just rebuilt to last.

---

## Features

- **Continue Watching** — Resume movies and episodes where you left off
- **Watch party** — Watch the same title together; sync play/pause/seek, chat, reactions, and an optional in-room camera
- **Offline downloads** — Queue, pause, resume; grouped TV episodes; live progress
- **Subtitles** — Multi-language tracks with size, color, and position controls
- **Search & browse** — TMDB-backed home rows, detail pages, cast, trailers, recommendations
- **Adaptive layouts** — Phone, tablet, and TV shells from one codebase
- **Picture-in-Picture** — Background-friendly playback where the platform supports it

---

## Watch party

Watch party is **beta**. Rooms, sync, and the web companion can still be unreliable.

Everyone plays the **same title on their own device**. The room only shares **play, pause, and seek** — the host’s controls lead, guests follow. Up to **8** people can be in a room. Friends can join from **Flick** or the **web companion** (QR code or link).

### Host a room

1. Open a movie or episode and tap **Watch party**.
2. Pick the name others will see. Optionally set a password for a private room.
3. Tap **Create room**, then share the **code**, the **Share** sheet, or the **Scan for web** QR.
4. Tap **Play together** when you’re ready.

### Join a room

- **In Flick:** Settings → **Join watch party**. Pick a live public room or enter the host’s code (and password if they set one).
- **Web:** Scan the host’s QR, or open the companion link they shared. The page can also hand you back into Flick via `flick://party/CODE`.
- **Deep link:** Opening `flick://party/CODE` (or `com.wfrdee.flick://party/CODE`) jumps straight to join.

Set **Watch party name** in Settings — that’s what shows in chat, reactions, and the member list.

### In the player

Once you’re in a room you can:

- Follow the host’s playhead (guests can’t independently scrub the group)
- Send **chat** and on-screen **reactions**
- **Join camera** for an optional video-call grid (mute / cam off / hide tiles). Camera is not available on Android TV.

Playback waits when someone is buffering. If the host leaves the player to pick another title, guests stay in the room until they leave or the host comes back.

### From source

Official GitHub builds already point at the public party server. If you compile Flick yourself, set `EXPO_PUBLIC_WATCH_PARTY_URL` (WebSocket, e.g. `wss://…`) in `.env` or the feature stays hidden. The Node server and web companion live in `party-server/`.

---

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Expo ~57 · React Native 0.86 · React 19 |
| Language | TypeScript |
| UI | gluestack-ui v5 · NativeWind v5 · Tailwind CSS v4 |
| Playback | expo-video |
| Downloads | `@kesha-antonov/react-native-background-downloader` · Notifee |
| Navigation | React Navigation 7 |
| Data | TMDB · Wyzie (subtitles) |
| Watch party | WebSocket room server (`party-server/`) · WebRTC camera |

---

## Installation

Grab the latest **APK** (Android) or **IPA** (iOS) from [GitHub Releases](https://github.com/sheeshcake/Flickv4/releases). Files are named `Flick-<version>.apk` and `Flick-<version>.ipa`.

### Android

1. Download `Flick-<version>.apk` from the latest release.
2. Open the file on your device and allow installs from that source if Android asks.
3. Open Flick and grant storage / notification permissions when prompted.

Android TV: sideload the same APK (USB, network, or a file manager), then launch Flick from the apps row.

### iOS (SideStore)

Flick is **not on the App Store**. The IPA on GitHub is unsigned, so you install it with [SideStore](https://sidestore.io), which signs it with **your** Apple ID. A computer is only needed once, to install SideStore itself.

You need:

- iPhone or iPad on **iOS / iPadOS 15 or later**, with a passcode
- A free Apple Account (Apple ID)
- Wi-Fi (not cellular) when installing or refreshing apps
- [LocalDevVPN](https://apps.apple.com/app/localdevvpn/id6755608044) from the App Store
- A Mac, Windows, Linux, or Chromebook computer for the first SideStore install

Follow SideStore’s official guides for the computer step — they change more often than Flick does:

1. [Prerequisites](https://docs.sidestore.io/docs/installation/prerequisites) — install **iloader** and **LocalDevVPN**, then connect the VPN.
2. [Install SideStore](https://docs.sidestore.io/docs/installation/install) — USB-connect the device, install SideStore (Stable) with iloader, trust the developer app, turn on **Developer Mode**, sign in with the same Apple Account, then tap the **7 DAYS** counter next to SideStore under **My Apps** to finish setup.

Then install Flick:

1. On the iPhone or iPad, download `Flick-<version>.ipa` from [GitHub Releases](https://github.com/sheeshcake/Flickv4/releases) (Safari or Files). AirDrop from a Mac works too.
2. Open **LocalDevVPN** and tap **Connect**. Leave it on for the rest of these steps.
3. Open **SideStore** → **My Apps** → **+** (top of the screen).
4. Choose the Flick IPA from Files.
5. Wait until SideStore finishes signing and installing. Flick appears on the Home Screen.
6. If iOS blocks the first launch: **Settings → General → VPN & Device Management** → your Apple Account → **Trust**.

To update later, download the newer IPA and install it the same way (over the existing app). Your data stays on the device.

#### Refresh every 7 days

Apple’s free developer signing expires after **7 days**. Before Flick (or SideStore) expires:

1. Connect to Wi-Fi.
2. Open **LocalDevVPN** and connect.
3. In SideStore → **My Apps**, tap the day counter next to **Flick** (and SideStore if it is low).

A free Apple Account can keep **3 apps** installed at once, including SideStore, and can register at most **10 App IDs per week**. If install fails, SideStore’s [common issues](https://docs.sidestore.io/docs/troubleshooting/common-issues) and [error codes](https://docs.sidestore.io/docs/troubleshooting/error-codes) are the first place to look.

---

## Important Notice: Web Scraper

> **The web scraping engine lives in a private repository.**

Public scrapers get patched fast and abused just as fast. Keeping the resolver private helps the app stay usable longer. **The rest of Flickv4—UI, player, downloads, TV shell—remains open source under GPL-3.0.**

---

## 💬 Community & Discussions

Have a suggestion, found a bug, want to share your server configuration, or just want to discuss Flickv4?

Join the **GitHub Discussions** page:

👉 **https://github.com/sheeshcake/Flickv4/discussions**

You can use Discussions for:

- 💡 Feature requests and ideas
- ❓ Questions and community support
- 🌐 Server sharing and recommendations
- 🛠 Troubleshooting and setup help
- 📢 Announcements and general discussions

Before opening a new discussion, please search to see if your topic has already been covered.

---

## Contributing

If Flickv4 has been useful, you can support continued development:

<a href="https://www.paypal.com/paypalme/wfrdee" target="_blank">
  <img src="https://www.buymeacoffee.com/assets/img/custom_images/purple_img.png" alt="Buy Me A Coffee" height="41" width="174">
</a>

---

## Author

**Wendale Franz Dy**
- GitHub: [@sheeshcake](https://github.com/sheeshcake)
- Facebook: [@wfrdee](https://facebook.com/wfrdee)

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** — see the [LICENSE](LICENSE) file for details.

| You can | You must | You cannot |
|---------|----------|------------|
| Use, modify, and distribute | Credit the author · disclose source · keep GPL-3.0 | Hold the author liable · strip attribution |

---

## Legal Disclaimer

Any legal issues regarding content should be taken up with the actual file hosts and providers. Flick(v4) does not host, upload, or manage videos—it aggregates publicly accessible links for educational and personal use, similar to a search engine. Users are responsible for complying with local law. Use at your own risk.

---

## Acknowledgments

- **TMDB** for the movie/TV database API
- **React Native & Expo** communities for the tooling this rebuild stands on
- Open source contributors whose libraries power playback, downloads, and UI

---

<div align="center">
  
**Built with care on Expo & React Native — Flickv4 2.0**

⭐ Star this repo if you find it useful!

</div>
