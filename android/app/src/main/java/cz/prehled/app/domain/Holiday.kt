package cz.prehled.app.domain

data class HolidayInfo(
    val isHoliday: Boolean,
    val isPublicHoliday: Boolean,
    /** celebration, holiday, director, custom or null. */
    val type: String?,
    val title: String,
    val badgeLabel: String,
    val shortBadgeLabel: String,
    val description: String?,
) {
    companion object {
        val NONE = HolidayInfo(false, false, null, "", "", "", null)
    }
}

/**
 * Port of src/domain/holiday.ts. Holiday status comes only from the API payload
 * (day type and description), never from hardcoded dates.
 *
 * @param atomsCount number of lessons on the day, or null when unknown (a bare date).
 */
fun getHolidayInfo(dayType: String?, dayDescription: String?, atomsCount: Int?, lang: String): HolidayInfo {
    val isEn = lang == "en"
    val normDayType = (dayType ?: "").trim().lowercase()
    val dayDesc = (dayDescription ?: "").trim()
    val lowerDesc = dayDesc.lowercase()

    if (normDayType == "celebration" || Regex("""\b(svátek|svatek)\b""", RegexOption.IGNORE_CASE).containsMatchIn(lowerDesc)) {
        val title = dayDesc.ifEmpty { if (isEn) "Public Holiday" else "Státní svátek" }
        return HolidayInfo(
            isHoliday = true,
            isPublicHoliday = true,
            type = "celebration",
            title = title,
            badgeLabel = if (isEn) "Public Holiday" else "Státní svátek",
            shortBadgeLabel = if (isEn) "Holiday" else "Svátek",
            description = if (dayDesc.isNotEmpty() && dayDesc != title) dayDesc
            else if (isEn) "Public holiday — no classes scheduled." else "Státní svátek — v tento den se nevyučuje.",
        )
    }

    if (normDayType == "holiday" || Regex("prázdnin|prazdnin|vacation", RegexOption.IGNORE_CASE).containsMatchIn(lowerDesc)) {
        val title = dayDesc.ifEmpty { if (isEn) "School Break" else "Prázdniny" }
        return HolidayInfo(
            isHoliday = true,
            isPublicHoliday = false,
            type = "holiday",
            title = title,
            badgeLabel = if (isEn) "School Break" else "Prázdniny",
            shortBadgeLabel = if (isEn) "Break" else "Prázdniny",
            description = if (dayDesc.isNotEmpty() && dayDesc != title) dayDesc
            else if (isEn) "School holiday / vacation — free day." else "Školní prázdniny — volný den.",
        )
    }

    if (normDayType == "directorday" || Regex("""ředitel|reditel|volno\s+ředitele""", RegexOption.IGNORE_CASE).containsMatchIn(lowerDesc)) {
        val title = dayDesc.ifEmpty { if (isEn) "Director's Day Off" else "Ředitelské volno" }
        return HolidayInfo(
            isHoliday = true,
            isPublicHoliday = false,
            type = "director",
            title = title,
            badgeLabel = if (isEn) "Director's Day Off" else "Ředitelské volno",
            shortBadgeLabel = if (isEn) "Day Off" else "Řed. volno",
            description = if (dayDesc.isNotEmpty() && dayDesc != title) dayDesc
            else if (isEn) "Director's day off — no classes scheduled." else "Ředitelské volno — v tento den se nevyučuje.",
        )
    }

    if (dayDesc.isNotEmpty() && (atomsCount == 0 || normDayType != "workday")) {
        val isStateHolidayDesc = Regex("státní|statni|státnost|statnost", RegexOption.IGNORE_CASE).containsMatchIn(lowerDesc)
        return HolidayInfo(
            isHoliday = true,
            isPublicHoliday = isStateHolidayDesc,
            type = if (isStateHolidayDesc) "celebration" else "custom",
            title = dayDesc,
            badgeLabel = if (isStateHolidayDesc) (if (isEn) "Public Holiday" else "Státní svátek") else (if (isEn) "Day Off" else "Volný den"),
            shortBadgeLabel = if (isStateHolidayDesc) (if (isEn) "Holiday" else "Svátek") else (if (isEn) "Day Off" else "Volno"),
            description = if (isEn) "No classes scheduled on this day." else "V tento den se nevyučuje.",
        )
    }

    if (normDayType.isNotEmpty() && normDayType != "workday" && normDayType != "weekend" && atomsCount == 0) {
        return HolidayInfo(
            isHoliday = true,
            isPublicHoliday = false,
            type = "custom",
            title = dayDesc.ifEmpty { if (isEn) "Day Off" else "Volný den" },
            badgeLabel = if (isEn) "Day Off" else "Volný den",
            shortBadgeLabel = if (isEn) "Day Off" else "Volno",
            description = if (isEn) "No classes scheduled on this day." else "V tento den se nevyučuje.",
        )
    }

    return HolidayInfo.NONE
}

fun getHolidayInfo(day: Day, lang: String): HolidayInfo =
    getHolidayInfo(day.dayType, day.dayDescription, day.lessons.size, lang)

/** A bare date carries no API information, so it is never a holiday. */
fun getHolidayInfoForDate(lang: String): HolidayInfo = getHolidayInfo(null, null, null, lang)
