package cz.prehled.app.widget

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import cz.prehled.app.Graph
import cz.prehled.app.MainActivity
import cz.prehled.app.data.SessionState
import java.time.LocalDateTime

/** Reads local state only, so a widget never waits for the network. */
object WidgetData {
    fun inputs(context: Context): WidgetInputs {
        val app = context.applicationContext
        val now = LocalDateTime.now()
        return WidgetInputs(
            snapshot = Graph.snapshotStore(app).load(),
            prefs = Graph.stateStore(app).prefs(),
            signedIn = Graph.tokenStore(app).load() != null,
            sessionExpired = Graph.stateStore(app).sessionState() == SessionState.EXPIRED,
            now = now,
            nowMs = System.currentTimeMillis(),
            testMarks = Graph.stateStore(app).localData().testMarks,
        )
    }

    fun colors(context: Context, input: WidgetInputs): WidgetColors = WidgetTheme.colors(context, input.prefs)

    /** Tap target shared by every widget: `prehled://open/<screen>` handled by the web layer. */
    fun openIntent(context: Context, deepLink: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(deepLink))
            .setClass(context.applicationContext, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
}

object WidgetTheme {
    @Volatile private var palettes: Palettes? = null

    private fun palettes(context: Context): Palettes = palettes ?: synchronized(this) {
        palettes ?: Palettes.parse(context.applicationContext.assets.open("palettes.json").bufferedReader().use { it.readText() })
            .also { palettes = it }
    }

    fun colors(context: Context, prefs: cz.prehled.app.data.Prefs): WidgetColors {
        val systemDark = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val dark = Palettes.isDark(prefs, systemDark)
        val p = palettes(context)
        if (prefs.accent == "dynamic" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val scheme = if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
            val roles = scheme.toRoles().toMutableMap()
            if (dark && prefs.amoled) roles.putAll(p.amoledSurfaces())
            return WidgetColors(roles)
        }
        return p.pick(prefs.accent, dark, prefs.amoled)
    }

    private fun Color.argb() = toArgb()

    private fun ColorScheme.toRoles(): Map<String, Int> = mapOf(
        "primary" to primary.argb(), "onPrimary" to onPrimary.argb(),
        "primaryContainer" to primaryContainer.argb(), "onPrimaryContainer" to onPrimaryContainer.argb(),
        "secondary" to secondary.argb(), "onSecondary" to onSecondary.argb(),
        "secondaryContainer" to secondaryContainer.argb(), "onSecondaryContainer" to onSecondaryContainer.argb(),
        "tertiary" to tertiary.argb(), "onTertiary" to onTertiary.argb(),
        "tertiaryContainer" to tertiaryContainer.argb(), "onTertiaryContainer" to onTertiaryContainer.argb(),
        "error" to error.argb(), "onError" to onError.argb(),
        "errorContainer" to errorContainer.argb(), "onErrorContainer" to onErrorContainer.argb(),
        "surface" to surface.argb(), "onSurface" to onSurface.argb(), "onSurfaceVariant" to onSurfaceVariant.argb(),
        "outline" to outline.argb(), "outlineVariant" to outlineVariant.argb(),
        "surfaceDim" to surfaceDim.argb(), "surfaceBright" to surfaceBright.argb(),
        "surfaceContainerLowest" to surfaceContainerLowest.argb(), "surfaceContainerLow" to surfaceContainerLow.argb(),
        "surfaceContainer" to surfaceContainer.argb(), "surfaceContainerHigh" to surfaceContainerHigh.argb(),
        "surfaceContainerHighest" to surfaceContainerHighest.argb(),
    )
}
