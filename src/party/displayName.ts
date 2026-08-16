import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

const STORAGE_KEY = 'flick.partyDisplayName';
export const PARTY_DISPLAY_NAME_MAX = 32;

export const deviceDisplayName = (): string => {
  const name = Device.deviceName?.trim();
  if (name) return name.slice(0, PARTY_DISPLAY_NAME_MAX);
  if (Device.modelName) return Device.modelName.slice(0, PARTY_DISPLAY_NAME_MAX);
  return 'Flick user';
};

export const normalizePartyDisplayName = (raw: string): string => {
  const trimmed = raw.trim().slice(0, PARTY_DISPLAY_NAME_MAX);
  return trimmed || deviceDisplayName();
};

export const getPartyDisplayName = async (): Promise<string> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim().slice(0, PARTY_DISPLAY_NAME_MAX);
    }
  } catch {
    // ignore
  }
  return deviceDisplayName();
};

export const savePartyDisplayName = async (raw: string): Promise<string> => {
  const next = normalizePartyDisplayName(raw);
  await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  return next;
};
