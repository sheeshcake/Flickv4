import notifee, { 
  AndroidImportance, 
  AndroidVisibility,
  AndroidCategory,
  AndroidForegroundServiceType,
  EventType,
  Event,
} from '@notifee/react-native';
import { Platform, AppState, AppStateStatus } from 'react-native';

export interface DownloadNotificationData {
  downloadId: string;
  title: string;
  progress?: number;
  status: 'started' | 'progress' | 'completed' | 'failed' | 'paused' | 'cancelled';
  error?: string;
}

interface ActiveDownloadInfo {
  downloadId: string;
  title: string;
  progress: number;
}

/**
 * NotificationService handles system notifications for downloads
 * Uses foreground service to maintain download speed when app is backgrounded
 */
export class NotificationService {
  private static instance: NotificationService;
  private channelId: string = 'download-channel';
  private progressChannelId: string = 'download-progress-channel';
  private foregroundServiceChannelId: string = 'download-foreground-service';
  private isInitialized: boolean = false;
  private activeNotifications: Map<string, string> = new Map(); // downloadId -> notificationId
  private foregroundServiceRunning: boolean = false;
  private activeDownloadCount: number = 0;
  private appStateSubscription: any = null;
  
  // Track individual download progress for multi-download notifications
  private activeDownloads: Map<string, ActiveDownloadInfo> = new Map();

  private constructor() {
    this.initialize();
    this.setupAppStateListener();
  }

  /**
   * Setup app state listener to manage foreground service
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  /**
   * Handle app state changes
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    console.log('App state changed to:', nextAppState);
    // Foreground service is automatically managed by the download start/stop methods
  }

  /**
   * Get singleton instance
   */
  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification channels (required for Android)
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (Platform.OS === 'android') {
        // Create channel for completed/failed notifications
        await notifee.createChannel({
          id: this.channelId,
          name: 'Downloads',
          description: 'Download completion notifications',
          importance: AndroidImportance.DEFAULT,
          visibility: AndroidVisibility.PUBLIC,
        });

        // Create channel for progress notifications (low importance to avoid sound)
        await notifee.createChannel({
          id: this.progressChannelId,
          name: 'Download Progress',
          description: 'Ongoing download progress',
          importance: AndroidImportance.LOW,
          visibility: AndroidVisibility.PUBLIC,
          sound: undefined, // No sound for progress updates
        });

        // Create channel for foreground service (required for background downloads)
        await notifee.createChannel({
          id: this.foregroundServiceChannelId,
          name: 'Download Service',
          description: 'Keeps downloads running at full speed in background',
          importance: AndroidImportance.LOW,
          visibility: AndroidVisibility.PUBLIC,
          sound: undefined,
        });

        // Register the foreground service task
        this.registerForegroundServiceTask();
      }

      // Request permissions
      await notifee.requestPermission();

      // Set up foreground event handler
      notifee.onForegroundEvent(this.handleForegroundEvent.bind(this));

      // Set up background event handler
      notifee.onBackgroundEvent(this.handleBackgroundEvent.bind(this));

      this.isInitialized = true;
      console.log('NotificationService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize NotificationService:', error);
    }
  }

  /**
   * Register the foreground service task for background downloads
   */
  private registerForegroundServiceTask(): void {
    notifee.registerForegroundService((notification) => {
      return new Promise(() => {
        // This promise should not resolve while downloads are active
        // The service will be stopped when stopForegroundService is called
        console.log('Foreground service started for download:', notification.id);
      });
    });
  }

  /**
   * Start foreground service for downloads (prevents Android from throttling)
   */
  async startForegroundService(downloadId: string, downloadTitle: string): Promise<void> {
    if (Platform.OS !== 'android') return;

    // Track this download
    this.activeDownloads.set(downloadId, {
      downloadId,
      title: downloadTitle,
      progress: 0,
    });
    this.activeDownloadCount = this.activeDownloads.size;

    // Build notification body
    const body = this.buildMultiDownloadBody();

    // Only start service if not already running
    if (this.foregroundServiceRunning) {
      // Update notification with new download info
      await this.updateForegroundNotification();
      console.log('Foreground service updated, download count:', this.activeDownloadCount);
      return;
    }

    try {
      await notifee.displayNotification({
        id: 'download-foreground-service',
        title: this.getNotificationTitle(),
        body: body,
        android: {
          channelId: this.foregroundServiceChannelId,
          asForegroundService: true,
          foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_notification',
          progress: {
            indeterminate: true,
            max: 100,
            current: 0,
          },
          pressAction: {
            id: 'default',
          },
        },
      });

      this.foregroundServiceRunning = true;
      console.log('Foreground service started for:', downloadTitle);
    } catch (error) {
      console.error('Failed to start foreground service:', error);
    }
  }

  /**
   * Get notification title based on number of downloads
   */
  private getNotificationTitle(): string {
    const count = this.activeDownloads.size;
    if (count === 1) {
      return 'Downloading...';
    }
    return `Downloading ${count} items...`;
  }

  /**
   * Build notification body showing all active downloads
   */
  private buildMultiDownloadBody(): string {
    const downloads = Array.from(this.activeDownloads.values());
    
    if (downloads.length === 1) {
      const dl = downloads[0];
      return `${dl.title} - ${Math.round(dl.progress)}%`;
    }
    
    // For multiple downloads, show each one on a new line
    return downloads
      .map(dl => `${dl.title}: ${Math.round(dl.progress)}%`)
      .join('\n');
  }

  /**
   * Calculate average progress across all downloads
   */
  private getAverageProgress(): number {
    const downloads = Array.from(this.activeDownloads.values());
    if (downloads.length === 0) return 0;
    
    const totalProgress = downloads.reduce((sum, dl) => sum + dl.progress, 0);
    return totalProgress / downloads.length;
  }

  /**
   * Update foreground notification with current state
   */
  private async updateForegroundNotification(): Promise<void> {
    if (!this.foregroundServiceRunning) return;

    const avgProgress = this.getAverageProgress();
    const body = this.buildMultiDownloadBody();

    try {
      await notifee.displayNotification({
        id: 'download-foreground-service',
        title: this.getNotificationTitle(),
        body: body,
        android: {
          channelId: this.foregroundServiceChannelId,
          asForegroundService: true,
          foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_notification',
          progress: {
            indeterminate: false,
            max: 100,
            current: Math.round(avgProgress),
          },
          // Use big text style for multiple downloads
          style: this.activeDownloads.size > 1 ? {
            type: 1, // AndroidStyle.BIGTEXT
            text: body,
          } : undefined,
          pressAction: {
            id: 'default',
          },
        },
      });
    } catch (error) {
      console.error('Failed to update foreground notification:', error);
    }
  }

  /**
   * Update foreground service notification with current progress for a specific download
   */
  async updateForegroundService(downloadId: string, downloadTitle: string, progress: number): Promise<void> {
    if (Platform.OS !== 'android' || !this.foregroundServiceRunning) return;

    // Update this download's progress
    const downloadInfo = this.activeDownloads.get(downloadId);
    if (downloadInfo) {
      downloadInfo.progress = progress;
      this.activeDownloads.set(downloadId, downloadInfo);
    } else {
      // If not tracked, add it
      this.activeDownloads.set(downloadId, {
        downloadId,
        title: downloadTitle,
        progress,
      });
    }

    await this.updateForegroundNotification();
  }

  /**
   * Remove a download from tracking and update notification
   */
  async removeDownloadFromTracking(downloadId: string): Promise<void> {
    this.activeDownloads.delete(downloadId);
    this.activeDownloadCount = this.activeDownloads.size;

    if (this.activeDownloads.size > 0 && this.foregroundServiceRunning) {
      // Update notification to reflect remaining downloads
      await this.updateForegroundNotification();
    }
  }

  /**
   * Stop foreground service when all downloads complete
   */
  async stopForegroundService(downloadId?: string): Promise<void> {
    if (Platform.OS !== 'android') return;

    // Remove specific download from tracking if provided
    if (downloadId) {
      await this.removeDownloadFromTracking(downloadId);
    } else {
      this.activeDownloadCount = Math.max(0, this.activeDownloadCount - 1);
    }

    // Only stop if no more active downloads
    if (this.activeDownloads.size > 0) {
      console.log('Downloads still active, keeping foreground service. Count:', this.activeDownloads.size);
      return;
    }

    if (!this.foregroundServiceRunning) return;

    try {
      await notifee.stopForegroundService();
      this.foregroundServiceRunning = false;
      this.activeDownloads.clear();
      console.log('Foreground service stopped');
    } catch (error) {
      console.error('Failed to stop foreground service:', error);
    }
  }

  /**
   * Force stop foreground service (for cancel/error scenarios)
   */
  async forceStopForegroundService(): Promise<void> {
    if (Platform.OS !== 'android' || !this.foregroundServiceRunning) return;

    try {
      this.activeDownloadCount = 0;
      this.activeDownloads.clear();
      await notifee.stopForegroundService();
      this.foregroundServiceRunning = false;
      console.log('Foreground service force stopped');
    } catch (error) {
      console.error('Failed to force stop foreground service:', error);
    }
  }

  /**
   * Handle foreground notification events
   */
  private async handleForegroundEvent({ type, detail }: Event): Promise<void> {
    console.log('Notification foreground event:', type, detail);

    switch (type) {
      case EventType.DISMISSED:
        // User dismissed the notification
        break;
      case EventType.PRESS:
        // User pressed the notification - could navigate to downloads screen
        break;
      case EventType.ACTION_PRESS:
        // User pressed an action button
        if (detail.pressAction?.id === 'cancel') {
          // Handle cancel action - this would need to be connected to DownloadService
          console.log('Cancel action pressed for notification:', detail.notification?.id);
        }
        break;
    }
  }

  /**
   * Handle background notification events
   */
  private async handleBackgroundEvent({ type, detail }: Event): Promise<void> {
    console.log('Notification background event:', type, detail);

    switch (type) {
      case EventType.ACTION_PRESS:
        if (detail.pressAction?.id === 'cancel') {
          // Handle cancel action in background
          console.log('Background cancel action for:', detail.notification?.id);
        }
        break;
    }
  }

  /**
   * Show download started notification
   */
  async showDownloadStarted(data: DownloadNotificationData): Promise<void> {
    try {
      const notificationId = `download_${data.downloadId}`;

      await notifee.displayNotification({
        id: notificationId,
        title: 'Download Started',
        body: `Downloading ${data.title}...`,
        android: {
          channelId: this.progressChannelId,
          category: AndroidCategory.PROGRESS,
          ongoing: true, // Cannot be dismissed while downloading
          autoCancel: false,
          smallIcon: 'ic_notification', // Make sure this icon exists in android/app/src/main/res
          progress: {
            max: 100,
            current: 0,
            indeterminate: true,
          },
          pressAction: {
            id: 'default',
          },
          actions: [
            {
              title: 'Cancel',
              pressAction: {
                id: 'cancel',
              },
            },
          ],
        },
        ios: {
          categoryId: 'download',
        },
      });

      this.activeNotifications.set(data.downloadId, notificationId);
    } catch (error) {
      console.error('Failed to show download started notification:', error);
    }
  }

  /**
   * Update download progress notification
   */
  async updateDownloadProgress(data: DownloadNotificationData): Promise<void> {
    try {
      const notificationId = this.activeNotifications.get(data.downloadId) || `download_${data.downloadId}`;
      const progress = Math.round(data.progress || 0);

      await notifee.displayNotification({
        id: notificationId,
        title: 'Downloading...',
        body: `${data.title} - ${progress}%`,
        android: {
          channelId: this.progressChannelId,
          category: AndroidCategory.PROGRESS,
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_notification',
          progress: {
            max: 100,
            current: progress,
            indeterminate: false,
          },
          pressAction: {
            id: 'default',
          },
          actions: [
            {
              title: 'Cancel',
              pressAction: {
                id: 'cancel',
              },
            },
          ],
        },
        ios: {
          categoryId: 'download',
        },
      });

      this.activeNotifications.set(data.downloadId, notificationId);
    } catch (error) {
      console.error('Failed to update download progress notification:', error);
    }
  }

  /**
   * Show download completed notification
   */
  async showDownloadCompleted(data: DownloadNotificationData): Promise<void> {
    try {
      const notificationId = `download_${data.downloadId}`;

      // Cancel any existing progress notification
      await this.cancelNotification(data.downloadId);

      await notifee.displayNotification({
        id: notificationId,
        title: 'Download Complete',
        body: `${data.title} is ready to watch!`,
        android: {
          channelId: this.channelId,
          importance: AndroidImportance.DEFAULT,
          autoCancel: true,
          smallIcon: 'ic_notification',
          pressAction: {
            id: 'default',
          },
        },
        ios: {
          categoryId: 'download',
          sound: 'default',
        },
      });

      this.activeNotifications.delete(data.downloadId);
    } catch (error) {
      console.error('Failed to show download completed notification:', error);
    }
  }

  /**
   * Show download failed notification
   */
  async showDownloadFailed(data: DownloadNotificationData): Promise<void> {
    try {
      const notificationId = `download_${data.downloadId}`;

      // Cancel any existing progress notification
      await this.cancelNotification(data.downloadId);

      await notifee.displayNotification({
        id: notificationId,
        title: 'Download Failed',
        body: data.error ? `${data.title}: ${data.error}` : `Failed to download ${data.title}`,
        android: {
          channelId: this.channelId,
          importance: AndroidImportance.HIGH,
          autoCancel: true,
          smallIcon: 'ic_notification',
          pressAction: {
            id: 'default',
          },
        },
        ios: {
          categoryId: 'download',
          sound: 'default',
        },
      });

      this.activeNotifications.delete(data.downloadId);
    } catch (error) {
      console.error('Failed to show download failed notification:', error);
    }
  }

  /**
   * Show download paused notification
   */
  async showDownloadPaused(data: DownloadNotificationData): Promise<void> {
    try {
      const notificationId = `download_${data.downloadId}`;

      await notifee.displayNotification({
        id: notificationId,
        title: 'Download Paused',
        body: `${data.title} - ${Math.round(data.progress || 0)}%`,
        android: {
          channelId: this.channelId,
          importance: AndroidImportance.LOW,
          ongoing: false,
          autoCancel: true,
          smallIcon: 'ic_notification',
          pressAction: {
            id: 'default',
          },
          actions: [
            {
              title: 'Resume',
              pressAction: {
                id: 'resume',
              },
            },
          ],
        },
        ios: {
          categoryId: 'download',
        },
      });

      this.activeNotifications.set(data.downloadId, notificationId);
    } catch (error) {
      console.error('Failed to show download paused notification:', error);
    }
  }

  /**
   * Show download cancelled notification
   */
  async showDownloadCancelled(data: DownloadNotificationData): Promise<void> {
    try {
      // Just cancel the progress notification, no need to show cancelled
      await this.cancelNotification(data.downloadId);
    } catch (error) {
      console.error('Failed to handle download cancelled notification:', error);
    }
  }

  /**
   * Cancel notification for a specific download
   */
  async cancelNotification(downloadId: string): Promise<void> {
    try {
      const notificationId = this.activeNotifications.get(downloadId) || `download_${downloadId}`;
      await notifee.cancelNotification(notificationId);
      this.activeNotifications.delete(downloadId);
    } catch (error) {
      console.error('Failed to cancel notification:', error);
    }
  }

  /**
   * Cancel all download notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      for (const downloadId of this.activeNotifications.keys()) {
        await this.cancelNotification(downloadId);
      }
    } catch (error) {
      console.error('Failed to cancel all notifications:', error);
    }
  }

  /**
   * Handle download notification based on status
   */
  async handleDownloadNotification(data: DownloadNotificationData): Promise<void> {
    switch (data.status) {
      case 'started':
        await this.showDownloadStarted(data);
        break;
      case 'progress':
        await this.updateDownloadProgress(data);
        break;
      case 'completed':
        await this.showDownloadCompleted(data);
        break;
      case 'failed':
        await this.showDownloadFailed(data);
        break;
      case 'paused':
        await this.showDownloadPaused(data);
        break;
      case 'cancelled':
        await this.showDownloadCancelled(data);
        break;
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
