package cz.prehled.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.LocalContext
import androidx.glance.currentState
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import cz.prehled.app.notify.DeepLinks
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal suspend fun load(context: Context): Pair<WidgetInputs, WidgetColors> = withContext(Dispatchers.IO) {
    loadNow(context)
}

private fun loadNow(context: Context): Pair<WidgetInputs, WidgetColors> {
    val input = WidgetData.inputs(context)
    return input to WidgetData.colors(context, input)
}

/** Bumped by [WidgetUpdater] on every refresh; the only thing that makes a running Glance session read the data again. */
internal val REVISION = longPreferencesKey("revision")

/**
 * Glance does not call `provideGlance` again while a widget's session is still running (it stays
 * alive for a while after each draw); it only recomposes. Data read once up front would then
 * show stale until the session ends, so the content reloads whenever the revision changes.
 */
internal suspend fun provideLive(
    context: Context,
    widget: GlanceAppWidget,
    content: @Composable (WidgetInputs, WidgetColors) -> Unit,
) {
    val first = load(context)
    widget.provideContent {
        val revision = currentState<Preferences>()[REVISION]
        val startRevision = remember { revision }
        val data = remember(revision) { if (revision == startRevision) first else loadNow(context) }
        content(data.first, data.second)
    }
}

internal fun WidgetColors.isDarkSurface(): Boolean {
    val c = this["surface"]
    return 0.299 * ((c shr 16) and 0xFF) + 0.587 * ((c shr 8) and 0xFF) + 0.114 * (c and 0xFF) < 128
}

/** Keeps the boundary alarm in step with the widgets that exist. */
abstract class PrehledGlanceReceiver : androidx.glance.appwidget.GlanceAppWidgetReceiver() {
    override fun onUpdate(context: Context, appWidgetManager: android.appwidget.AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetUpdater.ensureAlarm(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetUpdater.ensureAlarm(context)
    }
}

// ---------------------------------------------------------------- Timetable

class TimetableWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideLive(context, this) { input, colors -> TimetableContent(input, colors) }
    }
}

class TimetableWidgetReceiver : PrehledGlanceReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TimetableWidget()
}

/** What the list shows: a lesson, the "you are here" line drawn during a break, or the heading of a later day. */
private sealed interface TimetableItem {
    data class Lesson(val row: LessonRow) : TimetableItem
    data object NowLine : TimetableItem
    data class DayHeader(val label: String, val detail: String) : TimetableItem
    data class Holiday(val title: String, val badge: String?) : TimetableItem
    data class Empty(val text: String) : TimetableItem
}

private const val LIST_ROW_HEIGHT = 44
private const val NOW_LINE_HEIGHT = 7
private const val DAY_HEADER_HEIGHT = 34

private fun MutableList<TimetableItem>.addDay(day: TimetableModel) {
    when {
        day.holidayTitle != null -> add(TimetableItem.Holiday(day.holidayTitle, day.holidayBadge))
        day.lessons.isEmpty() -> add(TimetableItem.Empty(day.emptyText.orEmpty()))
        else -> day.lessons.forEachIndexed { index, row ->
            if (index == day.breakBeforeLesson) add(TimetableItem.NowLine)
            add(TimetableItem.Lesson(row))
        }
    }
}

@Composable
private fun TimetableContent(input: WidgetInputs, colors: WidgetColors) {
    val model = TimetableModel.build(input)
    val title = model.dayLabel.ifEmpty { input.text.pick("Rozvrh", "Timetable") }
    val subtitle = listOfNotNull(model.dateText.takeIf { it.isNotEmpty() }, model.permanentBadge).joinToString(" · ").ifEmpty { null }
    WidgetShell(input, colors, title, subtitle, "prehled://open/timetable", section = "timetableActual") {
        if (model.emptyText != null && model.followingDays.isEmpty()) {
            StatusText(model.emptyText, colors)
        } else {
            val items = buildList {
                addDay(model)
                model.followingDays.forEach { day ->
                    val detail = listOfNotNull(day.dateText.takeIf { it.isNotEmpty() }, day.permanentBadge).joinToString(" · ")
                    add(TimetableItem.DayHeader(day.dayLabel, detail))
                    addDay(day)
                }
            }
            RowList(items) { item ->
                when (item) {
                    is TimetableItem.Lesson -> LessonRowView(item.row, colors, LIST_ROW_HEIGHT.dp)
                    TimetableItem.NowLine -> NowLine(colors)
                    is TimetableItem.DayHeader -> DayHeader(item, colors)
                    is TimetableItem.Holiday -> Box(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp)) { HolidayCard(item.title, item.badge, colors) }
                    is TimetableItem.Empty -> StatusText(item.text, colors)
                }
            }
        }
    }
}

@Composable
private fun DayHeader(item: TimetableItem.DayHeader, colors: WidgetColors) {
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(DAY_HEADER_HEIGHT.dp).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(item.label, style = textStyle(colors.cp("primary"), 14, bold = true), maxLines = 1)
        if (item.detail.isNotEmpty()) {
            RowSpacer(8.dp)
            Text(item.detail, style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1)
        }
    }
}

@Composable
private fun NowLine(colors: WidgetColors) {
    Box(modifier = GlanceModifier.fillMaxWidth().height(NOW_LINE_HEIGHT.dp).padding(vertical = 2.dp)) {
        Box(modifier = GlanceModifier.fillMaxSize().background(colors.cp("primary")).cornerRadius(2.dp)) {}
    }
}

@Composable
internal fun HolidayCard(title: String, badge: String?, colors: WidgetColors) {
    Column(
        modifier = GlanceModifier.fillMaxWidth().background(colors.cp("tertiaryContainer")).cornerRadius(16.dp).padding(12.dp),
    ) {
        Text(title, style = textStyle(colors.cp("onTertiaryContainer"), 15, bold = true), maxLines = 2)
        if (!badge.isNullOrEmpty()) Text(badge, style = textStyle(colors.cp("onTertiaryContainer"), 11), maxLines = 1)
    }
}

/**
 * Every lesson is a card of its own. A part the change touches (room, teacher, an added
 * subject) is a chip in the theme colour; on the current lesson, whose card already is the
 * theme colour, the chip is inverted.
 */
@Composable
private fun LessonRowView(row: LessonRow, colors: WidgetColors, height: Dp) {
    val canceled = row.badgeKind == ChangeKind.CANCELED
    val current = row.isCurrent
    val onBg = if (current) colors.cp("onPrimary") else colors.cp("onSurface")
    val muted = if (current) colors.cp("onPrimary") else colors.cp("onSurfaceVariant")
    val hourColor = if (current) colors.cp("onPrimary") else colors.cp("primary")
    val chipBackground = if (current) colors.cp("onPrimary") else colors.cp("primary")
    val chipText = if (current) colors.cp("primary") else colors.cp("onPrimary")

    @Composable
    fun Part(text: String, changed: Boolean, size: Int, normal: ColorProvider, bold: Boolean = false, strike: Boolean = false) {
        val style = TextStyle(
            color = if (changed) chipText else normal,
            fontSize = size.sp,
            fontWeight = if (bold || changed) FontWeight.Bold else FontWeight.Normal,
            textDecoration = if (strike) TextDecoration.LineThrough else TextDecoration.None,
        )
        if (changed) {
            Box(modifier = GlanceModifier.background(chipBackground).cornerRadius(6.dp).padding(horizontal = 5.dp, vertical = 1.dp)) {
                Text(text, style = style, maxLines = 1)
            }
        } else {
            Text(text, style = style, maxLines = 1)
        }
    }

    ListCard(height, if (current) colors.cp("primary") else colors.cp("surfaceContainerHigh")) {
        Box(modifier = GlanceModifier.width(22.dp)) { Text(row.hour, style = textStyle(hourColor, 13, bold = true)) }
        Column(modifier = GlanceModifier.defaultWeight()) {
            Part(row.subject, row.subjectChanged, 13, onBg, bold = true, strike = canceled)
            Row(verticalAlignment = Alignment.CenterVertically) {
                var first = true
                fun separator(): Boolean {
                    val needed = !first
                    first = false
                    return needed
                }
                if (row.time.isNotEmpty()) {
                    separator()
                    Text(row.time, style = textStyle(muted, 11), maxLines = 1)
                }
                if (row.room.isNotEmpty()) {
                    if (separator()) Text(" · ", style = textStyle(muted, 11), maxLines = 1)
                    Part(row.room, row.roomChanged, 11, muted)
                }
                if (row.teacher.isNotEmpty()) {
                    if (separator()) Text(" · ", style = textStyle(muted, 11), maxLines = 1)
                    Part(row.teacher, row.teacherChanged, 11, muted)
                }
            }
        }
        if (row.hasTest) {
            Pill("Test", TEST_PILL_BACKGROUND, TEST_PILL_TEXT)
            if (row.badge != null) RowSpacer(4.dp)
        }
        if (row.badge != null) {
            val (bg, fg) = changeRoles(row.badgeKind)
            Pill(row.badge, colors.cp(bg), colors.cp(fg))
        }
    }
}

// Pink like the test flag in the web app; no Material role is pink, so it is fixed in both themes.
private val TEST_PILL_BACKGROUND = ColorProvider(Color(0xFFEC4899))
private val TEST_PILL_TEXT = ColorProvider(Color.White)

private fun changeRoles(kind: ChangeKind?): Pair<String, String> = when (kind) {
    ChangeKind.CANCELED -> "errorContainer" to "onErrorContainer"
    ChangeKind.SUBSTITUTION -> "tertiaryContainer" to "onTertiaryContainer"
    ChangeKind.ROOM -> "secondaryContainer" to "onSecondaryContainer"
    ChangeKind.ADDED -> "primaryContainer" to "onPrimaryContainer"
    else -> "surfaceContainerHighest" to "onSurface"
}

// -------------------------------------------------------------------- Marks

class MarksWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideLive(context, this) { input, colors -> MarksContent(input, colors) }
    }
}

class MarksWidgetReceiver : PrehledGlanceReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MarksWidget()
}

@Composable
private fun MarksContent(input: WidgetInputs, colors: WidgetColors) {
    val model = MarksModel.build(input)
    WidgetShell(input, colors, input.text.pick("Známky", "Marks"), null, "prehled://open/marks", section = "marks") {
        if (model.emptyText != null) StatusText(model.emptyText, colors) else RowList(model.rows) { row ->
            ListCard(48.dp, colors.cp("surfaceContainerHigh")) {
                Box(modifier = GlanceModifier.width(30.dp), contentAlignment = Alignment.Center) {
                    Text(row.mark, style = textStyle(colors.cp("primary"), 13, bold = true), maxLines = 1)
                }
                RowSpacer(4.dp)
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(row.subject, style = textStyle(colors.cp("onSurface"), 13, bold = true), maxLines = 1)
                    Text(
                        "${input.text.pick("váha", "weight")} ${row.weight}" + if (row.rankText.isEmpty()) "" else " · ${row.rankText}",
                        style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1,
                    )
                }
                if (row.dateText.isNotEmpty()) {
                    RowSpacer(8.dp)
                    Text(row.dateText, style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1)
                }
            }
        }
    }
}

// ----------------------------------------------------------------- Messages

class MessagesWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideLive(context, this) { input, colors -> MessagesContent(input, colors) }
    }
}

class MessagesWidgetReceiver : PrehledGlanceReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MessagesWidget()
}

@Composable
private fun MessagesContent(input: WidgetInputs, colors: WidgetColors) {
    val model = MessagesModel.build(input)
    val context = LocalContext.current
    WidgetShell(input, colors, input.text.pick("Zprávy", "Messages"), if (model.unreadCount > 0) model.unreadText else null, "prehled://open/messages", section = "messagesReceived") {
        if (model.emptyText != null) StatusText(model.emptyText, colors) else RowList(model.rows) { row ->
            val link = if (row.type == "received") DeepLinks.open("message-detail", row.id) else "prehled://open/messages"
            val onBg = if (row.unread) colors.cp("onPrimary") else colors.cp("onSurface")
            val muted = if (row.unread) colors.cp("onPrimary") else colors.cp("onSurfaceVariant")
            ListCard(
                52.dp, if (row.unread) colors.cp("primary") else colors.cp("surfaceContainerHigh"),
                modifier = GlanceModifier.clickable(openAction(context, link)),
            ) {
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(row.sender.ifEmpty { row.title }, style = textStyle(onBg, 13, bold = row.unread), maxLines = 1)
                    if (row.sender.isNotEmpty()) Text(row.title, style = textStyle(muted, 11), maxLines = 1)
                }
                Text(row.dateText, style = textStyle(muted, 10), maxLines = 1)
            }
        }
    }
}

// ----------------------------------------------------------------- Homework

class HomeworkWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideLive(context, this) { input, colors -> HomeworkContent(input, colors) }
    }
}

class HomeworkWidgetReceiver : PrehledGlanceReceiver() {
    override val glanceAppWidget: GlanceAppWidget = HomeworkWidget()
}

@Composable
private fun HomeworkContent(input: WidgetInputs, colors: WidgetColors) {
    val model = HomeworkModel.build(input)
    WidgetShell(input, colors, input.text.pick("Úkoly", "Homework"), null, "prehled://open/homework", section = "homework") {
        if (model.emptyText != null) StatusText(model.emptyText, colors) else RowList(model.rows) { row ->
            ListCard(52.dp, colors.cp("surfaceContainerHigh")) {
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(row.subject, style = textStyle(colors.cp("onSurface"), 13, bold = true), maxLines = 1)
                    Text(row.content, style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1)
                }
                if (row.deadlineText.isNotEmpty()) {
                    if (row.overdue) Pill(row.deadlineText, colors.cp("errorContainer"), colors.cp("onErrorContainer"))
                    else Text(row.deadlineText, style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1)
                }
            }
        }
    }
}

// ------------------------------------------------------------------- Events

class EventsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideLive(context, this) { input, colors -> EventsContent(input, colors) }
    }
}

class EventsWidgetReceiver : PrehledGlanceReceiver() {
    override val glanceAppWidget: GlanceAppWidget = EventsWidget()
}

@Composable
private fun EventsContent(input: WidgetInputs, colors: WidgetColors) {
    val model = EventsModel.build(input)
    WidgetShell(input, colors, input.text.pick("Akce", "Events"), null, "prehled://open/events", section = "events") {
        if (model.emptyText != null) StatusText(model.emptyText, colors) else RowList(model.rows) { row ->
            ListCard(48.dp, colors.cp("surfaceContainerHigh")) {
                Box(
                    modifier = GlanceModifier.background(colors.cp("secondaryContainer")).cornerRadius(10.dp).padding(horizontal = 8.dp, vertical = 4.dp),
                ) { Text(row.dateText, style = textStyle(colors.cp("onSecondaryContainer"), 11, bold = true), maxLines = 1) }
                RowSpacer(10.dp)
                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(row.title, style = textStyle(colors.cp("onSurface"), 13, bold = true), maxLines = 1)
                    if (row.detail.isNotEmpty()) Text(row.detail, style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1)
                }
            }
        }
    }
}
