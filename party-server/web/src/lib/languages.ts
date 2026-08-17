export interface SubLanguage {
  code: string;
  label: string;
}

export const SUBTITLE_LANGUAGES: SubLanguage[] = [
  { code: '', label: 'None' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
];

export const getLanguageLabel = (code: string): string =>
  SUBTITLE_LANGUAGES.find((l) => l.code === code)?.label ?? 'None';

export const languageFromLabel = (label: string): string => {
  const lower = String(label || '').toLowerCase();
  const known = SUBTITLE_LANGUAGES.find(
    (l) => l.code && lower.includes(l.label.toLowerCase()),
  );
  if (known) return known.code;
  return lower.slice(0, 2);
};
