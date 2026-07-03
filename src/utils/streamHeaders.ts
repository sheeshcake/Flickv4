export const VIDEO_STREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  Referer: 'https://vidfast.pro',
  Origin: 'https://vidfast.pro',
} as const;

export function fetchStream(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...VIDEO_STREAM_HEADERS,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}
