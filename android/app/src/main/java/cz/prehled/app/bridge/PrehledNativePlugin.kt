package cz.prehled.app.bridge

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import cz.prehled.app.Graph
import cz.prehled.app.auth.RefreshResult
import cz.prehled.app.data.SessionState
import cz.prehled.app.auth.Tokens
import cz.prehled.app.sync.AttachmentFiles
import cz.prehled.app.sync.DownloadResult
import cz.prehled.app.sync.SyncOutcome
import cz.prehled.app.sync.SyncScheduler
import cz.prehled.app.widget.WidgetUpdater
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

@CapacitorPlugin(
    name = "PrehledNative",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class PrehledNativePlugin : Plugin() {

    override fun load() {
        Graph.notifier(context).ensureChannels(Graph.stateStore(context).prefs().language)
    }

    @PluginMethod
    fun getDynamicPalette(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("supported", false)
            call.resolve(result)
            return
        }
        // Resolved on the UI context so the palette follows the current wallpaper.
        val context = activity ?: context
        result.put("supported", true)
        result.put("light", dynamicLightColorScheme(context).toJs())
        result.put("dark", dynamicDarkColorScheme(context).toJs())
        call.resolve(result)
    }

    /**
     * Paints the window and the WebView background with the app surface colour. With the system bars
     * transparent (edge-to-edge) this is what shows behind them, under the keyboard and while the
     * WebView overscrolls, and it would otherwise stay at the build-time colour whatever the theme.
     */
    @PluginMethod
    fun setWindowBackground(call: PluginCall) {
        val color = try {
            android.graphics.Color.parseColor(call.getString("color"))
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid color")
            return
        } catch (e: NullPointerException) {
            call.reject("Missing color")
            return
        }
        val host = activity
        if (host == null) {
            call.resolve()
            return
        }
        host.runOnUiThread {
            host.window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(color))
            bridge.webView.setBackgroundColor(color)
            call.resolve()
        }
    }

    /** Which launcher icon is active: "default" or "classic" (the logo without the coloured shape). */
    @PluginMethod
    fun getAppIcon(call: PluginCall) {
        val classicEnabled = context.packageManager.getComponentEnabledSetting(iconComponent(ICON_CLASSIC)) ==
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        call.resolve(JSObject().put("icon", if (classicEnabled) "classic" else "default"))
    }

    /** Enables the launcher alias of the chosen icon and disables the other one. */
    @PluginMethod
    fun setAppIcon(call: PluginCall) {
        val chosen = when (call.getString("icon")) {
            "default" -> ICON_DEFAULT
            "classic" -> ICON_CLASSIC
            else -> {
                call.reject("Unknown icon")
                return
            }
        }
        val other = if (chosen == ICON_DEFAULT) ICON_CLASSIC else ICON_DEFAULT
        val packages = context.packageManager
        // The new entry goes first so the launcher never has no entry for the app.
        packages.setComponentEnabledSetting(iconComponent(chosen), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        packages.setComponentEnabledSetting(iconComponent(other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        call.resolve()
    }

    private fun iconComponent(alias: String) = ComponentName(context, alias)

    @PluginMethod
    fun getTokens(call: PluginCall) {
        call.resolve(tokensResult(Graph.tokenStore(context).load()))
    }

    @PluginMethod
    fun setTokens(call: PluginCall) {
        val tokens = call.getObject("tokens")?.let { Tokens.fromJson(it) }
        if (tokens == null) {
            call.reject("Invalid tokens")
            return
        }
        Graph.tokenStore(context).save(tokens)
        // A fresh login (or a refreshed pair) starts the background sync.
        Graph.stateStore(context).setSessionState(SessionState.OK)
        SyncScheduler.schedule(context)
        WidgetUpdater.refreshAsync(context)
        call.resolve()
    }

    @PluginMethod
    fun clearTokens(call: PluginCall) {
        clearEverything()
        call.resolve()
    }

    @PluginMethod
    fun clearAll(call: PluginCall) {
        clearEverything()
        call.resolve()
    }

    @PluginMethod
    fun setPreferences(call: PluginCall) {
        val prefs = call.getObject("prefs")
        if (prefs == null) {
            call.reject("Missing prefs")
            return
        }
        val store = Graph.stateStore(context)
        store.setPrefs(prefs)
        Graph.notifier(context).ensureChannels(store.prefs().language)
        WidgetUpdater.refreshAsync(context)
        call.resolve()
    }

    @PluginMethod
    fun setLocalData(call: PluginCall) {
        val data = call.getObject("data")
        if (data == null) {
            call.reject("Missing data")
            return
        }
        Graph.stateStore(context).setLocalData(data)
        WidgetUpdater.refreshAsync(context)
        call.resolve()
    }

    /** Runs a sync now (used on app start, resume and pull-to-refresh) and reports how it went. */
    @PluginMethod
    fun syncNow(call: PluginCall) {
        val outcome = Graph.syncEngine(context).sync(force = true)
        // Keeps the background sync running after an app update or a reinstall of the schedule.
        if (outcome !is SyncOutcome.SessionExpired && Graph.tokenStore(context).load() != null) SyncScheduler.schedule(context)
        WidgetUpdater.refreshAsync(context)
        call.resolve(JSObject().put("status", when (outcome) {
            is SyncOutcome.Updated -> if (outcome.partial) "partial" else "updated"
            is SyncOutcome.Skipped -> "skipped"
            SyncOutcome.SessionExpired -> "expired"
            SyncOutcome.Failed -> "failed"
        }))
    }

    @PluginMethod
    fun getNotificationStatus(call: PluginCall) {
        call.resolve(notificationStatus())
    }

    /** Shows the Android 13+ permission dialog; older versions have nothing to ask. */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            call.resolve(notificationStatus())
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult")
    }

    @PermissionCallback
    private fun notificationPermissionResult(call: PluginCall) {
        call.resolve(notificationStatus())
    }

    /** Opens the Android settings page for notifications or battery optimisation. */
    @PluginMethod
    @android.annotation.SuppressLint("InlinedApi")
    fun openSystemSettings(call: PluginCall) {
        val intent = when (call.getString("target")) {
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            else -> {
                call.reject("Unknown target")
                return
            }
        }
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        for (candidate in listOf(intent, fallback)) {
            try {
                (activity ?: context).startActivity(candidate.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                call.resolve()
                return
            } catch (e: Exception) {
                // Some devices lack the specific page; the app details page is the fallback.
            }
        }
        call.reject("No settings page available")
    }

    private fun notificationStatus(): JSObject = JSObject()
        .put("enabled", Graph.notifier(context).canPost())
        .put("runtimePermission", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)

    private fun clearEverything() {
        SyncScheduler.cancel(context)
        Graph.clearAll(context)
        AttachmentSaver(context).clearCache()
        WidgetUpdater.refreshAsync(context)
    }

    /**
     * Downloads a message or homework attachment with the stored tokens, saves it (Downloads folder on
     * Android 10+) and offers it to an app that can open it. Resolves `opened` or `saved`; rejects with
     * SESSION_EXPIRED, NOT_FOUND or FAILED.
     */
    @PluginMethod
    fun downloadAttachment(call: PluginCall) {
        val id = call.getString("id")?.takeIf { it.isNotBlank() && it.length <= MAX_ATTACHMENT_ID }
        if (id == null) {
            call.reject("Invalid attachment", "FAILED")
            return
        }
        val fileName = AttachmentFiles.safeFileName(call.getString("name"))
        val mimeType = AttachmentFiles.mimeTypeFor(fileName)
        val saver = AttachmentSaver(context)
        var pending: AttachmentSaver.Pending? = null

        val result = try {
            Graph.attachmentDownloader(context).download(id) {
                saver.create(fileName, mimeType).also { pending = it }.stream
            }
        } catch (e: Exception) {
            // Storage trouble while creating or writing the file.
            DownloadResult.Failure
        }

        val file = pending
        if (result !is DownloadResult.Done || file == null) {
            file?.let { saver.discard(it) }
            when (result) {
                DownloadResult.SessionExpired -> call.reject("Session expired", "SESSION_EXPIRED")
                DownloadResult.NotFound -> call.reject("Attachment not found", "NOT_FOUND")
                else -> call.reject("Download failed", "FAILED")
            }
            return
        }

        val uri = saver.finish(file)
        val opened = mimeType != null && openFile(uri, mimeType)
        call.resolve(JSObject().put("status", if (opened) "opened" else "saved").put("publicDownload", file.publicDownload))
    }

    private fun openFile(uri: Uri, mimeType: String): Boolean {
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, mimeType)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            (activity ?: context).startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    @PluginMethod
    fun refreshTokens(call: PluginCall) {
        val result = Graph.tokenRefresher(context).refresh(call.getString("refreshToken"))
        // "Rejected" is the server refusing the token for good (password changed); Unavailable may pass.
        val rejected = result == RefreshResult.Rejected || result == RefreshResult.NoSession
        call.resolve(tokensResult((result as? RefreshResult.Success)?.tokens).put("rejected", rejected))
    }

    private fun tokensResult(tokens: Tokens?): JSObject =
        JSObject().put("tokens", tokens?.toJson() ?: JSONObject.NULL)

    private companion object {
        const val MAX_ATTACHMENT_ID = 512
        const val ICON_DEFAULT = "cz.prehled.app.IconDefault"
        const val ICON_CLASSIC = "cz.prehled.app.IconClassic"
    }

    private fun Color.hex(): String = String.format("#%06X", toArgb() and 0xFFFFFF)

    // Keys are the Material 3 role names. The web layer maps them to --m3-* variables.
    private fun ColorScheme.toJs(): JSObject = JSObject().apply {
        put("primary", primary.hex())
        put("onPrimary", onPrimary.hex())
        put("primaryContainer", primaryContainer.hex())
        put("onPrimaryContainer", onPrimaryContainer.hex())
        put("secondary", secondary.hex())
        put("onSecondary", onSecondary.hex())
        put("secondaryContainer", secondaryContainer.hex())
        put("onSecondaryContainer", onSecondaryContainer.hex())
        put("tertiary", tertiary.hex())
        put("onTertiary", onTertiary.hex())
        put("tertiaryContainer", tertiaryContainer.hex())
        put("onTertiaryContainer", onTertiaryContainer.hex())
        put("error", error.hex())
        put("onError", onError.hex())
        put("errorContainer", errorContainer.hex())
        put("onErrorContainer", onErrorContainer.hex())
        put("surface", surface.hex())
        put("onSurface", onSurface.hex())
        put("onSurfaceVariant", onSurfaceVariant.hex())
        put("outline", outline.hex())
        put("outlineVariant", outlineVariant.hex())
        put("surfaceDim", surfaceDim.hex())
        put("surfaceBright", surfaceBright.hex())
        put("surfaceContainerLowest", surfaceContainerLowest.hex())
        put("surfaceContainerLow", surfaceContainerLow.hex())
        put("surfaceContainer", surfaceContainer.hex())
        put("surfaceContainerHigh", surfaceContainerHigh.hex())
        put("surfaceContainerHighest", surfaceContainerHighest.hex())
    }
}
