/**
 * Test file for subtitle utilities
 * Run this test to verify SRT to VTT conversion functionality
 */

import { convertSrtToVtt, detectSubtitleFormat, validateVttContent } from '../subtitleUtils';

// Simple assertion function for React Native
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Sample SRT content for testing
const sampleSrtContent = `1
00:00:01,000 --> 00:00:04,000
Hello, this is the first subtitle.

2
00:00:05,500 --> 00:00:08,000
This is the second subtitle.
It has multiple lines.

3
00:00:10,000 --> 00:00:12,500
Final subtitle with formatting.`;

/**
 * Test SRT to VTT conversion
 */
export function testSrtToVttConversion() {
  console.log('=== TESTING SRT TO VTT CONVERSION ===');
  
  // Test format detection
  const detectedFormat = detectSubtitleFormat(sampleSrtContent);
  console.log('Detected format:', detectedFormat);
  assert(detectedFormat === 'srt', 'Should detect SRT format');
  
  // Test conversion
  const convertedVtt = convertSrtToVtt(sampleSrtContent);
  console.log('Converted VTT:');
  console.log(convertedVtt);
  
  // Test VTT validation
  const isValidVtt = validateVttContent(convertedVtt);
  console.log('Is valid VTT:', isValidVtt);
  assert(isValidVtt, 'Converted content should be valid VTT');
  
  // Test structure
  assert(convertedVtt.startsWith('WEBVTT'), 'Should start with WEBVTT header');
  assert(convertedVtt.includes('00:00:01.000 --> 00:00:04.000'), 'Should convert comma to dot in timestamps');
  assert(convertedVtt.includes('Hello, this is the first subtitle.'), 'Should preserve subtitle text');
  
  console.log('✅ All SRT to VTT conversion tests passed!');
  console.log('=====================================');
  
  return {
    original: sampleSrtContent,
    converted: convertedVtt,
    isValid: isValidVtt,
  };
}

/**
 * Test with various SRT formats
 */
export function testVariousSrtFormats() {
  console.log('=== TESTING VARIOUS SRT FORMATS ===');
  
  // Test with BOM
  const srtWithBom = '\uFEFF' + sampleSrtContent;
  const convertedBom = convertSrtToVtt(srtWithBom);
  assert(!convertedBom.includes('\uFEFF'), 'Should remove BOM');
  
  // Test with irregular spacing
  const srtWithSpacing = `1

00:00:01,000 --> 00:00:04,000


Hello, this is spaced content.


2

00:00:05,500 --> 00:00:08,000


Another subtitle.

`;
  
  const convertedSpacing = convertSrtToVtt(srtWithSpacing);
  console.log('Converted spaced SRT:');
  console.log(convertedSpacing);
  assert(validateVttContent(convertedSpacing), 'Should handle irregular spacing');
  
  console.log('✅ All various format tests passed!');
  console.log('===================================');
}

/**
 * Test error cases
 */
export function testErrorCases() {
  console.log('=== TESTING ERROR CASES ===');
  
  // Test empty content
  const emptyVtt = convertSrtToVtt('');
  console.log('Empty content result:', emptyVtt);
  assert(emptyVtt === 'WEBVTT\n\n', 'Should return minimal VTT for empty content');
  
  // Test malformed SRT
  const malformedSrt = 'This is not a valid SRT file';
  const malformedVtt = convertSrtToVtt(malformedSrt);
  console.log('Malformed SRT result:', malformedVtt);
  assert(malformedVtt.startsWith('WEBVTT'), 'Should still start with VTT header');
  
  console.log('✅ All error case tests passed!');
  console.log('===============================');
}

/**
 * Run all tests
 */
export function runAllSubtitleTests() {
  try {
    testSrtToVttConversion();
    testVariousSrtFormats();
    testErrorCases();
    
    console.log('🎉 ALL SUBTITLE CONVERSION TESTS PASSED! 🎉');
    return true;
  } catch (error) {
    console.error('❌ Subtitle conversion tests failed:', error);
    return false;
  }
}