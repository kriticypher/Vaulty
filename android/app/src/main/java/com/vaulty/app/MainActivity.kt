package com.vaulty.app

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

/**
 * MainActivity - the entire "app": a WebView shell around the Vaultly React
 * frontend served by Vite on the laptop.
 *
 * What it adds beyond a plain browser:
 *  1. Persistent cookies — the 7-day session cookie survives app restarts.
 *  2. File chooser — the invoice upload <input type="file"> opens the Android
 *     file picker (photos, documents, PDFs).
 *  3. Downloads — the JS bridge `window.VaultlyAndroid.download(url, name)`
 *     saves files (CSV export, invoice PDFs) to the Downloads folder via the
 *     system DownloadManager, with the session cookie attached. The React code
 *     calls this automatically when it detects the bridge.
 *  4. Back navigation — the hardware/gesture back button walks WebView history.
 *
 * URL resolution: the emulator reaches the laptop's loopback as 10.0.2.2
 * (5173 = Vite, 8000 = backend). On a REAL device, run `adb reverse` instead
 * (see android/SETUP.md) and leave the URL as localhost, OR point both ends at
 * the laptop's LAN IP.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView

    // Where the frontend lives. Emulator default = 10.0.2.2 (host loopback).
    private val startUrl = "http://10.0.2.2:5173"

    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // Pending download while waiting for the storage permission (Android 8.x).
    private var pendingUrl: String? = null
    private var pendingName: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true                 // localStorage (auth token)
            allowFileAccess = false                  // page comes from http, not file://
            javaScriptCanOpenWindowsAutomatically = true
            // Honour the page's <meta name="viewport"> so the responsive CSS
            // media queries (<=900px mobile layout) actually apply on phones.
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        // Persist the session cookie across app restarts.
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)   // cancel any previous picker
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        // The JS bridge the frontend detects as window.VaultlyAndroid.
        webView.addJavascriptInterface(Bridge(), "VaultlyAndroid")

        webView.loadUrl(startUrl)
    }

    // ── Downloads (called from JS through the bridge) ─────────────────────────

    private inner class Bridge {
        @JavascriptInterface
        fun download(url: String, filename: String) {
            val safeName = filename.replace(Regex("[\\\\/:*?\"<>|]"), "_")
            enqueueDownload(url, safeName)
        }
    }

    private fun enqueueDownload(url: String, filename: String) {
        // Public Downloads folder needs WRITE_EXTERNAL_STORAGE only on API < 29.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED
        ) {
            pendingUrl = url
            pendingName = filename
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE)
            return
        }

        val cookies = CookieManager.getInstance().getCookie(url) ?: ""
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(filename)
            .setDescription("Vaultly download")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
        if (cookies.isNotEmpty()) request.addRequestHeader("Cookie", cookies)

        (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        toast("Saving \"$filename\" to Downloads…")
    }

    private fun toast(message: String) {
        runOnUiThread { Toast.makeText(this, message, Toast.LENGTH_SHORT).show() }
    }

    // ── Result plumbing (file chooser + storage permission) ───────────────────

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            val callback = fileCallback
            fileCallback = null
            callback?.onReceiveValue(
                if (resultCode == RESULT_OK)
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                else null
            )
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (requestCode == REQ_STORAGE) {
            val url = pendingUrl
            val name = pendingName
            pendingUrl = null
            pendingName = null
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && url != null) {
                enqueueDownload(url, name ?: "download")
            } else {
                toast("Storage permission denied — download cancelled.")
            }
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        }
    }

    // ── Navigation & lifecycle ────────────────────────────────────────────────

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        // Flush cookies so the session survives being killed by the OS.
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_FILE = 1001
        private const val REQ_STORAGE = 1002
    }
}
