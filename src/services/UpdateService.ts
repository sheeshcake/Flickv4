import axios from 'axios';
import {Linking, NativeModules, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {version as currentVersion} from '../../package.json';

const {ApkInstaller} = NativeModules;

// GitHub repository configuration
const GITHUB_CONFIG = {
  owner: 'sheeshcake', // Replace with your GitHub username/org
  repo: 'Flickv4', // Replace with your repository name
  apiUrl: 'https://api.github.com',
};

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
  downloadUrl: string | null;
  releaseUrl: string;
  assetSize: number | null;
}

export interface DownloadProgress {
  bytesWritten: number;
  contentLength: number;
  progress: number;
}

class UpdateService {
  private static instance: UpdateService;

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Get the current app version
   */
  getCurrentVersion(): string {
    return currentVersion;
  }

  /**
   * Parse version string to comparable number
   * Supports formats like: 1.0.0, 1.0.0-beta, v1.0.0
   */
  private parseVersion(version: string): number {
    // Remove 'v' prefix if present
    const cleanVersion = version.replace(/^v/, '');
    
    // Split by hyphen to handle pre-release versions
    const [mainVersion] = cleanVersion.split('-');
    
    // Split by dots and convert to numbers
    const parts = mainVersion.split('.').map(part => parseInt(part, 10) || 0);
    
    // Pad with zeros if needed
    while (parts.length < 3) {
      parts.push(0);
    }
    
    // Calculate a comparable version number
    // Major * 1000000 + Minor * 1000 + Patch
    return parts[0] * 1000000 + parts[1] * 1000 + parts[2];
  }

  /**
   * Compare two version strings
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(v1: string, v2: string): number {
    const parsed1 = this.parseVersion(v1);
    const parsed2 = this.parseVersion(v2);
    
    if (parsed1 > parsed2) return 1;
    if (parsed1 < parsed2) return -1;
    return 0;
  }

  /**
   * Fetch the latest release from GitHub
   */
  async getLatestRelease(): Promise<GitHubRelease | null> {
    try {
      const url = `${GITHUB_CONFIG.apiUrl}/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases/latest`;
      
      const response = await axios.get<GitHubRelease>(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Flickv4-App',
        },
        timeout: 10000,
      });
      console.log('Latest release fetched:', response.data.tag_name);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // No releases found, try to get the latest tag
        console.log('No releases found, checking tags...');
        return null;
      }
      console.error('Failed to fetch latest release:', error);
      throw error;
    }
  }

  /**
   * Fetch all releases from GitHub
   */
  async getAllReleases(): Promise<GitHubRelease[]> {
    try {
      const url = `${GITHUB_CONFIG.apiUrl}/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases`;
      
      const response = await axios.get<GitHubRelease[]>(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Flickv4-App',
        },
        timeout: 10000,
      });

      // Filter out drafts and prereleases by default
      return response.data.filter(release => !release.draft && !release.prerelease);
    } catch (error) {
      console.error('Failed to fetch releases:', error);
      throw error;
    }
  }

  /**
   * Find the APK asset from a release
   */
  private findApkAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
    // Look for APK files
    const apkAsset = assets.find(
      asset => 
        asset.name.endsWith('.apk') && 
        (asset.name.includes('release') || asset.name.includes('universal') || !asset.name.includes('debug'))
    );

    if (apkAsset) return apkAsset;

    // Fallback: any APK file
    return assets.find(asset => asset.name.endsWith('.apk')) || null;
  }

  /**
   * Check for updates and return update info
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    const current = this.getCurrentVersion();
    
    try {
      const latestRelease = await this.getLatestRelease();
      
      if (!latestRelease) {
        return {
          hasUpdate: false,
          currentVersion: current,
          latestVersion: current,
          releaseNotes: '',
          releaseName: '',
          releaseDate: '',
          downloadUrl: null,
          releaseUrl: '',
          assetSize: null,
        };
      }

      const latestVersion = latestRelease.tag_name.replace(/^v/, '');
      const hasUpdate = this.compareVersions(latestVersion, current) > 0;

      // Find the appropriate download asset based on platform
      let downloadUrl: string | null = null;
      let assetSize: number | null = null;

      if (Platform.OS === 'android') {
        const apkAsset = this.findApkAsset(latestRelease.assets);
        if (apkAsset) {
          downloadUrl = apkAsset.browser_download_url;
          assetSize = apkAsset.size;
        }
      }

      return {
        hasUpdate,
        currentVersion: current,
        latestVersion,
        releaseNotes: latestRelease.body || 'No release notes available.',
        releaseName: latestRelease.name || `Version ${latestVersion}`,
        releaseDate: latestRelease.published_at,
        downloadUrl,
        releaseUrl: latestRelease.html_url,
        assetSize,
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      throw new Error('Failed to check for updates. Please try again later.');
    }
  }

  /**
   * Format file size to human readable format
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format date to readable format
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Download APK file with progress tracking
   */
  async downloadUpdate(
    downloadUrl: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<string> {
    const fileName = `Flickv4-update-${Date.now()}.apk`;
    const downloadPath = `${RNFS.DownloadDirectoryPath}/${fileName}`;

    try {
      const downloadResult = await RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: downloadPath,
        progress: (res) => {
          if (onProgress && res.contentLength > 0) {
            onProgress({
              bytesWritten: res.bytesWritten,
              contentLength: res.contentLength,
              progress: (res.bytesWritten / res.contentLength) * 100,
            });
          }
        },
        progressDivider: 1,
      }).promise;

      if (downloadResult.statusCode === 200) {
        return downloadPath;
      } else {
        throw new Error(`Download failed with status: ${downloadResult.statusCode}`);
      }
    } catch (error) {
      // Clean up partial download
      try {
        const exists = await RNFS.exists(downloadPath);
        if (exists) {
          await RNFS.unlink(downloadPath);
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup partial download:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * Open the release page in browser
   */
  async openReleasePage(url: string): Promise<void> {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      throw new Error('Cannot open URL');
    }
  }

  /**
   * Install APK (Android only)
   * Note: This requires the user to enable "Install from unknown sources"
   */
  async installApk(apkPath: string): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('APK installation is only supported on Android');
    }

    try {
      // Use native module to install APK with FileProvider
      if (ApkInstaller) {
        await ApkInstaller.install(apkPath);
      } else {
        throw new Error('APK Installer module not available');
      }
    } catch (error) {
      console.error('Failed to install APK:', error);
      throw new Error(
        'Failed to install the update. Please install manually from your Downloads folder.',
      );
    }
  }

  /**
   * Configure GitHub repository settings
   */
  setGitHubConfig(owner: string, repo: string): void {
    GITHUB_CONFIG.owner = owner;
    GITHUB_CONFIG.repo = repo;
  }

  /**
   * Get current GitHub config
   */
  getGitHubConfig(): { owner: string; repo: string } {
    return {
      owner: GITHUB_CONFIG.owner,
      repo: GITHUB_CONFIG.repo,
    };
  }
}

export const updateService = UpdateService.getInstance();
