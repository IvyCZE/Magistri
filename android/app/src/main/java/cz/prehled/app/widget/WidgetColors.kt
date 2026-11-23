package cz.prehled.app.widget

import cz.prehled.app.data.Prefs
import org.json.JSONObject

/** Material 3 colour roles by name (`primary`, `surfaceContainer`, ...) as ARGB ints. */
class WidgetColors(private val roles: Map<String, Int>) {
    operator fun get(role: String): Int = roles[role] ?: error("Missing colour role $role")

    fun toMap(): Map<String, Int> = roles
}

/**
 * Static accent palettes exported from `src/index.css` by `scripts/export-palettes.js`,
 * so the widgets look like the web UI without a second copy of the colours.
 */
class Palettes(private val accents: Map<String, Map<String, Map<String, Int>>>) {
    fun pick(accent: String, dark: Boolean, amoled: Boolean): WidgetColors {
        // "dynamic" without a wallpaper palette falls back to the default accent, like the web app.
        val palette = accents[accent] ?: accents.getValue(DEFAULT_ACCENT)
        val variant = if (!dark) "light" else if (amoled) "amoled" else "dark"
        return WidgetColors(palette.getValue(variant))
    }

    /** Surfaces the app uses in AMOLED mode, which also apply on top of a wallpaper palette. */
    fun amoledSurfaces(): Map<String, Int> {
        val dark = accents.getValue(DEFAULT_ACCENT).getValue("dark")
        val amoled = accents.getValue(DEFAULT_ACCENT).getValue("amoled")
        return amoled.filter { (k, v) -> dark[k] != v }
    }

    companion object {
        const val DEFAULT_ACCENT = "ocean"

        fun parse(json: String): Palettes {
            val root = JSONObject(json)
            val accents = root.keys().asSequence().associateWith { accent ->
                val variants = root.getJSONObject(accent)
                variants.keys().asSequence().associateWith { variant ->
                    val roles = variants.getJSONObject(variant)
                    roles.keys().asSequence().associateWith { role -> hexToArgb(roles.getString(role)) }
                }
            }
            return Palettes(accents)
        }

        private fun hexToArgb(hex: String): Int = (0xFF000000L or hex.removePrefix("#").toLong(16)).toInt()

        fun isDark(prefs: Prefs, systemDark: Boolean): Boolean = when (prefs.themeMode) {
            "light" -> false
            "system" -> systemDark
            else -> true
        }
    }
}
