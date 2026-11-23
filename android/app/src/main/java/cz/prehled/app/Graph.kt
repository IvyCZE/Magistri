package cz.prehled.app

import android.content.Context
import cz.prehled.app.auth.HttpLoginEndpoint
import cz.prehled.app.auth.KeystoreTokenStore
import cz.prehled.app.auth.TokenRefresher
import cz.prehled.app.auth.TokenStore
import cz.prehled.app.data.FileSeenStore
import cz.prehled.app.data.FileSnapshotStore
import cz.prehled.app.data.FileStateStore
import cz.prehled.app.data.SeenStore
import cz.prehled.app.data.SnapshotStore
import cz.prehled.app.data.StateStore
import cz.prehled.app.notify.Notifier
import cz.prehled.app.sync.ApiClient
import cz.prehled.app.sync.AttachmentDownloader
import cz.prehled.app.sync.SyncEngine
import java.io.File

/**
 * Process-wide singletons. The plugin and the background worker must share the
 * same TokenRefresher and SyncEngine instances so their locks actually serialise
 * token refreshes and syncs.
 */
object Graph {
    @Volatile private var tokenStore: TokenStore? = null
    @Volatile private var tokenRefresher: TokenRefresher? = null
    @Volatile private var snapshotStore: SnapshotStore? = null
    @Volatile private var seenStore: SeenStore? = null
    @Volatile private var stateStore: StateStore? = null
    @Volatile private var syncEngine: SyncEngine? = null
    @Volatile private var notifier: Notifier? = null

    private fun dir(context: Context) = File(context.applicationContext.filesDir, "prehled")

    fun tokenStore(context: Context): TokenStore = tokenStore ?: synchronized(this) {
        tokenStore ?: KeystoreTokenStore(context.applicationContext).also { tokenStore = it }
    }

    fun tokenRefresher(context: Context): TokenRefresher = tokenRefresher ?: synchronized(this) {
        tokenRefresher ?: TokenRefresher(tokenStore(context), HttpLoginEndpoint()).also { tokenRefresher = it }
    }

    fun snapshotStore(context: Context): SnapshotStore = snapshotStore ?: synchronized(this) {
        snapshotStore ?: FileSnapshotStore(File(dir(context), "snapshot.json")).also { snapshotStore = it }
    }

    fun seenStore(context: Context): SeenStore = seenStore ?: synchronized(this) {
        seenStore ?: FileSeenStore(File(dir(context), "seen.json")).also { seenStore = it }
    }

    fun stateStore(context: Context): StateStore = stateStore ?: synchronized(this) {
        stateStore ?: FileStateStore(File(dir(context), "state.json")).also { stateStore = it }
    }

    fun syncEngine(context: Context): SyncEngine = syncEngine ?: synchronized(this) {
        syncEngine ?: SyncEngine(
            ApiClient(tokenRefresher(context)),
            snapshotStore(context),
            seenStore(context),
            stateStore(context),
        ).also { syncEngine = it }
    }

    fun attachmentDownloader(context: Context): AttachmentDownloader = AttachmentDownloader(tokenRefresher(context))

    fun notifier(context: Context): Notifier = notifier ?: synchronized(this) {
        notifier ?: Notifier(context).also { notifier = it }
    }

    /** Logout: tokens, snapshot, seen ids and pushed data all go. */
    fun clearAll(context: Context) {
        tokenStore(context).clear()
        snapshotStore(context).clear()
        seenStore(context).clear()
        stateStore(context).clear()
    }
}
