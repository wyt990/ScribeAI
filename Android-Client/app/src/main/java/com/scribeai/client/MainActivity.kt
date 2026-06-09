package com.scribeai.client

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import com.scribeai.client.BuildConfig
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        private const val HOME_URL = "https://meeting.ryledu.cn"
    }

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var authStore: AuthSessionStore

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val requiredPermissions: Array<String>
        get() = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.READ_MEDIA_IMAGES)
                add(Manifest.permission.READ_MEDIA_VIDEO)
                add(Manifest.permission.READ_MEDIA_AUDIO)
            } else {
                add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }.toTypedArray()

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val allGranted = result.values.all { it }
            if (!allGranted) {
                Toast.makeText(this, R.string.permission_denied, Toast.LENGTH_LONG).show()
            }
            grantPendingWebPermissionIfPossible()
        }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
            filePathCallback?.onReceiveValue(uris.toTypedArray())
            filePathCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        authStore = AuthSessionStore(this)
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)

        setupWebView()
        ensureFreshWebCache()
        requestAppPermissions()
        webView.loadUrl("$HOME_URL/?rand=${System.currentTimeMillis()}")

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowContentAccess = true
            allowFileAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
            userAgentString = "$userAgentString ScribeAI-Android"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                return !url.startsWith("http://") && !url.startsWith("https://")
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (isAppOrigin(url)) {
                    reconcileAuthSessionWithWebView()
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    Toast.makeText(this@MainActivity, R.string.load_error, Toast.LENGTH_SHORT).show()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress in 1..99) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                pendingWebPermissionRequest = request
                grantPendingWebPermissionIfPossible()
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                val mime = fileChooserParams?.acceptTypes?.firstOrNull()?.ifBlank { "*/*" } ?: "*/*"
                fileChooserLauncher.launch(mime)
                return true
            }
        }
    }

    /**
     * 页面加载完成后：必要时从原生恢复 token，校验有效性，无效则双向清除；
     * 仅在 token 有效时从登录页自动跳转。
     */
    private fun reconcileAuthSessionWithWebView() {
        val nativeToken = authStore.token.orEmpty()
        val nativeUser = authStore.user.orEmpty()
        val script = """
            (async function(){
              var nativeToken = ${JSONObject.quote(nativeToken)};
              var nativeUser = ${JSONObject.quote(nativeUser)};

              if (!localStorage.getItem('token') && nativeToken) {
                localStorage.setItem('token', nativeToken);
                if (nativeUser) localStorage.setItem('user', nativeUser);
              }

              var token = localStorage.getItem('token') || '';
              if (!token) {
                return JSON.stringify({ token: '', user: '' });
              }

              try {
                var res = await fetch('/api/auth/me', {
                  headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  return JSON.stringify({ token: '', user: '' });
                }
                var p = location.pathname;
                if (p === '/' || p === '/login') {
                  location.replace('/dashboard?rand=' + Date.now());
                }
              } catch (e) {
                // 网络异常时保留本地 token，避免误清登录态
              }

              return JSON.stringify({
                token: localStorage.getItem('token') || '',
                user: localStorage.getItem('user') || ''
              });
            })();
        """.trimIndent()
        webView.evaluateJavascript(script) { raw ->
            applyAuthSnapshotFromWebView(raw)
        }
    }

    /** 将网页登录态同步到原生，供下次冷启动恢复（不触发跳转） */
    private fun syncAuthSessionFromWebView() {
        webView.evaluateJavascript(
            """
            (function(){
              return JSON.stringify({
                token: localStorage.getItem('token') || '',
                user: localStorage.getItem('user') || ''
              });
            })();
            """.trimIndent()
        ) { raw ->
            applyAuthSnapshotFromWebView(raw)
        }
    }

    private fun applyAuthSnapshotFromWebView(raw: String?) {
        val jsonText = decodeJsJsonResult(raw) ?: return
        try {
            val json = JSONObject(jsonText)
            val token = json.optString("token", "")
            val user = json.optString("user", "")
            if (token.isNotEmpty()) {
                authStore.save(token, user)
            } else {
                authStore.clear()
            }
        } catch (_: Exception) {
            // 忽略解析失败
        }
    }

    private fun decodeJsJsonResult(raw: String?): String? {
        if (raw.isNullOrBlank() || raw == "null") return null
        var text = raw
        if (text.startsWith("\"") && text.endsWith("\"")) {
            text = text.substring(1, text.length - 1)
        }
        return text.replace("\\\\", "\\").replace("\\\"", "\"")
    }

    /** APK 升级后清一次 WebView 缓存，避免旧 HTML/JS 残留 */
    private fun ensureFreshWebCache() {
        val currentVersion = BuildConfig.VERSION_CODE
        if (authStore.webCacheVersion != currentVersion) {
            webView.clearCache(true)
            authStore.webCacheVersion = currentVersion
        }
    }

    private fun isAppOrigin(url: String): Boolean {
        return url.startsWith("https://meeting.ryledu.cn") ||
            url.startsWith("http://meeting.ryledu.cn")
    }

    private fun requestAppPermissions() {
        val missing = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    private fun grantPendingWebPermissionIfPossible() {
        val request = pendingWebPermissionRequest ?: return
        val resources = request.resources

        val needsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
        val needsVideo = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)

        val audioOk = !needsAudio ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        val videoOk = !needsVideo ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

        if (audioOk && videoOk) {
            request.grant(resources)
            pendingWebPermissionRequest = null
        } else {
            request.deny()
            pendingWebPermissionRequest = null
            val toRequest = buildList {
                if (needsAudio) add(Manifest.permission.RECORD_AUDIO)
                if (needsVideo) add(Manifest.permission.CAMERA)
            }
            if (toRequest.isNotEmpty()) {
                permissionLauncher.launch(toRequest.toTypedArray())
            }
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
        if (isAppOrigin(webView.url.orEmpty())) {
            syncAuthSessionFromWebView()
        }
    }

    override fun onDestroy() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }
}
