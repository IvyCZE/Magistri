package cz.prehled.app.sync

import cz.prehled.app.auth.LoginEndpoint
import cz.prehled.app.auth.RefreshResponse
import cz.prehled.app.auth.TokenRefresher
import cz.prehled.app.auth.TokenStore
import cz.prehled.app.auth.Tokens
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

class AttachmentDownloaderTest {
    private class Store(var tokens: Tokens?) : TokenStore {
        override fun load() = tokens
        override fun save(tokens: Tokens) { this.tokens = tokens }
        override fun clear() { tokens = null }
    }

    private val now = 1_000_000_000L
    private val tokens = Tokens("a1", "r1", 3600, "Bearer", null, "U1", "school.example", now)
    private val neverCalled = LoginEndpoint { _, _ -> error("login must not be called") }

    private fun downloader(store: Store, endpoint: LoginEndpoint, transport: BinaryTransport) =
        AttachmentDownloader(TokenRefresher(store, endpoint) { now }, transport)

    private fun ok(bytes: ByteArray) = BinaryResponse(200, ByteArrayInputStream(bytes))

    @Test
    fun savesTheBodyAndEncodesTheIdInTheUrl() {
        var seen: HttpRequest? = null
        val payload = byteArrayOf(1, 2, 3, 4)
        val sink = ByteArrayOutputStream()
        val result = downloader(Store(tokens), neverCalled) { req -> seen = req; ok(payload) }
            .download("AB 12/x") { sink }
        assertEquals(DownloadResult.Done(4), result)
        assertArrayEquals(payload, sink.toByteArray())
        assertEquals("https://school.example/api/3/komens/attachment/AB%2012%2Fx", seen!!.url)
        assertEquals("Bearer a1", seen!!.headers["Authorization"])
    }

    @Test
    fun refreshesOn401AndRetriesOnce() {
        val store = Store(tokens)
        val used = mutableListOf<String>()
        val sink = ByteArrayOutputStream()
        val result = downloader(store, { _, _ -> RefreshResponse.Issued("a2", "r2", 3600, null, null) }) { req ->
            used += req.headers.getValue("Authorization")
            if (req.headers["Authorization"] == "Bearer a1") BinaryResponse(401, null) else ok(byteArrayOf(9))
        }.download("X") { sink }
        assertEquals(DownloadResult.Done(1), result)
        assertEquals(listOf("Bearer a1", "Bearer a2"), used)
    }

    @Test
    fun expiredSessionWhenRefreshIsRejected() {
        val result = downloader(Store(tokens), { _, _ -> RefreshResponse.Rejected }) { BinaryResponse(401, null) }
            .download("X") { error("no sink") }
        assertEquals(DownloadResult.SessionExpired, result)
    }

    @Test
    fun noTokensMeansExpiredSession() {
        assertEquals(
            DownloadResult.SessionExpired,
            downloader(Store(null), neverCalled) { error("no call") }.download("X") { error("no sink") },
        )
    }

    @Test
    fun unknownAttachmentAndServerErrorsCreateNoFile() {
        var sinks = 0
        val notFound = downloader(Store(tokens), neverCalled) { BinaryResponse(404, null) }.download("X") { sinks++; ByteArrayOutputStream() }
        val broken = downloader(Store(tokens), neverCalled) { BinaryResponse(500, null) }.download("X") { sinks++; ByteArrayOutputStream() }
        assertEquals(DownloadResult.NotFound, notFound)
        assertEquals(DownloadResult.Failure, broken)
        assertEquals(0, sinks)
    }

    @Test
    fun networkErrorsAndInterruptedBodiesAreFailures() {
        val offline = downloader(Store(tokens), neverCalled) { throw IOException("offline") }.download("X") { ByteArrayOutputStream() }
        val cut = object : InputStream() {
            override fun read(): Int = throw IOException("connection reset")
        }
        val interrupted = downloader(Store(tokens), neverCalled) { BinaryResponse(200, cut) }.download("X") { ByteArrayOutputStream() }
        assertEquals(DownloadResult.Failure, offline)
        assertEquals(DownloadResult.Failure, interrupted)
    }

    @Test
    fun fileNamesAreMadeSafe() {
        assertEquals("a_b_c.pdf", AttachmentFiles.safeFileName("a/b\\c.pdf"))
        assertEquals("secret.txt", AttachmentFiles.safeFileName("../.secret.txt".substringAfterLast('/')).removePrefix("_"))
        assertEquals("priloha", AttachmentFiles.safeFileName("   "))
        assertEquals("priloha", AttachmentFiles.safeFileName(null))
        assertEquals("Čtenářský deník.pdf", AttachmentFiles.safeFileName("Čtenářský deník.pdf"))
        val long = AttachmentFiles.safeFileName("x".repeat(300) + ".docx")
        assertEquals(120, long.length)
        assertTrue(long.endsWith(".docx"))
    }

    @Test
    fun typesComeFromTheExtension() {
        assertEquals("application/pdf", AttachmentFiles.mimeTypeFor("Test.PDF"))
        assertEquals("image/jpeg", AttachmentFiles.mimeTypeFor("foto.jpeg"))
        assertNull(AttachmentFiles.mimeTypeFor("archiv.xyz"))
        assertNull(AttachmentFiles.mimeTypeFor("bezpripony"))
        assertFalse(AttachmentFiles.encodePathSegment("a b+c").contains(' '))
        assertEquals("a%20b%2Bc", AttachmentFiles.encodePathSegment("a b+c"))
    }
}
