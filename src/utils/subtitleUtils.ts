/**
 * Utility functions for subtitle conversion and manipulation
 */

export interface ConvertedSubtitle {
  vttContent: string;
  originalFormat: string;
}

/**
 * Converts SRT subtitle content to VTT format
 * @param srtContent - The SRT subtitle content as string
 * @returns VTT formatted subtitle content
 */
export function convertSrtToVtt(srtContent: string): string {
  // Remove BOM if present
  const cleanContent = srtContent.replace(/^\uFEFF/, '');
  
  // Start with VTT header
  let vttContent = 'WEBVTT\n\n';
  
  // Remove text alignment tags (e.g., {\an1}, {\an2}, etc.)
  let processedContent = cleanContent.replace(/\{\\an[1-9]\}/g, '');
  
  // Replace timestamp commas with dots (SRT uses commas, VTT uses dots)
  processedContent = processedContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Split by double newlines to get subtitle blocks
  const blocks = processedContent.split(/\n\s*\n/);
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    
    const lines = block.split('\n');
    if (lines.length < 3) continue; // Skip invalid blocks
    
    // Extract sequence number (first line)
    const sequenceNum = lines[0].trim();
    
    // Extract timing (second line)
    const timingLine = lines[1].trim();
    
    // Extract subtitle text (remaining lines)
    const subtitleText = lines.slice(2).join('\n')
      .replace(/\{\\[^}]*\}/g, '') // Remove any remaining style tags
      .replace(/<[^>]*>/g, ''); // Remove HTML tags if present
    
    // Add to VTT content
    vttContent += `${sequenceNum}\n${timingLine}\n${subtitleText}\n\n`;
  }
  
  return vttContent;
}

/**
 * Enhanced local SRT to VTT conversion with better formatting
 * This is equivalent to the Node.js fs-based conversion but works in React Native
 * @param srtContent - Raw SRT content string
 * @returns Properly formatted VTT content
 */
export function convertSrtToVttLocal(srtContent: string): string {
  console.log('=== LOCAL SRT TO VTT CONVERSION ===');
  console.log('Original SRT length:', srtContent.length);
  
  // Remove BOM and normalize line endings
  let cleanContent = srtContent
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .replace(/\r/g, '\n'); // Normalize Mac line endings
  
  // Start with VTT header
  let vttContent = 'WEBVTT\n\n';
  
  // Remove text alignment tags ({\an1}, {\an2}, etc.)
  cleanContent = cleanContent.replace(/\{\\an[1-9]\}/g, '');
  
  // Remove other ASS/SSA style tags
  cleanContent = cleanContent.replace(/\{\\[^}]*\}/g, '');
  
  // Remove HTML tags if present
  cleanContent = cleanContent.replace(/<[^>]*>/g, '');
  
  // Replace timestamp format: change commas to dots for milliseconds
  cleanContent = cleanContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Process the content and add to VTT
  vttContent += cleanContent;
  
  console.log('Converted VTT length:', vttContent.length);
  console.log('VTT preview:', vttContent.substring(0, 200));
  
  return vttContent;
}

/**
 * Advanced SRT to VTT conversion with comprehensive formatting support
 * Handles various SRT formatting edge cases and style tags
 * @param srtContent - Raw SRT subtitle content
 * @returns Clean VTT content ready for playback
 */
export function advancedSrtToVttConversion(srtContent: string): string {
  console.log('=== ADVANCED SRT TO VTT CONVERSION ===');
  
  // Remove BOM and normalize
  let content = srtContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  
  // Start VTT format
  let vtt = 'WEBVTT\n\n';
  
  // Remove various formatting tags commonly found in SRT files
  content = content
    // Remove text alignment tags {\an1} to {\an9}
    .replace(/\{\\an[1-9]\}/g, '')
    // Remove other ASS/SSA tags like {\pos(x,y)}, {\c&Hffffff&}, etc.
    .replace(/\{\\[^}]*\}/g, '')
    // Remove HTML-like tags
    .replace(/<[^>]*>/g, '')
    // Remove font tags
    .replace(/<\/?font[^>]*>/gi, '')
    // Remove color tags
    .replace(/<\/?color[^>]*>/gi, '')
    // Replace timestamp commas with dots
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    // Clean up multiple newlines but preserve subtitle block separation
    .replace(/\n{3,}/g, '\n\n');
  
  // Split into blocks and process each
  const blocks = content.split('\n\n');
  
  for (const block of blocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;
    
    const lines = trimmedBlock.split('\n');
    
    // Skip if not enough lines for a valid subtitle
    if (lines.length < 3) continue;
    
    // Check if first line is a number (sequence)
    const firstLine = lines[0].trim();
    if (!/^\d+$/.test(firstLine)) continue;
    
    // Check if second line contains timestamp
    const secondLine = lines[1].trim();
    if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/.test(secondLine)) continue;
    
    // Extract subtitle text (everything after timestamp)
    const subtitleText = lines.slice(2)
      .join('\n')
      .trim()
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\n\s*\n/g, '\n'); // Remove empty lines within subtitle
    
    if (subtitleText) {
      vtt += `${firstLine}\n${secondLine}\n${subtitleText}\n\n`;
    }
  }
  
  console.log('Advanced conversion completed');
  console.log('Original length:', srtContent.length);
  console.log('VTT length:', vtt.length);
  
  return vtt;
}

/**
 * Detects subtitle format based on content
 * @param content - Subtitle file content
 * @returns Detected format ('srt', 'vtt', 'ass', 'ssa', 'unknown')
 */
export function detectSubtitleFormat(content: string): string {
  const cleanContent = content.trim().toLowerCase();
  
  if (cleanContent.startsWith('webvtt')) {
    return 'vtt';
  }
  
  if (cleanContent.includes('-->') && /^\d+\s*$/m.test(content)) {
    return 'srt';
  }
  
  if (cleanContent.includes('[script info]') || cleanContent.includes('dialogue:')) {
    return cleanContent.includes('[v4+ styles]') ? 'ass' : 'ssa';
  }
  
  return 'unknown';
}

/**
 * Downloads subtitle content from URL and converts to VTT if needed
 * Uses local conversion methods for better performance and reliability
 * @param url - Subtitle file URL
 * @returns Promise with converted subtitle data
 */
export async function downloadAndConvertSubtitle(url: string): Promise<ConvertedSubtitle> {
  try {
    console.log('Downloading subtitle from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain, application/octet-stream, */*',
        'User-Agent': 'FlickApp/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    console.log('Response content-type:', contentType);
    
    // For React Native, we'll always try text() first
    // Most subtitle files should be decodable as text
    let content: string;
    try {
      content = await response.text();
    } catch (error) {
      console.error('Failed to decode subtitle as text:', error);
      throw new Error('Failed to decode subtitle file - unsupported encoding');
    }
    
    console.log('Downloaded subtitle content length:', content.length);
    console.log('First 200 chars:', content.substring(0, 200));
    
    // Detect original format
    const originalFormat = detectSubtitleFormat(content);
    console.log('Detected subtitle format:', originalFormat);
    
    let vttContent: string;
    
    // Convert to VTT using local conversion methods
    switch (originalFormat) {
      case 'vtt':
        vttContent = content;
        console.log('Already VTT format, no conversion needed');
        break;
      case 'srt':
        // Use advanced local conversion for better results
        vttContent = advancedSrtToVttConversion(content);
        console.log('Converted SRT to VTT using advanced local conversion');
        break;
      case 'ass':
      case 'ssa':
        // For ASS/SSA, try to clean up and convert as if it were SRT
        console.warn('ASS/SSA format detected - attempting conversion as SRT');
        vttContent = advancedSrtToVttConversion(content);
        break;
      default:
        console.warn('Unknown subtitle format detected, attempting SRT conversion');
        vttContent = advancedSrtToVttConversion(content);
        break;
    }
    
    console.log('Final VTT content length:', vttContent.length);
    console.log('VTT first 300 chars:', vttContent.substring(0, 300));
    
    // Validate the converted VTT content
    if (!validateVttContent(vttContent)) {
      console.warn('Generated VTT content may be invalid, but proceeding anyway');
    }
    
    return {
      vttContent,
      originalFormat,
    };
  } catch (error) {
    console.error('Error downloading/converting subtitle:', error);
    throw new Error(`Failed to download subtitle: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Creates a data URL for VTT content that can be used as subtitle source
 * @param vttContent - VTT formatted subtitle content
 * @returns Data URL for the VTT content
 */
export function createVttDataUrl(vttContent: string): string {
  // Ensure VTT content is properly formatted
  let cleanVttContent = vttContent.trim();
  
  // Add WEBVTT header if missing
  if (!cleanVttContent.startsWith('WEBVTT')) {
    cleanVttContent = 'WEBVTT\n\n' + cleanVttContent;
  }
  
  // Ensure there's a blank line after WEBVTT header
  if (cleanVttContent.startsWith('WEBVTT') && !cleanVttContent.startsWith('WEBVTT\n\n')) {
    cleanVttContent = cleanVttContent.replace(/^WEBVTT\s*/, 'WEBVTT\n\n');
  }
  
  // Use URL encoding instead of base64 for better compatibility with react-native-video
  const encodedContent = encodeURIComponent(cleanVttContent);
  return `data:text/vtt;charset=utf-8,${encodedContent}`;
}

/**
 * Local subtitle conversion that works entirely in memory
 * Equivalent to: fs.readFileSync('subtitles.srt', 'utf8') -> convertSrtToVtt -> fs.writeFileSync
 * @param subtitleContent - Raw subtitle content (any format)
 * @param originalFormat - Optional format hint ('srt', 'vtt', 'ass', etc.)
 * @returns Object with VTT content and data URL
 */
export function convertSubtitleLocally(subtitleContent: string, originalFormat?: string): {
  vttContent: string;
  vttDataUrl: string;
  detectedFormat: string;
} {
  console.log('=== LOCAL SUBTITLE CONVERSION ===');
  console.log('Content length:', subtitleContent.length);
  console.log('Provided format:', originalFormat || 'auto-detect');
  
  // Auto-detect format if not provided
  const detectedFormat = originalFormat || detectSubtitleFormat(subtitleContent);
  console.log('Detected format:', detectedFormat);
  
  let vttContent: string;
  
  // Convert based on format
  switch (detectedFormat.toLowerCase()) {
    case 'vtt':
      vttContent = subtitleContent;
      console.log('Already VTT format');
      break;
    case 'srt':
      vttContent = advancedSrtToVttConversion(subtitleContent);
      console.log('Converted SRT to VTT');
      break;
    case 'ass':
    case 'ssa':
      vttContent = advancedSrtToVttConversion(subtitleContent);
      console.log('Converted ASS/SSA to VTT (best effort)');
      break;
    default:
      // Fallback: treat unknown formats as SRT
      vttContent = advancedSrtToVttConversion(subtitleContent);
      console.log('Unknown format, attempted SRT conversion');
      break;
  }
  
  // Create data URL
  const vttDataUrl = createVttDataUrl(vttContent);
  
  console.log('Conversion completed:');
  console.log('- Original length:', subtitleContent.length);
  console.log('- VTT length:', vttContent.length);
  console.log('- Data URL length:', vttDataUrl.length);
  console.log('- Valid VTT:', validateVttContent(vttContent));
  console.log('=================================');
  
  return {
    vttContent,
    vttDataUrl,
    detectedFormat,
  };
}

/**
 * Quick SRT to VTT conversion function
 * Mimics the Node.js fs-based approach but works in React Native
 * @param srtContent - SRT subtitle content
 * @returns VTT content ready for use
 */
export function quickSrtToVtt(srtContent: string): string {
  // Equivalent to: 'WEBVTT\n\n' + srt.replace(/{\an[1-9]}/g, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2')
  return 'WEBVTT\n\n' + srtContent
    .replace(/\{\\an[1-9]\}/g, '') // remove text alignment tags
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); // replace commas with dots
}

/**
 * Validates VTT content format
 * @param content - VTT content to validate
 * @returns Boolean indicating if content is valid VTT
 */
export function validateVttContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('WEBVTT') && trimmed.includes('-->');
}

/**
 * Cleans and normalizes subtitle timing
 * @param timing - Timing string (e.g., "00:01:23.456 --> 00:01:26.789")
 * @returns Normalized timing string
 */
export function normalizeTiming(timing: string): string {
  return timing
    .replace(/,/g, '.') // Convert comma decimals to dots
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Test function to validate VTT conversion
 * @param srtSample - Sample SRT content for testing
 */
export function testVttConversion(srtSample: string = `1
00:00:01,000 --> 00:00:04,000
Hello, this is a test subtitle.

2
00:00:05,500 --> 00:00:08,000
This is the second subtitle line.`) {
  console.log('=== VTT CONVERSION TEST ===');
  console.log('Input SRT:', srtSample);
  
  const vttResult = convertSubtitleLocally(srtSample, 'srt');
  
  console.log('Output VTT:', vttResult.vttContent);
  console.log('Data URL length:', vttResult.vttDataUrl.length);
  console.log('Is valid VTT:', validateVttContent(vttResult.vttContent));
  console.log('=========================');
  
  return vttResult;
}

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