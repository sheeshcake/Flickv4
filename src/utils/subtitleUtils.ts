/**
 * Utility functions for subtitle manipulation
 */

/**
 * Extracts metadata from VTT content
 * @param vttContent - VTT subtitle content
 * @returns Metadata object with timing info and subtitle count
 */
export function extractVttMetadata(vttContent: string) {
  const lines = vttContent.split('\n');
  const timingRegex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
  
  let subtitleCount = 0;
  let firstTimestamp = '';
  let lastTimestamp = '';
  
  for (const line of lines) {
    const match = line.match(timingRegex);
    if (match) {
      subtitleCount++;
      if (!firstTimestamp) {
        firstTimestamp = match[1];
      }
      lastTimestamp = match[2];
    }
  }
  
  return {
    subtitleCount,
    firstTimestamp,
    lastTimestamp,
    duration: firstTimestamp && lastTimestamp ? 
      `${firstTimestamp} to ${lastTimestamp}` : 'Unknown',
  };
}