package cz.prehled.app.sync

import cz.prehled.app.auth.LoginEndpoint
import cz.prehled.app.auth.RefreshResponse
import cz.prehled.app.auth.TokenRefresher
import cz.prehled.app.auth.TokenStore
import cz.prehled.app.auth.Tokens
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class ApiClientTest {
    private class Store(var tokens: Tokens?) : TokenStore {
        override fun load() = tokens
        override fun save(tokens: Tokens) { this.tokens = tokens }
        override fun clear() { tokens = null }
    }

    private val now = 1_000_000_000L

    private fun tokens(access: String = "a1", refresh: String = "r1", obtainedAt: Long = now) = Tokens(
        access, refresh, 3600, "Bearer", null, "U1", "school.example", obtainedAt,
    )

    private fun client(store: Store, endpoint: LoginEndpoint, transport: HttpTransport) =
        ApiClient(TokenRefresher(store, endpoint) { now }, transport)

    private val neverCalled = LoginEndpoint { _, _ -> error("login must not be called") }

    @Test
    fun sendsBearerTokenOverHttpsWithLanguageHeader() {
        var seen: HttpRequest? = null
        val api = client(Store(tokens()), neverCalled) { req -> seen = req; HttpResponse(200, """{"ok":true}""") }
        val result = api.get("/api/3/marks") as ApiResult.Ok
        assertTrue((result.body as JSONObject).getBoolean("ok"))
        assertEquals("https://school.example/api/3/marks", seen!!.url)
        assertEquals("Bearer a1", seen!!.headers["Authorization"])
        assertTrue(seen!!.headers.getValue("Accept-Language").startsWith("cs-CZ"))
    }

    @Test
    fun refreshesOn401AndRetriesOnce() {
        val store = Store(tokens())
        val auth = mutableListOf<String>()
        val api = client(store, { _, _ -> RefreshResponse.Issued("a2", "r2", 3600, null, null) }) { req ->
            auth += req.headers.getValue("Authorization")
            if (req.headers["Authorization"] == "Bearer a1") HttpResponse(401, "") else HttpResponse(200, "{}")
        }
        assertTrue(api.get("/x") is ApiResult.Ok)
        assertEquals(listOf("Bearer a1", "Bearer a2"), auth)
        assertEquals("r2", store.tokens?.refreshToken)
    }

    @Test
    fun expiredSessionWhenRefreshIsRejected() {
        val api = client(Store(tokens()), { _, _ -> RefreshResponse.Rejected }) { HttpResponse(401, "") }
        assertEquals(ApiResult.SessionExpired, api.get("/x"))
    }

    @Test
    fun noTokensMeansExpiredSession() {
        assertEquals(ApiResult.SessionExpired, client(Store(null), neverCalled) { error("no call") }.get("/x"))
    }

    @Test
    fun proactiveRefreshWhenAccessTokenIsAboutToExpire() {
        val store = Store(tokens(obtainedAt = now - 3_600_000 + 10_000))
        var used = ""
        val api = client(store, { _, _ -> RefreshResponse.Issued("a2", "r2", 3600, null, null) }) { req ->
            used = req.headers.getValue("Authorization"); HttpResponse(200, "{}")
        }
        api.get("/x")
        assertEquals("Bearer a2", used)
    }

    @Test
    fun serverErrorsAndNetworkFailuresAreRetryableFailures() {
        assertEquals(ApiResult.Failure, client(Store(tokens()), neverCalled) { HttpResponse(500, "") }.get("/x"))
        assertEquals(ApiResult.Failure, client(Store(tokens()), neverCalled) { throw IOException("offline") }.get("/x"))
        assertEquals(ApiResult.Failure, client(Store(tokens()), neverCalled) { HttpResponse(200, "<html>") }.get("/x"))
    }

    @Test
    fun plainHttpSchoolUrlIsRefused() {
        val api = client(Store(tokens().copy(schoolUrl = "http://school.example")), neverCalled) { error("must not connect") }
        assertEquals(ApiResult.SessionExpired, api.get("/x"))
    }

    @Test
    fun komensFallsBackThroughPostFormAndGet() {
        val methods = mutableListOf<String>()
        val api = client(Store(tokens()), neverCalled) { req ->
            methods += "${req.method}:${req.contentType}"
            if (req.method == "GET") HttpResponse(200, """{"Messages":[]}""") else HttpResponse(405, "")
        }
        assertTrue(api.komens("/api/3/komens/messages/received") is ApiResult.Ok)
        assertEquals(listOf("POST:application/json", "POST:application/x-www-form-urlencoded", "GET:null"), methods)
    }
}
