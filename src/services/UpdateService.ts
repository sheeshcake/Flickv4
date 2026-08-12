import { Linking, Platform } from 'react-native';
import {
  File,
  Paths,
  type DownloadProgress,
  type DownloadTask,
} from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { UPDATE_CONFIG } from '@/src/config/env';
import {
  getAppVersion,
  getInstalledAppVersion,
} from '@/src/utils/appVersion';

/**
 * Lightweight in-app updater that polls a GitHub repository for its latest
 * release and, when a newer semver tag is available, surfaces a modal
 * prompting the user to update.
 *
 * Adapted from https://github.com/sheeshcake/Flickv4/blob/main/src/services/UpdateService.ts
 * with the following changes for this codebase:
 * - Uses global `fetch` instead of `axios` (no extra dependency).
 * - Downloads the APK in-app (via `expo-file-system`'s `File.createDownloadTask`,
 *   with progress) and hands it to the system installer directly (via
 *   `expo-intent-launcher`'s `INSTALL_PACKAGE` intent, using the file's
 *   built-in Android `contentUri`) instead of routing through the system
 *   browser — see `downloadApk`/`installApk` below.
 * - UI "current version" comes from `APP_VERSION` (`.env` → `app.config.js`).
 * - Update detection compares against the installed native binary version.
 */

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
  prerelease: boolean;
  draft: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseName: string;
  releaseDate: string;
  /** Direct APK URL (Android only). `null` when unavailable. */
  downloadUrl: string | null;
  /** GitHub release web page. */
  releaseUrl: string;
  assetSize: number | null;
}

const TAG = '[UpdateService]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

/**
 * Turn `1.2.3` (or `v1.2.3`, `1.2.3-beta`) into a comparable integer:
 * `MAJOR * 1_000_000 + MINOR * 1_000 + PATCH`. Pre-release suffixes are
 * ignored so a `-beta` tag equals its stable counterpart — matches the
 * reference implementation.
 */
const parseVersion = (version: string): number => {
  const clean = version.replace(/^v/, '').split('-')[0];
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2];
};

/** Returns 1 if a > b, -1 if a < b, 0 if equal. */
export const compareVersions = (a: string, b: string): number => {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa > pb) return 1;
  if (pa < pb) return -1;
  return 0;
};

const EMPTY_INFO = (): UpdateInfo => {
  const currentVersion = getAppVersion();
  return {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseNotes: '',
    releaseName: '',
    releaseDate: '',
    downloadUrl: null,
    releaseUrl: '',
    assetSize: null,
  };
};

/**
 * Find the "best" APK asset in a release: prefer release/universal builds,
 * fall back to any `.apk`.
 */
const findApkAsset = (assets: ReleaseAsset[]): ReleaseAsset | null => {
  const preferred = assets.find(
    (a) =>
      a.name.endsWith('.apk') &&
      (a.name.includes('release') ||
        a.name.includes('universal') ||
        !a.name.includes('debug')),
  );
  return preferred ?? assets.find((a) => a.name.endsWith('.apk')) ?? null;
};

// Fixed filename in the cache directory so a stale copy from a previous
// attempt/check can be found and cleared before starting a new download.
const APK_FILENAME = 'flick-update.apk';

// `Intent.FLAG_GRANT_READ_URI_PERMISSION` — required so the Package
// Installer (a different app/process) can read our content:// URI.
const FLAG_GRANT_READ_URI_PERMISSION = 1;

class UpdateService {
  /** The in-flight APK download task, if any — lets `cancelDownload` stop it. */
  private activeDownload: DownloadTask | null = null;

  getCurrentVersion(): string {
    return getAppVersion();
  }

  compareVersions(a: string, b: string): number {
    return compareVersions(a, b);
  }

  /**
   * Fetch the latest non-draft, non-prerelease release from GitHub. Returns
   * `null` on any network/HTTP error so callers can silently skip.
   */
  async getLatestRelease(): Promise<GitHubRelease | null> {
    const url = `${UPDATE_CONFIG.API_BASE_URL}/repos/${UPDATE_CONFIG.OWNER}/${UPDATE_CONFIG.REPO}/releases/latest`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Flick-App',
        },
      });
      if (!res.ok) {
        if (res.status === 404) log('no releases published (404)');
        else log('fetch failed with status', res.status);
        return null;
      }
      const data = (await res.json()) as GitHubRelease;
      return data;
    } catch (error) {
      log('network error, skipping:', error);
      return null;
    }
  }

  /**
   * Compare the current app version against the latest GitHub release and
   * return a normalized `UpdateInfo`.
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    const latestRelease = await this.getLatestRelease();
    if (!latestRelease) return EMPTY_INFO();

    // Shown in the UI (env-backed). Compared against the installed binary
    // so an `.env` bump alone cannot mask a real APK update.
    const currentVersion = getAppVersion();
    const installedVersion = getInstalledAppVersion();
    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const hasUpdate = compareVersions(latestVersion, installedVersion) > 0;

    let downloadUrl: string | null = null;
    let assetSize: number | null = null;
    if (Platform.OS === 'android') {
      const apk = findApkAsset(latestRelease.assets);
      if (apk) {
        downloadUrl = apk.browser_download_url;
        assetSize = apk.size;
      }
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseNotes: latestRelease.body || 'No release notes available.',
      releaseName: latestRelease.name || `Version ${latestVersion}`,
      releaseDate: latestRelease.published_at,
      downloadUrl,
      releaseUrl: latestRelease.html_url,
      assetSize,
    };
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Open the direct APK download URL (Android) or the GitHub release page in
   * the system browser. On Android the browser will download the APK and the
   * OS will prompt to install it via the standard "install from unknown
   * sources" flow.
   */
  async openDownloadOrRelease(info: UpdateInfo): Promise<void> {
    const target = info.downloadUrl ?? info.releaseUrl;
    if (!target) return;
    const canOpen = await Linking.canOpenURL(target);
    if (canOpen) await Linking.openURL(target);
  }

  async openReleasePage(url: string): Promise<void> {
    if (!url) return;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
  }

  /**
   * Downloads an APK into the app's cache directory, reporting progress via
   * `onProgress`. Clears out any stale copy from a previous attempt first so
   * the download always starts clean. Only one download is tracked at a
   * time — starting a new one before finishing/cancelling the last just
   * replaces the tracked task (used by `cancelDownload`).
   */
  async downloadApk(
    url: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<File> {
    const destination = new File(Paths.cache, APK_FILENAME);
    if (destination.exists) {
      try {
        destination.delete();
      } catch {
        /* best-effort — a locked/missing file here isn't fatal */
      }
    }

    const task = File.createDownloadTask(url, destination, { onProgress });
    this.activeDownload = task;
    try {
      const file = await task.downloadAsync();
      if (!file) {
        // `downloadAsync` resolves `null` only when paused — we never pause,
        // so this would only happen if something externally interfered.
        throw new Error('Download did not complete.');
      }
      return file;
    } finally {
      if (this.activeDownload === task) this.activeDownload = null;
    }
  }

  /** Cancels the in-flight `downloadApk` call, if any. No-op otherwise. */
  cancelDownload(): void {
    this.activeDownload?.cancel();
    this.activeDownload = null;
  }

  /**
   * Hands a downloaded APK off to the Android system installer via the
   * `INSTALL_PACKAGE` intent, using the file's built-in Android `contentUri`
   * (no manual `FileProvider` plumbing needed with the new `expo-file-system`
   * API). Resolves once the user returns to the app — check `resultCode` on
   * the returned result to tell a completed install from a cancelled one.
   *
   * Android-only. Even with `REQUEST_INSTALL_PACKAGES` declared in the
   * manifest, Android still shows a one-time "Allow installs from this app"
   * toggle the first time — that's an OS security gate no app-side code can
   * skip.
   */
  async installApk(
    file: File,
  ): Promise<IntentLauncher.IntentLauncherResult> {
    if (Platform.OS !== 'android') {
      throw new Error('In-app install is only supported on Android.');
    }
    return IntentLauncher.startActivityAsync(
      'android.intent.action.INSTALL_PACKAGE',
      {
        data: file.contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
        type: 'application/vnd.android.package-archive',
      },
    );
  }
}

export const updateService = new UpdateService();
