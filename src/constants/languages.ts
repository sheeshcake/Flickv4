/**
 * Curated list of subtitle languages exposed as the default-language options
 * in Settings. `code` is an ISO 639-1 value understood by the Wyzie API; an
 * empty code represents "None" (no auto-selection).
 */
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
