// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hasHtmlMarkup, parseKomensMessageBody, sanitizeMessageHtml, stripMessageImages } from './textUtils';

const AVIF = 'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACUAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAgAAAAIAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAtbWRhdBIACgg4CL9pAQ0GkDIXGUJjBMAANAAE7Ceay7DTUWHbDp74/aA=';

const parse = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = sanitizeMessageHtml(html);
  return div;
};

describe('message HTML security', () => {
  it.each([
    '<p><iframe srcdoc="&#60;script&#62;alert(1)&#60;/script&#62;">',
    '<p><svg><a xlink:href="javascript:alert(1)">test</a></svg></p>',
    '<p><math><mtext><img src=x onerror=alert(1)></mtext></math></p>',
    '<p><script>alert(1)</script><object data="https://example.invalid"></object></p>',
    '<p><form action="https://example.invalid"><input name="password"></form></p>',
  ])('removes active content: %s', (html) => {
    expect(parse(html).querySelector('script, iframe, svg, math, img, object, form, input')).toBeNull();
  });

  it.each(['java&#x73;cript:alert(1)', 'javascript:alert(1)', 'java&#10;script:alert(1)', 'data:text/html,test', 'vbscript:test'])('rejects unsafe URLs: %s', (href) => {
    expect(parse(`<a href="${href}">link</a>`).querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('preserves formatting, text color, tables, and secure links', () => {
    const div = parse('<p style="color:red;position:fixed;background:blue" onclick="alert(1)"><strong>Hello</strong></p><table><tr><td colspan="2">Text</td></tr></table><a href="https://example.invalid" target="_self" rel="opener">Link</a>');
    expect(div.querySelector('strong')?.textContent).toBe('Hello');
    expect(div.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(div.querySelector('p')?.getAttribute('style')).toBe('color: red;');
    expect(div.querySelector('[onclick]')).toBeNull();
    expect(div.querySelector('a')?.getAttribute('href')).toBe('https://example.invalid');
    expect(div.querySelector('a')?.target).toBe('_blank');
    expect(div.querySelector('a')?.rel).toBe('noopener noreferrer');
    expect(sanitizeMessageHtml(div.innerHTML)).toBe(div.innerHTML);
  });

  it.each(['mailto:teacher@example.invalid', 'tel:+420555123456', '/school-page'])('preserves useful links: %s', (href) => {
    expect(parse(`<a href="${href}">Link</a>`).querySelector('a')?.getAttribute('href')).toBe(href);
  });

  it('keeps embedded AVIF in place and strips event handlers and alternate sources', () => {
    const html = `<img src="${AVIF}" alt="Test" onerror="alert(1)" srcset="https://example.invalid/pixel">`;
    expect(hasHtmlMarkup(html)).toBe(true);
    const image = parse(html).querySelector('img');
    expect(image?.getAttribute('src')).toBe(AVIF);
    expect(image?.getAttribute('alt')).toBe('Test');
    expect(image?.getAttributeNames().sort()).toEqual(['alt', 'src']);
  });

  it.each([
    'https://example.invalid/pixel.png', '/relative.png', 'cid:test',
    `data:image/svg+xml;base64,${btoa('<svg/>')}`,
    `data:image/png;base64,${btoa('<html></html>')}`,
    AVIF.replace('image/avif', 'image/png'),
    'data:image/png;base64,iVBORw0KGgo=bogus',
  ])('blocks external, malformed or mismatched image sources', (src) => {
    expect(parse(`<img src="${src}">`).querySelector('img')).toBeNull();
  });

  it('keeps literal text colors only, including legacy font colors', () => {
    const div = parse('<span style="color:var(--brand);font-size:99px">Default</span><font color="#008080" size="7">Teal</font>');
    expect(div.querySelector('span')?.hasAttribute('style')).toBe(false);
    expect(div.querySelector('font')?.getAttributeNames()).toEqual(['style']);
    expect(div.querySelector('font')?.style.color).toBe('rgb(0, 128, 128)');
  });

  it('flags Komens placeholders while retaining text and colors for the list and offline cache', () => {
    const parsed = parseKomensMessageBody(`<p style="color:red">Text</p><img src="#"><img src="${AVIF}">`);
    expect(parsed.needsBodyDetail).toBe(true);
    expect(parsed.text).toBe('Text');
    expect(parsed.html?.includes(AVIF)).toBe(true);
    expect(parsed.html?.includes('src="#"')).toBe(false);
    expect(stripMessageImages(parsed.html)).toBe('<p style="color: red;">Text</p>');
  });
});
