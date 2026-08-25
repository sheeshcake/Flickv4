//
// Use this file to import your target's public headers that you would like to expose to Swift.
//
// RNBackgroundDownloader has no Mac Catalyst slice; guard the import so the
// Catalyst build does not pull in the iOS-only ObjC class.
#if !TARGET_OS_MACCATALYST
#import <RNBackgroundDownloader.h>
#endif
