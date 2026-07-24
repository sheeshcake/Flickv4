---
name: flick-player-controls
description: Architecture and conventions for the Flick video player (PlayerCore/PlayerControls, in-player sidebar drawers, TV focus handling) and for where a new player-adjacent setting should live (session state vs per-server vs persisted app-wide). Use when adding or modifying any in-player control, drawer, or scraper/server setting.
---

# Flick Player Controls

This skill documents how the player feature area (`src/components/player/`, `src/screens/PlayerScreen.tsx`, `src/screens/ServerSettingsScreen.tsx`) is put together, so a new control/drawer/setting follows the same shape as everything already there instead of inventing a new pattern.

Also read the `gluestack-ui-v5` skill for general component/styling rules (semantic tokens, component props over className) — this skill only covers what's specific to the player.

## Architecture map

```
PlayerScreen (src/screens/PlayerScreen.tsx)
  - resolves a playable source: local download > WebViewScraper-scraped stream
  - owns episode-switch state, "no source" empty state
  - once resolved, mounts:
PlayerCore (src/components/player/PlayerCore.tsx)
  - owns the single <Video> ref (react-native-video, NOT expo-video)
  - owns ALL drawer-open booleans + `overlayOpen` (OR of all of them)
  - owns playback state (paused, currentTime, duration, ...)
  - renders:
PlayerControls (src/components/player/PlayerControls.tsx)
  - "dumb" — top bar icon buttons, center play/pause/seek, scrub bar
  - every button is a callback prop; PlayerControls has no state of its own
```

Two right-sidebar drawers are rendered directly by `PlayerCore`, each gated by its own `useState` boolean owned by `PlayerCore`: `PlayerEpisodeDrawer` (episode/season switching, TV shows only) and `PlayerSettingsDrawer` (quality/aspect/speed/subtitles — a single grouped menu with per-category drill-down submenus, consolidating what used to be four separate bottom sheets). There is no bottom-sheet pattern left in the player — every in-player overlay menu is this sidebar shape now.

Stream *resolution* (before `PlayerCore` even mounts) is a separate concern, owned by `WebViewScraper.tsx` + the per-server config in `useServers.tsx` — see "Scraper vs player settings" below.

## Sidebar drawer shell

Both `PlayerEpisodeDrawer.tsx` and `PlayerSettingsDrawer.tsx` share one visual template:

```tsx
<Box style={StyleSheet.absoluteFill} className="z-50">
  <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
    <Box className="h-full w-full bg-background/70" />
  </Pressable>
  <Box className="absolute bottom-0 right-0 top-0 w-[45%] bg-card">
    <HStack className="items-center justify-between px-4 py-3">
      {/* header: title (+ back-chevron if the drawer has submenus), close X */}
    </HStack>
    <ScrollView className="flex-1 px-4 pb-6">
      {/* Focusable rows */}
    </ScrollView>
  </Box>
</Box>
```

The drawer returns `null` when `!visible` — it does not animate/unmount itself, the parent just conditionally renders it. Rows are `Focusable`, not plain `Pressable` (TV-friendly row-to-row D-pad focus); active-row state is `active ? 'font-semibold text-foreground' : 'text-muted-foreground'` text + `bg-primary/20` row background.

**`PlayerSettingsDrawer`'s internal navigation** (not a `PlayerCore` concern): it owns its own `activeCategory: 'quality' | 'aspect' | 'speed' | 'subtitles' | null` state, exactly like `PlayerEpisodeDrawer` owns its own `selectedSeason`. `activeCategory == null` renders the main menu (grouped rows: icon + label + current value + chevron, grouped under section headers like "Video" / "Audio & subtitles" / "Playback"); picking a row sets `activeCategory` to drill into that category's option list. Picking an option applies it and returns to the main menu (`setActiveCategory(null)`) — it does **not** close the drawer, since settings are grouped here precisely so a user can tweak more than one per visit. Only the scrim tap or the header `X` actually closes (and resets `activeCategory` back to `null` first, so reopening always lands on the main menu, never mid-submenu).

**Adding a new setting to the drawer** (preferred over inventing a new sheet/drawer):
1. Add a row to the main-menu section it belongs under (or a new section, if it's a genuinely new group) inside `PlayerSettingsDrawer.tsx`, showing its current value + a chevron.
2. Add that category to the `SettingsCategory` union and `CATEGORY_LABELS`, then render its option list under `activeCategory === 'yourCategory'`, using the same `OptionRow` component every other category uses.
3. Add the setting's own props to `PlayerSettingsDrawerProps` (value + onChange) — `PlayerCore` still owns the underlying state/hook, exactly as it does today for quality/aspect/speed/subtitles.

**When a setting doesn't belong here at all** (e.g. it's a one-tap action like PiP, or TV-only content navigation like episodes): give it its own top-bar icon or, if it needs a real list UI, its own sidebar drawer following the shell above — don't force it into the Settings menu.

## Top-bar icon buttons

Every top-bar button in `PlayerControls` is:

```tsx
<Focusable
  onPress={onPress}
  className="rounded-full bg-background/40 p-2"
  focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
>
  <Icon as={SomeLucideIcon} size="lg" className="text-foreground" />
</Focusable>
```

Icons come from `lucide-react-native`. When a control has an "active"/non-default state worth flagging at a glance, swap the background to `bg-primary` instead of `bg-background/40` — don't add extra badges/text, it breaks the row's rhythm. The top bar is intentionally kept small (Back, Episodes on TV, the single consolidated Settings gear, PiP) — resist adding a fifth+ icon for a new setting; put it inside `PlayerSettingsDrawer` instead (see above) unless it's a one-tap action, not a setting. The Settings gear itself gets the `bg-primary` highlight whenever any setting behind it is non-default (`settingsActive` in `PlayerCore`), since it no longer has per-setting icons of its own to flag individually.

## Session-only vs per-server vs persisted app-wide state

Three different places a new setting can live — pick based on what it's *about*:

| Lives in | When to use | Examples |
|---|---|---|
| Local `useState` inside `PlayerCore` | Content-specific tweak that shouldn't outlive this one playback session | subtitle sync offset, playback speed |
| `PlaybackServer` field in `useServers.tsx` (AsyncStorage-backed, per server) | Behavior of the *scraper* for a specific server | `urlPattern`, `movieTypeLabel`, `scraperTimeoutSeconds` |
| Context + AsyncStorage hook (`useVideoAspect`, `useVideoQuality`, `useSubtitleSettings`, `usePlayerDebugSettings`) | Device/UX preference that should persist across every video and every server | aspect ratio, quality preference, subtitle appearance, debug toggle |

Don't default to the persisted-Context pattern just because it's the most common one in this codebase — a setting tied to one specific piece of content (this video's audio sync) has no business surviving into the next video.

## Subtitle rendering modes recap (`useSubtitleSettings.tsx`)

- `'component'` — Wyzie `.srt`/`.vtt` fetched + parsed by us, cue lookup via `findCueAt(cues, time)` in `src/utils/subtitles.ts`, drawn by `SubtitleOverlay`. **This is the only mode where time-shifting (sync offset) is possible**, since we control the lookup.
- `'native'` — the same Wyzie track URLs handed to `react-native-video` as sidecar `textTracks`; the OS renders them via `selectedTextTrack`. No offset control — don't try to fake it by seeking, just disable/hide offset UI and point the user at Settings > Subtitles to switch modes.
- iOS + HLS always falls back to `'component'` regardless of the setting (AVFoundation limitation) — `useNativeSidecar` in `PlayerCore` is the actual derived flag to check, not the raw `renderMode` setting.

## Scraper vs player settings

`WebViewScraper.tsx` resolves a stream by loading a server's embed page in a hidden (or, in debug mode, visible) WebView and intercepting the video request. Two independent knobs control it, passed in from `PlayerScreen.tsx`:

- `debug` (from the global `usePlayerDebugSettings` Context) — **visibility/interactivity only**: full-screen + interactive WebView (so a captcha challenge can be solved by hand) vs. fully hidden. Global, not per-server.
- `timeoutSeconds` (from the active `PlaybackServer.scraperTimeoutSeconds`, `useServers.tsx`) — **give-up duration only**: how long after page-load to wait for a stream request before erroring out. `0` means wait indefinitely. Per-server, because different servers need very different amounts of time (some never show a challenge, some show one on nearly every load).

These two used to be conflated (`debug` also disabled the timeout entirely) — keep them orthogonal going forward. Once a stream is found, `PlayerScreen.onExtracted` hands off to the native `PlayerCore` only when `debug` is off; while `debug` is on it deliberately keeps playing inside the WebView itself (some streams that fail in `react-native-video` play fine in a real browser context).

## TV considerations

- `PlayerCore`'s `overlayOpen` (OR of every drawer-visibility flag + `showUpNext` + `seriesEnded`) gates `useTVRemote`'s handlers to `undefined` while true, so Select/D-pad presses land on the open drawer's own rows instead of being double-consumed by the global remote listener. **Any new drawer/overlay boolean must be added to this OR-chain.**
- Both `PlayerEpisodeDrawer` and `PlayerSettingsDrawer` use `Focusable` rows throughout (not plain `Pressable`), so Android TV D-pad row-to-row focus works natively — this is also the pattern `DownloadQualitySheet.tsx` (outside the player, in the Downloads flow) uses if you need another reference.
- While controls are hidden, `PlayerCore` keeps a `focusable hasTVPreferredFocus` full-screen `Pressable` mounted so Select can still bring them back — don't remove this when adding new overlay states.
