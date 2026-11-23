package cz.prehled.app.sync

import cz.prehled.app.auth.HttpLoginEndpoint
import cz.prehled.app.auth.RefreshResult
import cz.prehled.app.auth.SchoolUrl
import cz.prehled.app.auth.TokenRefresher
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.TimeUnit

class BinaryResponse(val code: Int, val body: InputStream?, private val closeable: Closeable? = null) : Closeable {
    override fun close() {
        closeable?.close()
    }
}

/** Network seam for downloads, like [HttpTransport] for JSON. */
fun interface BinaryTransport {
    @Throws(IOException::class)
    fun execute(request: HttpRequest): BinaryResponse
}

class OkHttpBinaryTransport(private val client: OkHttpClient = downloadClient) : BinaryTransport {
    override fun execute(request: HttpRequest): BinaryResponse {
        val builder = Request.Builder().url(request.url)
        request.headers.forEach { (k, v) -> builder.header(k, v) }
        val response = client.newCall(builder.build()).execute()
        return BinaryResponse(response.code, response.body?.byteStream(), response)
    }

    companion object {
        // The login client reads for 12 s in total per call; a file needs a longer overall window but
        // still fails when the server stops sending.
        val downloadClient: OkHttpClient by lazy {
            HttpLoginEndpoint.defaultClient.newBuilder().readTimeout(30, TimeUnit.SECONDS).build()
        }
    }
}

sealed interface DownloadResult {
    data class Done(val bytes: Long) : DownloadResult
    data object SessionExpired : DownloadResult
    data object NotFound : DownloadResult
    data object Failure : DownloadResult
}

/**
 * Downloads one attachment (message or homework, the endpoint serves both) from the user's own
 * school server with the stored tokens. The file never passes through the WebView bridge.
 */
class AttachmentDownloader(
    private val refresher: TokenRefresher,
    private val transport: BinaryTransport = OkHttpBinaryTransport(),
) {
    /** [openSink] runs only once the server has answered 200, so a failed request leaves no empty file behind. */
    fun download(attachmentId: String, openSink: () -> OutputStream): DownloadResult {
        var tokens = when (val r = refresher.validTokens()) {
            is RefreshResult.Success -> r.tokens
            RefreshResult.NoSession, RefreshResult.Rejected -> return DownloadResult.SessionExpired
            RefreshResult.Unavailable -> return DownloadResult.Failure
        }
        val base = SchoolUrl.normalize(tokens.schoolUrl) ?: return DownloadResult.SessionExpired
        val url = "$base/api/3/komens/attachment/${AttachmentFiles.encodePathSegment(attachmentId)}"

        fun request(accessToken: String) = HttpRequest(
            "GET", url,
            mapOf(
                "Accept" to "*/*",
                "Accept-Language" to HttpLoginEndpoint.ACCEPT_LANGUAGE,
                "Authorization" to "Bearer $accessToken",
            ),
        )

        return try {
            var outcome = transport.execute(request(tokens.accessToken)).use { handle(it, openSink) }
            if (outcome == null) {
                tokens = when (val r = refresher.refresh(tokens.refreshToken)) {
                    is RefreshResult.Success -> r.tokens
                    RefreshResult.NoSession, RefreshResult.Rejected -> return DownloadResult.SessionExpired
                    RefreshResult.Unavailable -> return DownloadResult.Failure
                }
                outcome = transport.execute(request(tokens.accessToken)).use { handle(it, openSink) }
            }
            outcome ?: DownloadResult.SessionExpired
        } catch (e: IOException) {
            DownloadResult.Failure
        }
    }

    /** Null means 401, which the caller answers with a refresh. */
    private fun handle(response: BinaryResponse, openSink: () -> OutputStream): DownloadResult? = when {
        response.code == 401 -> null
        response.code == 404 -> DownloadResult.NotFound
        response.code != 200 || response.body == null -> DownloadResult.Failure
        else -> openSink().use { sink -> DownloadResult.Done(response.body.copyTo(sink)) }
    }
}
