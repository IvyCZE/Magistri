package cz.prehled.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface TokenStore {
    fun load(): Tokens?
    fun save(tokens: Tokens)
    fun clear()
}

/**
 * Keeps the tokens encrypted with an AES-GCM key that lives in the Android
 * Keystore. The key never leaves the secure hardware or Keystore process, and
 * the ciphertext sits in app-private preferences that are excluded from backup.
 */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    override fun load(): Tokens? {
        val stored = prefs.getString(KEY_TOKENS, null) ?: return null
        return try {
            val raw = Base64.decode(stored, Base64.NO_WRAP)
            val iv = raw.copyOfRange(0, IV_BYTES)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            val plain = cipher.doFinal(raw, IV_BYTES, raw.size - IV_BYTES)
            Tokens.fromJson(JSONObject(String(plain, Charsets.UTF_8)))
        } catch (e: Exception) {
            // The key can be lost after a restore or a lock screen reset. The
            // session is unrecoverable then, so drop it and make the user sign in.
            prefs.edit().remove(KEY_TOKENS).apply()
            null
        }
    }

    @Synchronized
    override fun save(tokens: Tokens) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(tokens.toJson().toString().toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString(KEY_TOKENS, Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP))
            .apply()
    }

    @Synchronized
    override fun clear() {
        prefs.edit().remove(KEY_TOKENS).apply()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val PREFS = "prehled_secure"
        const val KEY_TOKENS = "tokens"
        const val KEY_ALIAS = "prehled_token_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
