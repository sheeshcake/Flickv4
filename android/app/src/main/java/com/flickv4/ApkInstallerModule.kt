package com.flickv4

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class ApkInstallerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "ApkInstaller"
    }

    @ReactMethod
    fun install(apkPath: String, promise: Promise) {
        try {
            val file = File(apkPath)
            
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file not found at: $apkPath")
                return
            }

            val intent = Intent(Intent.ACTION_VIEW)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            
            val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // For Android 7.0+ use FileProvider
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                FileProvider.getUriForFile(
                    reactApplicationContext,
                    "${reactApplicationContext.packageName}.fileprovider",
                    file
                )
            } else {
                // For older versions use file:// URI
                Uri.fromFile(file)
            }
            
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            
            val activity = getCurrentActivity()
            if (activity != null) {
                activity.startActivity(intent)
                promise.resolve(true)
            } else {
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", "Failed to install APK: ${e.message}", e)
        }
    }
}
