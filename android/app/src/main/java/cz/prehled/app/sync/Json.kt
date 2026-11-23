package cz.prehled.app.sync

import org.json.JSONArray
import org.json.JSONObject

/*
 * The web client reads the API with JavaScript truthiness (`a || b`), where null,
 * missing and empty values all fall through. These helpers give the parsers the
 * same behaviour, because org.json would turn a JSON null into the text "null".
 */

fun JSONObject.str(key: String): String {
    if (!has(key) || isNull(key)) return ""
    return when (val v = get(key)) {
        is String -> v
        is Number, is Boolean -> v.toString()
        else -> ""
    }
}

fun JSONObject.obj(key: String): JSONObject? = if (has(key) && !isNull(key)) optJSONObject(key) else null

fun JSONObject.arr(key: String): JSONArray? = if (has(key) && !isNull(key)) optJSONArray(key) else null

fun JSONObject.truthy(key: String): Boolean {
    if (!has(key) || isNull(key)) return false
    return when (val v = get(key)) {
        is Boolean -> v
        is Number -> v.toDouble() != 0.0
        is String -> v.isNotEmpty()
        else -> true
    }
}

/**
 * Whether a Komens message is unread. Real Bakaláři servers send `Read`; `Unread` is
 * only used when `Read` is missing. Mirrors `isMessageUnread` in src/domain/messageState.ts.
 */
fun JSONObject.isUnreadMessage(): Boolean {
    if (!has("Read") || isNull("Read")) return truthy("Unread")
    return when (val v = get("Read")) {
        is Boolean -> !v
        is Number -> v.toDouble() == 0.0
        is String -> v.trim().equals("false", ignoreCase = true) || v.trim() == "0"
        else -> false
    }
}

fun JSONObject.intOrNull(key: String): Int? {
    if (!has(key) || isNull(key)) return null
    return when (val v = get(key)) {
        is Number -> v.toInt()
        is String -> v.trim().toIntOrNull()
        else -> null
    }
}

/** First non-empty string among the keys, like `a.X || a.Y`. */
fun JSONObject.firstStr(vararg keys: String): String = keys.asSequence().map { str(it) }.firstOrNull { it.isNotEmpty() } ?: ""

fun JSONArray?.objects(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}

fun JSONArray?.strings(): List<String> {
    if (this == null) return emptyList()
    return (0 until length()).map { i -> if (isNull(i)) "" else get(i).toString() }
}

/** Keeps the date part of an ISO timestamp. */
fun String.dateOnly(): String = substringBefore('T')
