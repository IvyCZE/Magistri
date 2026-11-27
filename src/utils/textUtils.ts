import DOMPurify from 'dompurify';
import { rasterImageMime } from '../domain/rasterImage';

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
  return /<\s*(?:p|div|br|span|b|strong|i|em|u|s|a|img|font|ul|ol|li|table|thead|tbody|tr|th|td|h[1-6]|blockquote|pre|code)\b[^>]*>/i.test(str);
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

function verifiedInlineImage(source: string): string | undefined {
  const prefix = /^data:(image\/(?:avif|png|jpeg|gif|webp));base64,/i.exec(source);
  if (!prefix) return undefined;

  const mime = prefix[1].toLowerCase();
  const encoded = source.slice(prefix[0].length).replace(/[\t\n\f\r ]/g, '');
  if (!/^[a-z0-9+/]+={0,2}$/i.test(encoded) || encoded.length % 4 === 1) return undefined;
  if (encoded.endsWith('=') && encoded.length % 4 !== 0) return undefined;

  try {
    // The decoder only needs the header to compare the advertised MIME to the bytes.
    const header = Uint8Array.from(atob(encoded.slice(0, 88)), char => char.charCodeAt(0));
    return rasterImageMime(header) === mime ? `data:${mime};base64,${encoded}` : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeMessageContent(raw: string): { html: string; needsBodyDetail: boolean } {
  if (!raw || typeof raw !== 'string' || !DOMPurify.isSupported) return { html: '', needsBodyDetail: false };

  const fragment = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'div', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'del',
      'a', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'sup', 'sub', 'img', 'font',
    ],
    ALLOWED_ATTR: ['href', 'title', 'colspan', 'rowspan', 'scope', 'start', 'reversed', 'src', 'alt', 'style', 'color'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });

  let needsBodyDetail = false;
  fragment.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src')?.trim() ?? '';
    if (src === '#') needsBodyDetail = true;
    const verified = verifiedInlineImage(src);
    if (verified) image.setAttribute('src', verified);
    else image.remove();
  });
  fragment.querySelectorAll('[src]:not(img)').forEach(element => element.removeAttribute('src'));

  const parsedStyle = document.createElement('span').style;
  fragment.querySelectorAll('[style], [color]').forEach((element) => {
    parsedStyle.cssText = element.getAttribute('style') || '';
    if (!parsedStyle.color && element.localName === 'font') parsedStyle.color = element.getAttribute('color') || '';
    const color = parsedStyle.color;
    element.removeAttribute('style');
    element.removeAttribute('color');
    // Rebuild only the color declaration from a literal CSS color parsed by the browser.
    if (/^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([a-z0-9.+%,/\s-]+\))$/i.test(color)) {
      element.setAttribute('style', `color: ${color};`);
    }
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
  return { html: container.innerHTML.replace(/&nbsp;/gi, ' ').trim(), needsBodyDetail };
}

/** Preserves message formatting and validated embedded raster images. */
export function sanitizeMessageHtml(raw: string): string {
  return sanitizeMessageContent(raw).html;
}

export function parseKomensMessageBody(raw: string) {
  const content = hasHtmlMarkup(raw) ? sanitizeMessageContent(raw) : undefined;
  return {
    text: cleanHtmlToPlainText(raw),
    html: content?.html,
    needsBodyDetail: content?.needsBodyDetail ?? false,
  };
}

/** Keep the offline text cache compact. The body can be reloaded for its images. */
export function stripMessageImages(html: string | undefined): string | undefined {
  if (!html?.includes('<img')) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('img').forEach(image => image.remove());
  return template.innerHTML;
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
