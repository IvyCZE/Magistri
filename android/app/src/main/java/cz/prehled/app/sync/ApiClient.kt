package cz.prehled.app.sync

import cz.prehled.app.auth.HttpLoginEndpoint
import cz.prehled.app.auth.RefreshResult
import cz.prehled.app.auth.SchoolUrl
import cz.prehled.app.auth.TokenRefresher
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

data class HttpRequest(
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    val body: String? = null,
    val contentType: String? = null,
)

data class HttpResponse(val code: Int, val body: String)

/** Network seam, so the sync logic can be tested without a server. */
fun interface HttpTransport {
    @Throws(IOException::class)
    fun execute(request: HttpRequest): HttpResponse
}

class OkHttpTransport(private val client: OkHttpClient = HttpLoginEndpoint.defaultClient) : HttpTransport {
    override fun execute(request: HttpRequest): HttpResponse {
        val builder = Request.Builder().url(request.url)
        request.headers.forEach { (k, v) -> builder.header(k, v) }
        val body = if (request.method == "GET") null else (request.body ?: "").toRequestBody(request.contentType?.toMediaType())
        builder.method(request.method, body)
        client.newCall(builder.build()).execute().use { response ->
            return HttpResponse(response.code, response.body?.string() ?: "")
        }
    }
}

sealed interface ApiResult {
    /** `body` is a JSONObject, a JSONArray, or null for an empty response. */
    data class Ok(val body: Any?) : ApiResult

    /** The session is gone: no tokens, or the refresh token was refused. */
    data object SessionExpired : ApiResult

    /** Network trouble, an outage, or an unexpected answer. Worth retrying later. */
    data object Failure : ApiResult
}

interface ApiSource {
    fun get(path: String): ApiResult

    /** Komens endpoints want a POST with an empty filter, but some servers only accept other forms. */
    fun komens(path: String): ApiResult
}

/**
 * Authenticated calls to the user's own school server. Mirrors `request()` in
 * src/api/client.ts: bearer token, concrete Accept-Language, one retry after a
 * refresh on 401. Token refreshes go through the shared [TokenRefresher].
 */
class ApiClient(
    private val refresher: TokenRefresher,
    private val transport: HttpTransport = OkHttpTransport(),
) : ApiSource {

    override fun get(path: String): ApiResult = call("GET", path, null, null)

    override fun komens(path: String): ApiResult {
        val attempts = listOf(
            Triple("POST", "{}", "application/json"),
            Triple("POST", "", "application/x-www-form-urlencoded"),
            Triple("GET", null, null),
        )
        var last: ApiResult = ApiResult.Failure
        for ((method, body, type) in attempts) {
            last = call(method, path, body, type)
            if (last is ApiResult.Ok || last is ApiResult.SessionExpired) return last
        }
        return last
    }

    private fun call(method: String, path: String, body: String?, contentType: String?): ApiResult {
        var tokens = when (val r = refresher.validTokens()) {
            is RefreshResult.Success -> r.tokens
            RefreshResult.NoSession, RefreshResult.Rejected -> return ApiResult.SessionExpired
            RefreshResult.Unavailable -> return ApiResult.Failure
        }
        val base = SchoolUrl.normalize(tokens.schoolUrl) ?: return ApiResult.SessionExpired

        var response = try {
            transport.execute(build(method, "$base$path", tokens.accessToken, body, contentType))
        } catch (e: IOException) {
            return ApiResult.Failure
        }

        if (response.code == 401) {
            tokens = when (val r = refresher.refresh(tokens.refreshToken)) {
                is RefreshResult.Success -> r.tokens
                RefreshResult.NoSession, RefreshResult.Rejected -> return ApiResult.SessionExpired
                RefreshResult.Unavailable -> return ApiResult.Failure
            }
            response = try {
                transport.execute(build(method, "$base$path", tokens.accessToken, body, contentType))
            } catch (e: IOException) {
                return ApiResult.Failure
            }
            if (response.code == 401) return ApiResult.SessionExpired
        }

        if (response.code !in 200..299) return ApiResult.Failure
        return parse(response.body)
    }

    private fun build(method: String, url: String, accessToken: String, body: String?, contentType: String?): HttpRequest {
        val headers = mapOf(
            "Accept" to "application/json",
            "Accept-Language" to HttpLoginEndpoint.ACCEPT_LANGUAGE,
            "Authorization" to "Bearer $accessToken",
        )
        return HttpRequest(method, url, headers, body, contentType)
    }

    private fun parse(text: String): ApiResult {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return ApiResult.Ok(null)
        return try {
            ApiResult.Ok(if (trimmed.startsWith("[")) JSONArray(trimmed) else JSONObject(trimmed))
        } catch (e: Exception) {
            ApiResult.Failure
        }
    }
}
