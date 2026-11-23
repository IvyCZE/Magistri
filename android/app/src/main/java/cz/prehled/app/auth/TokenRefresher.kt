package cz.prehled.app.auth

sealed interface RefreshResult {
    data class Success(val tokens: Tokens) : RefreshResult
    data object NoSession : RefreshResult
    data object Rejected : RefreshResult
    data object Unavailable : RefreshResult
}

/**
 * The only place that talks to the token endpoint. The WebView and the
 * background worker both call it, so one lock covers both.
 *
 * Bakaláři rotates the refresh token. If two callers redeemed the same token,
 * one of them could end up holding a dead pair, so a caller passes the refresh
 * token it knows and gets the stored pair back when someone else already
 * refreshed it.
 */
class TokenRefresher(
    private val store: TokenStore,
    private val endpoint: LoginEndpoint,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val lock = Any()

    fun refresh(knownRefreshToken: String?): RefreshResult = synchronized(lock) {
        val current = store.load() ?: return RefreshResult.NoSession
        if (knownRefreshToken != null && knownRefreshToken != current.refreshToken) {
            return RefreshResult.Success(current)
        }
        when (val response = endpoint.refresh(current.schoolUrl, current.refreshToken)) {
            is RefreshResponse.Issued -> {
                val updated = current.copy(
                    accessToken = response.accessToken,
                    refreshToken = response.refreshToken ?: current.refreshToken,
                    expiresIn = response.expiresIn,
                    tokenType = response.tokenType ?: current.tokenType,
                    scope = response.scope ?: current.scope,
                    obtainedAt = clock(),
                )
                store.save(updated)
                RefreshResult.Success(updated)
            }
            RefreshResponse.Rejected -> RefreshResult.Rejected
            RefreshResponse.Unavailable -> RefreshResult.Unavailable
        }
    }

    /** Returns tokens whose access token is valid for at least a minute, refreshing when needed. */
    fun validTokens(): RefreshResult = synchronized(lock) {
        val current = store.load() ?: return RefreshResult.NoSession
        if (!current.isExpired(clock())) return RefreshResult.Success(current)
        refresh(current.refreshToken)
    }
}
