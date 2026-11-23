package cz.prehled.app.auth

import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

sealed interface RefreshResponse {
    /** The server issued a new token pair. */
    data class Issued(val accessToken: String, val refreshToken: String?, val expiresIn: Long, val tokenType: String?, val scope: String?) : RefreshResponse

    /** The server refused the refresh token. The session cannot continue without a new login. */
    data object Rejected : RefreshResponse

    /** Network trouble or a server error. Retrying later may work. */
    data object Unavailable : RefreshResponse
}

fun interface LoginEndpoint {
    fun refresh(schoolUrl: String, refreshToken: String): RefreshResponse
}

class HttpLoginEndpoint(private val client: OkHttpClient = defaultClient) : LoginEndpoint {
    override fun refresh(schoolUrl: String, refreshToken: String): RefreshResponse {
        val base = SchoolUrl.normalize(schoolUrl) ?: return RefreshResponse.Rejected
        val url = "$base/api/login".toHttpUrlOrNull() ?: return RefreshResponse.Rejected
        val body = FormBody.Builder()
            .add("client_id", CLIENT_ID)
            .add("grant_type", "refresh_token")
            .add("refresh_token", refreshToken)
            .build()
        val request = Request.Builder()
            .url(url)
            .post(body)
            .header("Accept", "application/json")
            .header("Accept-Language", ACCEPT_LANGUAGE)
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                when {
                    response.code == 400 || response.code == 401 -> RefreshResponse.Rejected
                    !response.isSuccessful -> RefreshResponse.Unavailable
                    else -> parse(response.body?.string())
                }
            }
        } catch (e: IOException) {
            RefreshResponse.Unavailable
        }
    }

    private fun parse(text: String?): RefreshResponse {
        val json = try {
            JSONObject(text ?: return RefreshResponse.Unavailable)
        } catch (e: Exception) {
            return RefreshResponse.Unavailable
        }
        val access = json.optString("access_token")
        if (access.isEmpty()) return RefreshResponse.Rejected
        return RefreshResponse.Issued(
            accessToken = access,
            refreshToken = json.optString("refresh_token").ifEmpty { null },
            expiresIn = json.optLong("expires_in", 3600).takeIf { it > 0 } ?: 3600,
            tokenType = json.optString("token_type").ifEmpty { null },
            scope = json.optString("scope").ifEmpty { null },
        )
    }

    companion object {
        // Same client id the web client sends (BAKALARI_CLIENT_ID in src/api/client.ts); a web test keeps them equal.
        const val CLIENT_ID = "ANDR"
        const val ACCEPT_LANGUAGE = "cs-CZ,cs;q=0.9,en;q=0.8"

        val defaultClient: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(12, TimeUnit.SECONDS)
                .readTimeout(12, TimeUnit.SECONDS)
                .writeTimeout(12, TimeUnit.SECONDS)
                .build()
        }
    }
}

object SchoolUrl {
    /** Returns an https base URL without trailing slash, or null when the input cannot be trusted. */
    fun normalize(input: String): String? {
        val trimmed = input.trim().trimEnd('/')
        if (trimmed.isEmpty()) return null
        val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
        if (!withScheme.startsWith("https://", ignoreCase = true)) return null
        return withScheme
    }
}
