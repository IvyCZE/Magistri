package cz.prehled.app.widget

import cz.prehled.app.data.Prefs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PalettesTest {
    private val palettes = Palettes.parse(File("src/main/assets/palettes.json").readText())

    @Test
    fun picksTheOceanDarkSurfaceFromTheExportedCss() {
        assertEquals(0xFF0E1417.toInt(), palettes.pick("ocean", dark = true, amoled = false)["surface"])
        assertEquals(0xFF78D2F5.toInt(), palettes.pick("ocean", dark = true, amoled = false)["primary"])
    }

    @Test
    fun amoledOnlyAppliesInDarkMode() {
        assertEquals(0xFF000000.toInt(), palettes.pick("ocean", dark = true, amoled = true)["surface"])
        assertEquals(0xFFF7FBFD.toInt(), palettes.pick("ocean", dark = false, amoled = true)["surface"])
    }

    @Test
    fun unknownAndDynamicAccentsFallBackToOcean() {
        assertEquals(palettes.pick("ocean", true, false)["primary"], palettes.pick("dynamic", true, false)["primary"])
        assertEquals(palettes.pick("ocean", false, false)["primary"], palettes.pick("nope", false, false)["primary"])
    }

    @Test
    fun everyAccentHasEveryRoleInEveryVariant() {
        val roles = palettes.pick("ocean", false, false).toMap().keys
        for (accent in listOf("sakura", "lavender", "ocean", "emerald", "amber")) {
            for (dark in listOf(false, true)) for (amoled in listOf(false, true)) {
                assertEquals("$accent $dark $amoled", roles, palettes.pick(accent, dark, amoled).toMap().keys)
            }
        }
    }

    @Test
    fun amoledSurfacesAreTheOnesTheCssOverrides() {
        val s = palettes.amoledSurfaces()
        assertEquals(0xFF000000.toInt(), s["surface"])
        assertTrue("surfaceContainer" in s.keys)
        assertFalse("primary" in s.keys)
    }

    @Test
    fun themeModeResolution() {
        assertTrue(Palettes.isDark(Prefs(themeMode = "dark"), systemDark = false))
        assertFalse(Palettes.isDark(Prefs(themeMode = "light"), systemDark = true))
        assertTrue(Palettes.isDark(Prefs(themeMode = "system"), systemDark = true))
        assertFalse(Palettes.isDark(Prefs(themeMode = "system"), systemDark = false))
    }
}
