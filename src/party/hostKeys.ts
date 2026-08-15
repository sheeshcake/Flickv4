import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'flick.partyHostKeys';

const readAll = async (): Promise<Record<string, string>> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const savePartyHostKey = async (code: string, hostKey: string) => {
  const next = await readAll();
  next[code.toUpperCase()] = hostKey;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
};

export const getPartyHostKey = async (code: string): Promise<string | null> => {
  const all = await readAll();
  return all[code.toUpperCase()] ?? null;
};
