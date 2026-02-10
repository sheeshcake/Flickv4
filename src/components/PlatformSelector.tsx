/**
 * Platform Selector Component
 * A higher-order component that selects the appropriate component based on platform (TV vs Mobile)
 */

import React, { ComponentType } from 'react';
import { isTV, UICategory, getUICategory } from '../utils/platform';

/**
 * Props for platform-specific component selection
 */
interface PlatformComponentProps<P> {
  TVComponent: ComponentType<P>;
  MobileComponent: ComponentType<P>;
}

/**
 * Creates a component that automatically renders the appropriate version
 * based on the current platform (TV or Mobile)
 * 
 * @example
 * const ContentCard = createPlatformComponent({
 *   TVComponent: TVContentCard,
 *   MobileComponent: MobileContentCard,
 * });
 */
export function createPlatformComponent<P extends object>({
  TVComponent,
  MobileComponent,
}: PlatformComponentProps<P>): ComponentType<P> {
  const PlatformComponent: React.FC<P> = (props) => {
    if (isTV) {
      return <TVComponent {...props} />;
    }
    return <MobileComponent {...props} />;
  };

  // Set display name for debugging
  const tvName = TVComponent.displayName || TVComponent.name || 'TVComponent';
  const mobileName = MobileComponent.displayName || MobileComponent.name || 'MobileComponent';
  PlatformComponent.displayName = `Platform(${tvName}|${mobileName})`;

  return PlatformComponent;
}

/**
 * Hook to get the current UI category
 */
export function useUICategory(): UICategory {
  return getUICategory();
}

/**
 * Hook to check if current platform is TV
 */
export function useIsTV(): boolean {
  return isTV;
}

/**
 * Platform-aware wrapper component
 * Renders children only on the specified platform
 */
interface PlatformOnlyProps {
  children: React.ReactNode;
  platform: 'tv' | 'mobile' | 'both';
}

export const PlatformOnly: React.FC<PlatformOnlyProps> = ({ children, platform }) => {
  const currentCategory = getUICategory();

  if (platform === 'both') {
    return <>{children}</>;
  }

  if (platform === 'tv' && currentCategory === UICategory.TV) {
    return <>{children}</>;
  }

  if (platform === 'mobile' && currentCategory === UICategory.MOBILE) {
    return <>{children}</>;
  }

  return null;
};

/**
 * Conditional rendering based on platform
 */
interface PlatformSwitchProps {
  tv?: React.ReactNode;
  mobile?: React.ReactNode;
}

export const PlatformSwitch: React.FC<PlatformSwitchProps> = ({ tv, mobile }) => {
  if (isTV && tv) {
    return <>{tv}</>;
  }
  
  if (!isTV && mobile) {
    return <>{mobile}</>;
  }

  return null;
};

/**
 * Platform-specific style selector
 */
export function selectPlatformStyle<T>(options: { tv: T; mobile: T }): T {
  return isTV ? options.tv : options.mobile;
}

/**
 * Platform-specific value selector
 */
export function selectPlatformValue<T>(options: { tv: T; mobile: T }): T {
  return isTV ? options.tv : options.mobile;
}

export default {
  createPlatformComponent,
  useUICategory,
  useIsTV,
  PlatformOnly,
  PlatformSwitch,
  selectPlatformStyle,
  selectPlatformValue,
};
