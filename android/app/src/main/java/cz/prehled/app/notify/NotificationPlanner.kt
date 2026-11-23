package cz.prehled.app.notify

import cz.prehled.app.BuildConfig
import cz.prehled.app.data.Prefs
import cz.prehled.app.domain.Homework
import cz.prehled.app.domain.Mark
import cz.prehled.app.domain.Message
import cz.prehled.app.sync.NewItems
import cz.prehled.app.sync.TimetableChange
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime

enum class NotifyCategory(val channelId: String) {
    MARKS("marks"),
    MESSAGES("messages"),
    TIMETABLE("timetable"),
    HOMEWORK("homework"),
    ACCOUNT("account"),
}

/** Everything needed to show one notification, with no Android types so it can be unit tested. */
data class NotificationSpec(
    val category: NotifyCategory,
    val title: String,
    val text: String,
    /** One line per item when several are grouped; empty for a single item. */
    val lines: List<String>,
    /** `prehled://open/<screen>?id=<id>`, handled by the web layer. */
    val deepLink: String,
)

object DeepLinks {
    fun open(screen: String, id: String? = null): String =
        "prehled://open/$screen" + if (id.isNullOrEmpty()) "" else "?id=${URLEncoder.encode(id, "UTF-8")}"
}

private class Strings(val cs: Boolean) {
    fun pick(czech: String, english: String) = if (cs) czech else english
}

/** Turns the items a sync found into notifications. Grouping and wording live here. */
object NotificationPlanner {
    private const val MAX_LINES = 5
    private const val MAX_TEXT = 140

    fun plan(items: NewItems, prefs: Prefs, now: LocalDateTime): List<NotificationSpec> {
        val s = Strings(prefs.language != "en")
        val out = ArrayList<NotificationSpec>()
        if (prefs.notifyMessages && items.messages.isNotEmpty()) out += messages(items.messages, s)
        if (prefs.notifyMarks && items.marks.isNotEmpty()) out += marks(items.marks, s)
        if (prefs.notifyTimetable && items.timetableChanges.isNotEmpty()) out += timetable(items.timetableChanges, s, now.toLocalDate())
        if (prefs.notifyHomework && items.homework.isNotEmpty()) out += homework(items.homework, s)
        return out
    }

    fun sessionExpired(prefs: Prefs, now: LocalDateTime): NotificationSpec {
        val s = Strings(prefs.language != "en")
        return NotificationSpec(
            NotifyCategory.ACCOUNT,
            s.pick("Přihlaste se znovu", "Sign in again"),
            s.pick("Aplikace ${BuildConfig.APP_NAME} se nemůže spojit se školou. Otevřete ji a přihlaste se.", "The ${BuildConfig.APP_NAME} app can no longer reach your school. Open it and sign in."),
            emptyList(),
            DeepLinks.open("home"),
        )
    }

    private fun marks(list: List<Mark>, s: Strings): NotificationSpec {
        fun subject(m: Mark) = m.subjectName.ifEmpty { m.subjectAbbrev }
        fun detail(m: Mark) = "${m.markText} · ${s.pick("váha", "weight")} ${m.weight}"
        return if (list.size == 1) {
            val m = list[0]
            NotificationSpec(NotifyCategory.MARKS, s.pick("Nová známka: ", "New mark: ") + subject(m), detail(m), emptyList(), DeepLinks.open("marks"))
        } else {
            val lines = list.map { "${subject(it)}: ${it.markText}" }
            NotificationSpec(NotifyCategory.MARKS, s.pick("Nové známky (${list.size})", "New marks (${list.size})"), lines.take(MAX_LINES).joinToString(", "), lines, DeepLinks.open("marks"))
        }
    }

    private fun messages(list: List<Message>, s: Strings): NotificationSpec {
        if (list.size == 1) {
            val m = list[0]
            val title = if (m.senderName.isEmpty()) s.pick("Nová zpráva", "New message") else s.pick("Nová zpráva od ", "New message from ") + m.senderName
            // The noticeboard has no detail page opened by id, so only received messages deep-link to one.
            val link = if (m.type == "received") DeepLinks.open("message-detail", m.id) else DeepLinks.open("messages")
            return NotificationSpec(NotifyCategory.MESSAGES, title, clip(m.title), emptyList(), link)
        }
        val lines = list.map { m -> if (m.senderName.isEmpty()) m.title else "${m.senderName}: ${m.title}" }
        return NotificationSpec(NotifyCategory.MESSAGES, s.pick("Nové zprávy (${list.size})", "New messages (${list.size})"), clip(lines.take(MAX_LINES).joinToString(", ")), lines, DeepLinks.open("messages"))
    }

    private fun homework(list: List<Homework>, s: Strings): NotificationSpec {
        fun subject(h: Homework) = h.subjectName.ifEmpty { h.subjectAbbrev }
        fun deadline(h: Homework): String = formatDate(h.deadline)?.let { " (${s.pick("do", "due")} $it)" } ?: ""
        return if (list.size == 1) {
            val h = list[0]
            NotificationSpec(NotifyCategory.HOMEWORK, s.pick("Nový úkol: ", "New homework: ") + subject(h), clip(h.content) + deadline(h), emptyList(), DeepLinks.open("homework"))
        } else {
            val lines = list.map { subject(it) + deadline(it) }
            NotificationSpec(NotifyCategory.HOMEWORK, s.pick("Nové úkoly (${list.size})", "New homework (${list.size})"), clip(lines.take(MAX_LINES).joinToString(", ")), lines, DeepLinks.open("homework"))
        }
    }

    private fun timetable(list: List<TimetableChange>, s: Strings, today: LocalDate): NotificationSpec {
        val day = list.first().date.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val dayLabel = when (day) {
            null -> ""
            today -> s.pick("dnes", "today")
            today.plusDays(1) -> s.pick("zítra", "tomorrow")
            else -> "${day.dayOfMonth}. ${day.monthValue}."
        }
        val lines = list.map { line(it, s) }
        val title = s.pick("Změny v rozvrhu", "Timetable changes") + if (dayLabel.isEmpty()) "" else " ($dayLabel)"
        val text = if (list.size == 1) lines[0] else clip(lines.take(MAX_LINES).joinToString(", "))
        return NotificationSpec(NotifyCategory.TIMETABLE, title, text, if (list.size == 1) emptyList() else lines, DeepLinks.open("timetable"))
    }

    private fun line(c: TimetableChange, s: Strings): String {
        val lesson = c.lesson
        val subject = lesson.subjectAbbrev.ifEmpty { lesson.subjectName }
        val prefix = if (c.hourCaption.isEmpty()) "" else "${c.hourCaption}. "
        val what = when (lesson.change?.type) {
            "Canceled", "Removed" -> s.pick("odpadá", "cancelled")
            "Added" -> s.pick("přidáno", "added")
            "RoomChanged" -> s.pick("změna učebny", "room change") + if (lesson.roomAbbrev.isEmpty()) "" else " → ${lesson.roomAbbrev}"
            "Substitution" -> s.pick("suplování", "substitution") + (lesson.change?.substituteTeacher?.takeIf { it.isNotEmpty() }?.let { " ($it)" } ?: "")
            else -> lesson.change?.typeName?.takeIf { it.isNotEmpty() } ?: s.pick("změna", "change")
        }
        return "$prefix$subject: $what"
    }

    private fun clip(text: String): String {
        val one = text.trim().replace(Regex("\\s+"), " ")
        return if (one.length <= MAX_TEXT) one else one.take(MAX_TEXT - 1).trimEnd() + "…"
    }

    /** `2026-10-09T00:00:00+0200` or `2026-10-09` become `9. 10.`. */
    private fun formatDate(raw: String): String? {
        if (raw.length < 10) return null
        return runCatching { LocalDate.parse(raw.substring(0, 10)) }.getOrNull()?.let { "${it.dayOfMonth}. ${it.monthValue}." }
    }
}
