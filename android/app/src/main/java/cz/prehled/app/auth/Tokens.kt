package cz.prehled.app.auth

import org.json.JSONObject

/** Mirrors `AuthTokens` in src/types/bakalari.ts. */
data class Tokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
    val tokenType: String,
    val scope: String?,
    val userId: String,
    val schoolUrl: String,
    val obtainedAt: Long,
) {
    fun isExpired(now: Long, marginMs: Long = EXPIRY_MARGIN_MS): Boolean =
        now >= obtainedAt + expiresIn * 1000 - marginMs

    fun toJson(): JSONObject = JSONObject().apply {
        put("accessToken", accessToken)
        put("refreshToken", refreshToken)
        put("expiresIn", expiresIn)
        put("tokenType", tokenType)
        if (scope != null) put("scope", scope)
        put("userId", userId)
        put("schoolUrl", schoolUrl)
        put("obtainedAt", obtainedAt)
    }

    companion object {
        const val EXPIRY_MARGIN_MS = 60_000L

        fun fromJson(json: JSONObject): Tokens? {
            val access = json.optString("accessToken")
            val refresh = json.optString("refreshToken")
            val school = json.optString("schoolUrl")
            if (access.isEmpty() || refresh.isEmpty() || school.isEmpty()) return null
            return Tokens(
                accessToken = access,
                refreshToken = refresh,
                expiresIn = json.optLong("expiresIn", 3600),
                tokenType = json.optString("tokenType", "Bearer"),
                scope = json.optString("scope").ifEmpty { null },
                userId = json.optString("userId"),
                schoolUrl = school,
                obtainedAt = json.optLong("obtainedAt", 0),
            )
        }
    }
}
