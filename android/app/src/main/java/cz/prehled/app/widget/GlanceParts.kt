package cz.prehled.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

internal fun WidgetColors.cp(role: String): ColorProvider = ColorProvider(Color(this[role]))

internal fun textStyle(color: ColorProvider, size: Int, bold: Boolean = false) =
    TextStyle(color = color, fontSize = size.sp, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

internal val SHELL_PADDING = 12.dp
internal val HEADER_HEIGHT = 36.dp

/**
 * A scrolling list that fills the space under the header. Row counts are not
 * worked out from the reported widget size, because some launchers report a
 * size far smaller than the real one and leave the widget half empty.
 */
@Composable
internal fun <T> ColumnScope.RowList(items: List<T>, row: @Composable (T) -> Unit) {
    LazyColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
        items(items.size) { index -> row(items[index]) }
    }
}

/**
 * The card every widget sits in: surface colour, header, status messages instead
 * of data when needed, and an "Updated ..." note for old data. A tap opens [deepLink].
 */
@Composable
internal fun WidgetShell(
    input: WidgetInputs,
    colors: WidgetColors,
    title: String,
    subtitle: String?,
    deepLink: String,
    compact: Boolean = false,
    background: String = "surfaceContainer",
    /** The snapshot section the widget shows, so the "Updated ... ago" note follows its own download. */
    section: String? = null,
    header: (@Composable RowScope.() -> Unit)? = null,
    body: @Composable ColumnScope.() -> Unit,
) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(colors.cp(background))
            .cornerRadius(24.dp)
            .padding(if (compact) 10.dp else SHELL_PADDING)
            .clickable(actionStartActivity(WidgetData.openIntent(context, deepLink))),
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth().height(if (compact) 28.dp else HEADER_HEIGHT), verticalAlignment = Alignment.CenterVertically) {
                if (header != null) header() else {
                    Text(title, style = textStyle(colors.cp("primary"), 15, bold = true), maxLines = 1, modifier = GlanceModifier.defaultWeight())
                    if (subtitle != null) Text(subtitle, style = textStyle(colors.cp("onSurfaceVariant"), 11), maxLines = 1)
                }
            }
            when (input.status) {
                WidgetStatus.Ready -> body()
                WidgetStatus.Demo -> StatusText(input.text.demo, colors)
                WidgetStatus.SignedOut -> StatusText(input.text.signedOut, colors)
                WidgetStatus.SessionExpired -> StatusText(input.text.sessionExpired, colors)
                WidgetStatus.Loading -> StatusText(input.text.loading, colors)
            }
            (if (section != null) input.staleNoteFor(section) else input.staleNote)?.let {
                Spacer(GlanceModifier.defaultWeight())
                Text(it, style = textStyle(colors.cp("onSurfaceVariant"), 10), maxLines = 1)
            }
        }
    }
}

@Composable
internal fun StatusText(text: String, colors: WidgetColors) {
    Box(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.CenterStart) {
        Text(text, style = textStyle(colors.cp("onSurfaceVariant"), 13))
    }
}

@Composable
internal fun Pill(text: String, background: ColorProvider, foreground: ColorProvider) {
    Box(modifier = GlanceModifier.background(background).cornerRadius(10.dp).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Text(text, style = textStyle(foreground, 10, bold = true), maxLines = 1)
    }
}

/**
 * One list entry as a card of its own, like the cards in the app. The card is inset in a
 * transparent box of [height], which is what makes the gap between cards. Every card sets
 * a background explicitly: the launcher recycles list rows, and a row that sets none keeps
 * the one of the row the view showed before.
 */
@Composable
internal fun ListCard(
    height: Dp,
    background: ColorProvider,
    modifier: GlanceModifier = GlanceModifier,
    content: @Composable RowScope.() -> Unit,
) {
    Box(modifier = GlanceModifier.fillMaxWidth().height(height).padding(vertical = 2.dp)) {
        Row(
            modifier = modifier.fillMaxSize().cornerRadius(12.dp).background(background).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

@Composable
internal fun RowSpacer(width: Dp = 8.dp) = Spacer(GlanceModifier.width(width))

internal fun openAction(context: Context, deepLink: String) = actionStartActivity(WidgetData.openIntent(context, deepLink))

@Composable
internal fun Circle(size: Dp, background: ColorProvider, content: @Composable () -> Unit) {
    Box(modifier = GlanceModifier.size(size).background(background).cornerRadius(size / 2), contentAlignment = Alignment.Center) { content() }
}
