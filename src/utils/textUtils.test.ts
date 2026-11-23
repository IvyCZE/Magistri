// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeMessageHtml } from './textUtils';

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

  it('preserves formatting, tables, and secure links without appearance overrides', () => {
    const div = parse('<p style="color:red" onclick="alert(1)"><strong>Hello</strong></p><table><tr><td colspan="2">Text</td></tr></table><a href="https://example.invalid" target="_self" rel="opener">Link</a>');
    expect(div.querySelector('strong')?.textContent).toBe('Hello');
    expect(div.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(div.querySelector('[style], [onclick]')).toBeNull();
    expect(div.querySelector('a')?.getAttribute('href')).toBe('https://example.invalid');
    expect(div.querySelector('a')?.target).toBe('_blank');
    expect(div.querySelector('a')?.rel).toBe('noopener noreferrer');
    expect(sanitizeMessageHtml(div.innerHTML)).toBe(div.innerHTML);
  });

  it.each(['mailto:teacher@example.invalid', 'tel:+420555123456', '/school-page'])('preserves useful links: %s', (href) => {
    expect(parse(`<a href="${href}">Link</a>`).querySelector('a')?.getAttribute('href')).toBe(href);
  });
});
