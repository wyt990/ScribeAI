package com.scribeai.client

import android.content.Context

/** 将 Web 端 JWT 备份到原生存储，避免 WebView 重启后 localStorage 丢失 */
class AuthSessionStore(context: Context) {
    private val prefs =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    val token: String? get() = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotEmpty() }
    val user: String? get() = prefs.getString(KEY_USER, null)?.takeIf { it.isNotEmpty() }

    fun hasSession(): Boolean = token != null

    fun save(token: String, user: String?) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER, user.orEmpty())
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    var webCacheVersion: Int
        get() = prefs.getInt(KEY_WEB_CACHE_VERSION, 0)
        set(value) = prefs.edit().putInt(KEY_WEB_CACHE_VERSION, value).apply()

    companion object {
        private const val PREFS_NAME = "scribeai_auth"
        private const val KEY_TOKEN = "token"
        private const val KEY_USER = "user"
        private const val KEY_WEB_CACHE_VERSION = "web_cache_version"
    }
}
