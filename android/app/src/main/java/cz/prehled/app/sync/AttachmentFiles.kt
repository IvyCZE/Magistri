package cz.prehled.app.sync

import java.net.URLEncoder

/** File name and type helpers for downloaded attachments. Pure, so they are unit tested. */
object AttachmentFiles {
    private const val MAX_NAME = 120
    private const val FALLBACK_NAME = "priloha"

    private val mimeByExtension = mapOf(
        "pdf" to "application/pdf",
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" to "application/vnd.ms-powerpoint",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odt" to "application/vnd.oasis.opendocument.text",
        "ods" to "application/vnd.oasis.opendocument.spreadsheet",
        "odp" to "application/vnd.oasis.opendocument.presentation",
        "rtf" to "application/rtf",
        "txt" to "text/plain",
        "csv" to "text/csv",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "png" to "image/png",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "zip" to "application/zip",
        "mp3" to "audio/mpeg",
        "mp4" to "video/mp4",
    )

    /** The type used to open the file, or null when the extension says nothing useful. */
    fun mimeTypeFor(fileName: String): String? =
        mimeByExtension[fileName.substringAfterLast('.', "").lowercase()]

    /**
     * A name that is safe as a file name on shared storage: no path parts, no characters
     * Android or FAT reject, no leading dots, short enough, extension kept.
     */
    fun safeFileName(name: String?): String {
        val cleaned = (name ?: "")
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
            .trim()
            .trimStart('.')
            .trim()
        if (cleaned.isEmpty() || cleaned.all { it == '_' }) return FALLBACK_NAME
        if (cleaned.length <= MAX_NAME) return cleaned
        val extension = cleaned.substringAfterLast('.', "").takeIf { it.length in 1..10 }
        val stem = cleaned.removeSuffix(extension?.let { ".$it" } ?: "")
        return if (extension == null) cleaned.take(MAX_NAME) else stem.take(MAX_NAME - extension.length - 1) + "." + extension
    }

    /** Attachment ids can contain spaces and other characters that must not reach the URL raw. */
    fun encodePathSegment(id: String): String =
        URLEncoder.encode(id, "UTF-8").replace("+", "%20").replace("*", "%2A").replace("%7E", "~")
}
