package cz.prehled.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

private class FakeStore(var tokens: Tokens?) : TokenStore {
    override fun load() = tokens
    override fun save(tokens: Tokens) { this.tokens = tokens }
    override fun clear() { tokens = null }
}

private class FakeEndpoint(private val respond: (String) -> RefreshResponse) : LoginEndpoint {
    val calls = AtomicInteger()
    val redeemed = java.util.Collections.synchronizedList(mutableListOf<String>())
    override fun refresh(schoolUrl: String, refreshToken: String): RefreshResponse {
        calls.incrementAndGet()
        redeemed += refreshToken
        return respond(refreshToken)
    }
}

class TokenRefresherTest {
    private val now = 1_000_000_000L

    private fun tokens(refresh: String = "r1", obtainedAt: Long = now - 10_000_000, expiresIn: Long = 3600) = Tokens(
        accessToken = "a-$refresh", refreshToken = refresh, expiresIn = expiresIn, tokenType = "Bearer",
        scope = null, userId = "U1", schoolUrl = "https://school.example", obtainedAt = obtainedAt,
    )

    private fun issued(n: Int) = RefreshResponse.Issued("a$n", "r$n", 3600, "Bearer", null)

    @Test
    fun refreshStoresRotatedPair() {
        val store = FakeStore(tokens("r1"))
        val endpoint = FakeEndpoint { issued(2) }
        val result = TokenRefresher(store, endpoint) { now }.refresh("r1")
        assertTrue(result is RefreshResult.Success)
        assertEquals("r2", store.tokens?.refreshToken)
        assertEquals("a2", store.tokens?.accessToken)
        assertEquals(now, store.tokens?.obtainedAt)
        assertEquals("U1", store.tokens?.userId)
    }

    @Test
    fun staleCallerGetsStoredTokensWithoutHittingServer() {
        val store = FakeStore(tokens("r2"))
        val endpoint = FakeEndpoint { error("must not be called") }
        val result = TokenRefresher(store, endpoint) { now }.refresh("r1")
        assertEquals("r2", (result as RefreshResult.Success).tokens.refreshToken)
        assertEquals(0, endpoint.calls.get())
    }

    @Test
    fun concurrentCallersRedeemEachRefreshTokenOnce() {
        val store = FakeStore(tokens("r1"))
        val counter = AtomicInteger(1)
        val endpoint = FakeEndpoint { issued(counter.incrementAndGet()) }
        val refresher = TokenRefresher(store, endpoint) { now }
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        val futures = (1..8).map { pool.submit<RefreshResult> { start.await(); refresher.refresh("r1") } }
        start.countDown()
        val results = futures.map { it.get() }
        pool.shutdown()
        assertEquals(1, endpoint.calls.get())
        assertEquals(listOf("r1"), endpoint.redeemed.toList())
        assertTrue(results.all { it is RefreshResult.Success })
        assertEquals("r2", store.tokens?.refreshToken)
    }

    @Test
    fun rejectedKeepsStoredTokens() {
        val store = FakeStore(tokens("r1"))
        val result = TokenRefresher(store, FakeEndpoint { RefreshResponse.Rejected }) { now }.refresh("r1")
        assertEquals(RefreshResult.Rejected, result)
        assertEquals("r1", store.tokens?.refreshToken)
    }

    @Test
    fun unavailableKeepsStoredTokens() {
        val store = FakeStore(tokens("r1"))
        val result = TokenRefresher(store, FakeEndpoint { RefreshResponse.Unavailable }) { now }.refresh(null)
        assertEquals(RefreshResult.Unavailable, result)
        assertEquals("r1", store.tokens?.refreshToken)
    }

    @Test
    fun noSessionWhenNothingStored() {
        val result = TokenRefresher(FakeStore(null), FakeEndpoint { error("no") }) { now }.refresh("r1")
        assertEquals(RefreshResult.NoSession, result)
    }

    @Test
    fun validTokensSkipsServerWhenFresh() {
        val store = FakeStore(tokens("r1", obtainedAt = now - 1000))
        val endpoint = FakeEndpoint { error("no") }
        val result = TokenRefresher(store, endpoint) { now }.validTokens()
        assertEquals("r1", (result as RefreshResult.Success).tokens.refreshToken)
        assertEquals(0, endpoint.calls.get())
    }

    @Test
    fun validTokensRefreshesWithinExpiryMargin() {
        val store = FakeStore(tokens("r1", obtainedAt = now - 3_600_000 + 30_000))
        val endpoint = FakeEndpoint { issued(2) }
        TokenRefresher(store, endpoint) { now }.validTokens()
        assertEquals(1, endpoint.calls.get())
        assertEquals("r2", store.tokens?.refreshToken)
    }

    @Test
    fun missingRotatedRefreshTokenKeepsOldOne() {
        val store = FakeStore(tokens("r1"))
        val endpoint = FakeEndpoint { RefreshResponse.Issued("a2", null, 3600, null, null) }
        TokenRefresher(store, endpoint) { now }.refresh("r1")
        assertEquals("r1", store.tokens?.refreshToken)
        assertEquals("a2", store.tokens?.accessToken)
    }

    @Test
    fun tokensJsonRoundTrip() {
        val original = tokens("r1").copy(scope = "openid")
        assertEquals(original, Tokens.fromJson(original.toJson()))
    }

    @Test
    fun incompleteJsonIsRejected() {
        assertNull(Tokens.fromJson(org.json.JSONObject("""{"accessToken":"a"}""")))
    }

    @Test
    fun schoolUrlMustBeHttps() {
        assertEquals("https://s.example/x", SchoolUrl.normalize("s.example/x/"))
        assertEquals("https://s.example", SchoolUrl.normalize(" https://s.example "))
        assertNull(SchoolUrl.normalize("http://s.example"))
        assertNull(SchoolUrl.normalize(""))
    }
}
