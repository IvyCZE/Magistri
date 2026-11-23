package cz.prehled.app.data

import cz.prehled.app.domain.CountdownMode
import cz.prehled.app.domain.Homework
import cz.prehled.app.domain.TestMark
import cz.prehled.app.sync.arr
import cz.prehled.app.sync.obj
import cz.prehled.app.sync.objects
import cz.prehled.app.sync.str
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Writes through a temp file so a crash never leaves a half-written file behind. */
internal fun File.writeAtomically(text: String) {
    parentFile?.mkdirs()
    val tmp = File(parentFile, "$name.tmp")
    tmp.writeText(text)
    if (!tmp.renameTo(this)) {
        delete()
        check(tmp.renameTo(this)) { "Could not replace $name" }
    }
}

private fun File.readJsonOrNull(): JSONObject? = try {
    if (exists()) JSONObject(readText()) else null
} catch (e: Exception) {
    null
}

interface SnapshotStore {
    fun load(): Snapshot?
    fun save(snapshot: Snapshot)
    fun clear()
}

/** Lives in app-private storage; the manifest disables backup, so it is never copied off the device. */
class FileSnapshotStore(private val file: File) : SnapshotStore {
    @Synchronized
    override fun load(): Snapshot? = file.readJsonOrNull()?.let(SnapshotJson::fromJson)

    @Synchronized
    override fun save(snapshot: Snapshot) = file.writeAtomically(SnapshotJson.toJson(snapshot).toString())

    @Synchronized
    override fun clear() {
        file.delete()
    }
}

enum class SeenCategory(val key: String) {
    MARKS("marks"),
    MESSAGES("messages"),
    // Seed the wider homework list once when upgrading from the default window.
    HOMEWORK("homeworkRange"),
    TIMETABLE("timetable"),
}

/**
 * Remembers which items the user has already been told about. The first sync
 * only fills the sets ("seeding"), so a fresh login never produces a flood of
 * notifications for old items.
 */
interface SeenStore {
    fun isSeeded(category: SeenCategory): Boolean

    /** Returns the ids not seen before and remembers all of them. Nothing is returned while seeding. */
    fun recordAndDiff(category: SeenCategory, ids: List<String>): List<String>
    fun clear()
}

class FileSeenStore(private val file: File, private val cap: Int = DEFAULT_CAP) : SeenStore {
    @Synchronized
    override fun isSeeded(category: SeenCategory): Boolean = file.readJsonOrNull()?.has(category.key) == true

    @Synchronized
    override fun recordAndDiff(category: SeenCategory, ids: List<String>): List<String> {
        val root = file.readJsonOrNull() ?: JSONObject()
        val seeded = root.has(category.key)
        val known = LinkedHashSet<String>()
        root.optJSONArray(category.key)?.let { a -> for (i in 0 until a.length()) known += a.getString(i) }

        val fresh = ids.filter { it.isNotEmpty() && it !in known }.distinct()
        known += fresh
        val kept = known.toList().takeLast(cap)
        root.put(category.key, JSONArray(kept))
        file.writeAtomically(root.toString())
        return if (seeded) fresh else emptyList()
    }

    @Synchronized
    override fun clear() {
        file.delete()
    }

    companion object {
        const val DEFAULT_CAP = 500
    }
}

/** Preferences the web app pushes to native, with defaults for anything it did not send. */
data class Prefs(
    val language: String = "cs",
    val countdownMode: CountdownMode = CountdownMode.LESSON_TIME,
    val countdownHideDecimals: Boolean = false,
    /** Demo sessions never sync; the snapshot stays empty. */
    val demo: Boolean = false,
    val notifyMarks: Boolean = true,
    val notifyMessages: Boolean = true,
    val notifyTimetable: Boolean = true,
    val notifyHomework: Boolean = true,
    /** Nothing is fetched at night, so nothing is notified either. */
    val nightRestEnabled: Boolean = true,
    val nightStartMinutes: Int = 22 * 60,
    val nightEndMinutes: Int = 5 * 60 + 30,
    /** sakura, lavender, ocean, emerald, amber or dynamic. */
    val accent: String = "ocean",
    /** dark, light or system. */
    val themeMode: String = "dark",
    val amoled: Boolean = false,
) {
    companion object {
        private fun minutes(o: JSONObject, key: String, default: Int): Int {
            val v = o.optInt(key, default)
            return if (v in 0 until 24 * 60) v else default
        }

        fun fromJson(o: JSONObject?): Prefs {
            if (o == null) return Prefs()
            return Prefs(
                language = if (o.str("language") == "en") "en" else "cs",
                countdownMode = CountdownMode.fromKey(o.str("countdownMode")),
                countdownHideDecimals = o.optBoolean("countdownHideDecimals", false),
                demo = o.optBoolean("demo", false),
                notifyMarks = o.optBoolean("notifyMarks", true),
                notifyMessages = o.optBoolean("notifyMessages", true),
                notifyTimetable = o.optBoolean("notifyTimetable", true),
                notifyHomework = o.optBoolean("notifyHomework", true),
                nightRestEnabled = o.optBoolean("nightRestEnabled", true),
                nightStartMinutes = minutes(o, "nightStartMinutes", 22 * 60),
                nightEndMinutes = minutes(o, "nightEndMinutes", 5 * 60 + 30),
                accent = o.str("accent").ifEmpty { "ocean" },
                themeMode = o.str("themeMode").takeIf { it == "light" || it == "system" } ?: "dark",
                amoled = o.optBoolean("amoled", false),
            )
        }
    }
}

/** Data that only exists in the web app and has to be merged into the snapshot. */
data class LocalData(
    val customHomework: List<Homework> = emptyList(),
    /** The user's own ticks on server homework, by id. */
    val homeworkDone: Map<String, Boolean> = emptyMap(),
    val testMarks: List<TestMark> = emptyList(),
) {
    companion object {
        fun fromJson(o: JSONObject?): LocalData {
            if (o == null) return LocalData()
            val done = o.obj("homeworkDone")?.let { d -> d.keys().asSequence().associateWith { d.optBoolean(it) } } ?: emptyMap()
            val custom = o.arr("customHomework").objects().map {
                Homework(it.str("id"), it.str("subjectAbbrev"), it.str("subjectName"), it.str("content"), it.str("date"), it.str("deadline"), it.optBoolean("done"))
            }
            val marks = o.arr("testMarks").objects().mapNotNull {
                val date = it.str("date").take(10)
                val hourId = it.optInt("hourId", -1)
                if (date.isEmpty() || hourId < 0) null else TestMark(date, hourId, it.str("description"))
            }
            return LocalData(custom, done, marks)
        }
    }
}

enum class SessionState { OK, EXPIRED }

interface StateStore {
    fun prefs(): Prefs
    fun setPrefs(json: JSONObject)
    fun localData(): LocalData
    fun setLocalData(json: JSONObject)
    fun sessionState(): SessionState
    fun setSessionState(state: SessionState)

    /** True once per expired session: the "sign in again" notice must not repeat. */
    fun claimExpiredNotice(): Boolean
    fun clear()
}

class FileStateStore(private val file: File) : StateStore {
    private fun read(): JSONObject = file.readJsonOrNull() ?: JSONObject()
    private fun write(o: JSONObject) = file.writeAtomically(o.toString())

    @Synchronized
    override fun prefs() = Prefs.fromJson(read().obj("prefs"))

    @Synchronized
    override fun setPrefs(json: JSONObject) = write(read().put("prefs", json))

    @Synchronized
    override fun localData() = LocalData.fromJson(read().obj("localData"))

    @Synchronized
    override fun setLocalData(json: JSONObject) = write(read().put("localData", json))

    @Synchronized
    override fun sessionState() = if (read().optBoolean("sessionExpired")) SessionState.EXPIRED else SessionState.OK

    @Synchronized
    override fun setSessionState(state: SessionState) {
        val o = read()
        val expired = state == SessionState.EXPIRED
        if (o.optBoolean("sessionExpired") == expired) return
        o.put("sessionExpired", expired)
        if (!expired) o.put("expiredNoticeSent", false)
        write(o)
    }

    @Synchronized
    override fun claimExpiredNotice(): Boolean {
        val o = read()
        if (!o.optBoolean("sessionExpired") || o.optBoolean("expiredNoticeSent")) return false
        write(o.put("expiredNoticeSent", true))
        return true
    }

    @Synchronized
    override fun clear() {
        file.delete()
    }
}
