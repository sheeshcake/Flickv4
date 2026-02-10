/**
 * Platform Navigator
 * Automatically selects the appropriate navigator based on platform (TV or Mobile)
 */

import React from 'react';
import { isTV } from '../utils/platform';
import { TVNavigator } from './TVNavigator';
import { MobileNavigator } from './MobileNavigator';

/**
 * PlatformNavigator - Renders TV or Mobile navigation based on platform
 */
export const PlatformNavigator: React.FC = () => {
  if (isTV) {
    return <TVNavigator />;
  }
  return <MobileNavigator />;
};

export default PlatformNavigator;
