package com.bondcheck

import android.app.Activity
import android.content.Intent
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class BondFilePickerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pending: Promise? = null
  private val executor = Executors.newSingleThreadExecutor()
  private val requestCode = 7104
  private val maximumBytes = 5 * 1024 * 1024

  init {
    context.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, code: Int, result: Int, data: Intent?) {
        if (code != requestCode) return
        val promise = pending ?: return
        pending = null
        val uri = data?.data
        if (result != Activity.RESULT_OK || uri == null) {
          promise.resolve(null)
          return
        }
        executor.execute {
          try {
            var name = "official-result.txt"
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
              if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
            }
            val bytes = ByteArrayOutputStream()
            context.contentResolver.openInputStream(uri)?.use { input ->
              val buffer = ByteArray(8192)
              while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (bytes.size() + count > maximumBytes) throw IllegalArgumentException("Choose a file up to 5 MB")
                bytes.write(buffer, 0, count)
              }
            } ?: throw IllegalStateException("Cannot read the selected file")
            val value = Arguments.createMap()
            value.putString("name", name)
            value.putString("base64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
            promise.resolve(value)
          } catch (error: Exception) {
            promise.reject("FILE_READ", error.message, error)
          }
        }
      }
    })
  }

  override fun getName() = "BondFilePicker"

  @ReactMethod
  fun fetchOfficial(value: String, promise: Promise) {
    executor.execute {
      try {
        var url = URL(value)
        val deadline = System.nanoTime() + 20_000_000_000L
        var redirects = 0
        while (true) {
          require(url.protocol == "https" && url.host in listOf("savings.gov.pk", "www.savings.gov.pk") &&
            url.userInfo == null && (url.port == -1 || url.port == 443)) { "Only official HTTPS URLs are allowed" }
          fun remaining(): Int {
            val ms = (deadline - System.nanoTime()) / 1_000_000L
            require(ms > 0) { "Official download timed out" }
            return ms.toInt()
          }
          val connection = url.openConnection() as HttpsURLConnection
          try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = remaining()
            connection.readTimeout = remaining()
            connection.setRequestProperty("User-Agent", "PrizeBondChecker/1.0 (personal use)")
            val status = connection.responseCode
            if (status in listOf(301, 302, 303, 307, 308)) {
              require(redirects++ < 3) { "Too many official-site redirects" }
              val location = connection.getHeaderField("Location") ?: error("Missing redirect location")
              url = URL(url, location)
              continue
            }
            require(status == 200) { "Official site returned HTTP $status" }
            require(connection.contentLengthLong <= maximumBytes) { "Official file exceeds 5 MB" }
            val output = ByteArrayOutputStream()
            connection.inputStream.use { input ->
              val buffer = ByteArray(8192)
              while (true) {
                connection.readTimeout = remaining()
                val count = input.read(buffer)
                if (count < 0) break
                require(output.size() + count <= maximumBytes) { "Official file exceeds 5 MB" }
                output.write(buffer, 0, count)
              }
            }
            val result = Arguments.createMap()
            result.putString("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP))
            promise.resolve(result)
            break
          } finally { connection.disconnect() }
        }
      } catch (error: Exception) { promise.reject("OFFICIAL_FETCH", error.message, error) }
    }
  }

  @ReactMethod
  fun pick(promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) { promise.reject("NO_ACTIVITY", "Open the app before choosing a file"); return }
    if (pending != null) { promise.reject("PICKER_OPEN", "A file picker is already open"); return }
    pending = promise
    activity.runOnUiThread {
      try {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivityForResult(intent, requestCode)
      } catch (error: Exception) { pending = null; promise.reject("FILE_PICKER", error.message, error) }
    }
  }

  override fun invalidate() {
    pending?.reject("APP_CLOSED", "The app closed before a file was selected")
    pending = null
    executor.shutdown()
    super.invalidate()
  }
}
