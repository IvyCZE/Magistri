import DOMPurify from 'dompurify';

/**
 * Utility functions for HTML text sanitization, entity decoding,
 * and converting Bakaláři message HTML bodies to clean plain text.
 */

/**
 * Decodes common and numeric/hexadecimal HTML entities.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str || !str.includes('&')) return str || '';

  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&bull;/gi, '•')
    .replace(/&copy;/gi, '©')
    .replace(/&reg;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return !isNaN(code) && code > 0 ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return !isNaN(code) && code > 0 ? String.fromCharCode(code) : '';
    });
}

/**
 * Tests whether a string contains HTML markup tags.
 */
export function hasHtmlMarkup(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /<\s*(?:p|div|br|span|b|strong|i|em|u|s|a|ul|ol|li|table|thead|tbody|tr|th|td|h[1-6]|blockquote|pre|code)\b[^>]*>/i.test(str);
}

/**
 * Strips HTML tags and converts HTML message content to clean readable plain text:
 * - Converts <br>, <p>, <div>, <h1>-<h6>, <li> to appropriate newlines or bullets.
 * - Decodes all HTML entities (&nbsp;, &amp;, &lt;, &gt;, etc.).
 * - Strips all remaining tags.
 * - Collapses excessive whitespace and blank lines.
 */
export function cleanHtmlToPlainText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw;

  // Remove scripts, styles, iframes and their content first
  text = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Convert block tags and breaks into newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/blockquote>/gi, '\n\n');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize line breaks and spaces
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[ \t]+/g, ' '); // collapse inline spaces
  text = text.replace(/ +\n/g, '\n'); // remove spaces before newline
  text = text.replace(/\n +/g, '\n'); // remove spaces after newline
  text = text.replace(/\n{3,}/g, '\n\n'); // at most 2 consecutive newlines

  return text.trim();
}

/** Only message formatting and safe links survive; active content and tracking images do not. */
export function sanitizeMessageHtml(raw: string): string {
  if (!raw || typeof raw !== 'string' || !DOMPurify.isSupported) return '';

  const fragment = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'del',
      'a', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'sup', 'sub',
    ],
    ALLOWED_ATTR: ['href', 'title', 'colspan', 'rowspan', 'scope', 'start', 'reversed'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  fragment.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (href) {
      try {
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(href, window.location.href).protocol)) {
          anchor.removeAttribute('href');
        }
      } catch {
        anchor.removeAttribute('href');
      }
    }
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  });
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML.replace(/&nbsp;/gi, ' ').trim();
}

/**
 * Removes redundant class prefixes from timetable group names and hides names
 * that represent the entire class.
 */
export function cleanLessonGroup(rawGroup: string | null | undefined, userClassName?: string): string {
  if (!rawGroup || !rawGroup.trim()) return '';
  let group = rawGroup.trim();

  // Common phrases for the entire class
  const lower = group.toLowerCase();
  if (
    lower === 'celá třída' ||
    lower === 'celá trida' ||
    lower === 'celá' ||
    lower === 'cela' ||
    lower === 'všichni' ||
    lower === 'vsichni' ||
    lower === 'vše' ||
    lower === 'vse'
  ) {
    return '';
  }

  // Hide group names made up entirely of class codes.
  const onlyClassNamesRegex = /^(?:\d+\s*\.\s*[a-zA-Z](?:[0-9])?(?:[\s,;+&/]+(?:\d+\s*\.\s*[a-zA-Z](?:[0-9])?))*)$/i;
  if (onlyClassNamesRegex.test(group)) {
    return '';
  }

  let prefixStripped = false;

  // Known class name check from user profile
  if (userClassName && userClassName.trim()) {
    const normUserClass = userClassName.trim().toLowerCase();
    const normGroupNoSpace = lower.replace(/\s+/g, '');
    const normClassNoSpace = normUserClass.replace(/\s+/g, '');

    // Ignore spacing differences when comparing with the user's class.
    if (lower === normUserClass || normGroupNoSpace === normClassNoSpace) {
      return '';
    }

    const escaped = userClassName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const classPrefixRegex = new RegExp(`^${escaped}(?:[\\s,;+&/]+(?:${escaped}|\\d+\\s*\\.\\s*[a-zA-Z0-9]+))*[\\s_/:,-]+(.*)$`, 'i');
    const match = group.match(classPrefixRegex);
    if (match) {
      group = match[1].trim();
      prefixStripped = true;
    } else {
      const parenMatch = group.match(new RegExp(`^${escaped}\\s*\\((.*)\\)$`, 'i'));
      if (parenMatch) {
        group = parenMatch[1].trim();
        prefixStripped = true;
      }
    }
  }

  // Try a generic class prefix if the profile class did not match.
  if (!prefixStripped) {
    const genericClassPrefixRegex = /^(?:\d+\s*\.\s*[a-zA-Z0-9]+)(?:[\s,;+&/]+(?:\d+\s*\.\s*[a-zA-Z0-9]+))*[\s_/:,-]+(.*)$/i;
    const genMatch = group.match(genericClassPrefixRegex);
    if (genMatch) {
      group = genMatch[1].trim();
      prefixStripped = true;
    }
  }

  // Strip matching outer parentheses.
  if (group.startsWith('(') && group.endsWith(')')) {
    group = group.slice(1, -1).trim();
  }

  // If after stripping it's empty or just punctuation
  if (!group || /^[\s_/:,-]+$/.test(group)) {
    return '';
  }

  return group;
}

/**
 * Formats class rank and average text for marks.
 * If the string does not start with a star symbol (☆ or ★), prepends '☆ '.
 */
export function formatClassRankText(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('☆') || trimmed.startsWith('★')) {
    return trimmed;
  }
  return `☆ ${trimmed}`;
}
