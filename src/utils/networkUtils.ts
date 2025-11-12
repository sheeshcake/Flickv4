import NetInfo from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
}

/**
 * Network utility class for handling connectivity checks and offline mode
 */
export class NetworkUtils {
  private static listeners: ((state: NetworkState) => void)[] = [];
  private static currentState: NetworkState = {
    isConnected: false,
    isInternetReachable: false,
    type: 'unknown',
  };

  /**
   * Initialize network monitoring
   */
  static initialize(): void {
    NetInfo.addEventListener(state => {
      const networkState: NetworkState = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? false,
        type: state.type,
      };

      this.currentState = networkState;
      this.notifyListeners(networkState);
    });
  }

  /**
   * Get current network state
   */
  static async getCurrentState(): Promise<NetworkState> {
    const state = await NetInfo.fetch();
    const networkState: NetworkState = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? false,
      type: state.type,
    };

    this.currentState = networkState;
    return networkState;
  }

  /**
   * Check if device is online
   */
  static async isOnline(): Promise<boolean> {
    const state = await this.getCurrentState();
    return state.isConnected && state.isInternetReachable;
  }

  /**
   * Check if device is offline
   */
  static async isOffline(): Promise<boolean> {
    return !(await this.isOnline());
  }

  /**
   * Add network state listener
   */
  static addListener(callback: (state: NetworkState) => void): () => void {
    this.listeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current cached state (synchronous)
   */
  static getCachedState(): NetworkState {
    return this.currentState;
  }

  /**
   * Notify all listeners of network state change
   */
  private static notifyListeners(state: NetworkState): void {
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in network state listener:', error);
      }
    });
  }
}
