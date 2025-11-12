// Mock implementation for testing
export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
}

export class NetworkUtils {
  private static mockState: NetworkState = {
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  };

  static initialize(): void {
    // Mock implementation
  }

  static async getCurrentState(): Promise<NetworkState> {
    return this.mockState;
  }

  static async isOnline(): Promise<boolean> {
    return this.mockState.isConnected && this.mockState.isInternetReachable;
  }

  static async isOffline(): Promise<boolean> {
    return !(await this.isOnline());
  }

  static addListener(_callback: (state: NetworkState) => void): () => void {
    // Mock implementation - return empty unsubscribe function
    return () => {};
  }

  static getCachedState(): NetworkState {
    return this.mockState;
  }

  // Test helper methods
  static setMockState(state: Partial<NetworkState>): void {
    this.mockState = {...this.mockState, ...state};
  }

  static resetMockState(): void {
    this.mockState = {
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    };
  }
}
