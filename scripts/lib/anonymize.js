// Anonymises raw Bakaláři API responses so they can be committed as test fixtures.
//
// What it does, in order:
//  1. drops keys that carry contact or identity data (e-mail, phone, photo, ...);
//  2. replaces every person (teacher, sender, organiser) with a stable pseudonym, and the same
//     people inside free text (e.g. a substitution description) the same way;
//  3. replaces opaque ids with `id-N` (the same id gets the same replacement in every file, so the
//     references between records keep working);
//  4. scrambles free text (titles, message bodies, captions, topics) letter by letter, keeping
//     length, spaces, punctuation and HTML tags, so the parsers still see realistic shapes;
//  5. renames attachments to `priloha-N.<ext>`.
// Marks, dates, subjects, rooms, hours, day types and holiday descriptions are kept: the parsers
// and the holiday logic depend on them and they do not identify anybody.

import { parseFragment, serialize } from 'parse5';

const DROP_KEYS = /(e-?mail|phone|mobile|photo|avatar|birth|address|token|password|login|rodne|ssn)/i;
const TITLES = new Set(['mgr', 'ing', 'phdr', 'rndr', 'bc', 'bca', 'doc', 'prof', 'paeddr', 'mudr', 'judr', 'dis', 'ph', 'd', 'csc', 'mba']);
// A parent key such as Teachers, Persons, Sender, Recipients or Participants holds people; a key such as
// TeacherName, Organizer or SubstituteTeacher is one.
const PEOPLE_PARENT = /(teacher|person|sender|recipient|user|student|author|organi[sz]|participant|attend|member|guardian|owner|creator|signer|confirm)/i;
const PERSON_KEY = /^(teacher|sender|author|organi[sz]er|recipient|student|user|owner|creator|confirmedby|substituteteacher|fullname)(name|abbrev)?$/i;
const isPeopleParent = (p) => Boolean(p) && PEOPLE_PARENT.test(p);
const isPersonKey = (k) => PERSON_KEY.test(k);
const FREE_TEXT_KEYS = new Set(['Title', 'Text', 'Content', 'Caption', 'Theme', 'Description', 'Place', 'Note', 'SubjectNote', 'TemporaryMark']);
const KEEP_TEXT_PARENTS = new Set(['Change']); // change descriptions are kept, minus the people in them

// `GroupIds` and `CycleIds` are lists of ids; they have to be mapped like `Id` so they still point at the group or cycle.
const isId = (key) => /(^|[a-z])Ids?$/.test(key) || key === 'ID';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deterministic pseudo-random generator, so the same input always gives the same output. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function scrambleText(text) {
  const rand = rng(hash(text));
  const lower = 'abcdefghijklmnoprstuvz';
  const scramble = (value) => value.replace(/\p{L}|\d/gu, (c) => {
    if (/\d/.test(c)) return String(Math.floor(rand() * 10));
    const pick = lower[Math.floor(rand() * lower.length)];
    return c === c.toUpperCase() && c !== c.toLowerCase() ? pick.toUpperCase() : pick;
  });
  if (!/<[!/a-z]/i.test(text)) return scramble(text);

  // Parse before scrubbing: contact details can hide in any attribute, comments,
  // entity-encoded strings, or unquoted values. Keep only structural metadata.
  const fragment = parseFragment(text);
  const walk = (node) => {
    if (node.nodeName === '#text') node.value = scramble(node.value);
    if (node.attrs) {
      node.attrs = node.attrs.flatMap((attr) => {
        if (/^(href|src|action|cite|poster)$/.test(attr.name)) return [{ ...attr, value: '#' }];
        if (attr.name === 'target') return [{ ...attr, value: '_blank' }];
        if (/^(colspan|rowspan)$/.test(attr.name) && /^\d{1,2}$/.test(attr.value)) return [attr];
        return [];
      });
    }
    if (node.childNodes) {
      node.childNodes = node.childNodes.filter((child) => child.nodeName !== '#comment');
      node.childNodes.forEach(walk);
    }
    if (node.content) walk(node.content);
  };
  walk(fragment);
  return serialize(fragment);
}

export function createAnonymizer() {
  const people = new Map(); // original string -> pseudonym
  const ids = new Map();
  const relevant = new Map();
  const sensitive = new Set(); // original tokens that must not survive
  let personCount = 0;
  let attachmentCount = 0;
  const scrambled = new Set(); // output strings that are random letters, which can contain a name by chance

  const word = (s) => s.replace(/[.,]/g, '').toLowerCase();

  function rememberSensitive(name) {
    for (const token of name.split(/[\s,]+/)) {
      const w = word(token);
      if (w.length >= 3 && !TITLES.has(w) && /\p{L}/u.test(w)) sensitive.add(w);
    }
  }

  function person(name, abbrev) {
    const n = ++personCount;
    if (name && !people.has(name)) {
      people.set(name, `Učitel ${n}`);
      rememberSensitive(name);
    }
    if (abbrev && !people.has(abbrev)) {
      people.set(abbrev, `U${n}`);
      if (word(abbrev).length >= 4) sensitive.add(word(abbrev));
    }
  }

  // Pass 1: learn who the people are, pairing a name with its abbreviation when they sit together.
  function collect(node, parent) {
    if (Array.isArray(node)) return node.forEach((n) => collect(n, parent));
    if (!isObject(node)) return;
    const inPeople = isPeopleParent(parent);
    if (inPeople) {
      const name = [node.Name, node.FullName].find((v) => typeof v === 'string' && v);
      const abbrev = typeof node.Abbrev === 'string' ? node.Abbrev : undefined;
      if (name || abbrev) person(name, abbrev);
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && value) {
        if (isPersonKey(key) && !people.has(value)) person(key.endsWith('Abbrev') ? undefined : value, key.endsWith('Abbrev') ? value : undefined);
        if (key === 'Sender' && !people.has(value)) person(value);
      } else {
        collect(value, key);
      }
    }
  }

  // Find the stem of a name so inflected forms can be recognized in Czech text.
  // It over-matches on purpose: a harmless word turned into "Učitel" costs nothing, a leaked name does.
  const stem = (token) => token.slice(0, Math.max(4, Math.min(token.length, Math.round(token.length * 0.7))));

  /** Replaces whole names (when `names`) and any word starting like a known name or its stem. */
  function replacePeopleIn(text, names = true) {
    let out = text;
    if (names) {
      // Longest first, so "Jana Nováková" goes before "Jana".
      const entries = [...people.entries()].sort((a, b) => b[0].length - a[0].length);
      for (const [original, pseudonym] of entries) {
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(original)}(?![\\p{L}\\p{N}])`, 'giu');
        out = out.replace(re, pseudonym);
      }
    }
    for (const token of sensitive) {
      if (token.length < 4) continue;
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(stem(token))}\\p{L}*`, 'giu'), 'Učitel');
    }
    return out;
  }

  /** Last line of defence: a known name left in any text that was kept as it came is replaced. */
  function scrub(node) {
    if (Array.isArray(node)) return node.map(scrub);
    if (isObject(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, scrub(v)]));
    if (typeof node !== 'string') return node;
    const cleaned = node.replace(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
      .replace(/(?:\+\d{1,3}[ \u00a0.-]*)?(?:\d[ \u00a0.-]*){9,}/g, '[phone]');
    return scrambled.has(node) ? cleaned : replacePeopleIn(cleaned, false);
  }

  function mapId(value) {
    if (!ids.has(value)) ids.set(value, `id-${ids.size + 1}`);
    return ids.get(value);
  }

  function walk(node, key, parent) {
    if (Array.isArray(node)) return node.map((n) => walk(n, key, parent));
    if (isObject(node)) {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (DROP_KEYS.test(k)) continue;
        out[k] = walk(v, k, key);
      }
      return out;
    }
    if (typeof node !== 'string' || node === '') return node;

    if (people.has(node) && (isPersonKey(key) || key === 'Sender' || (isPeopleParent(parent) && !isId(key)))) {
      return people.get(node);
    }
    if (isId(key)) return mapId(node);
    // "Novák Jan, 3.C": a person and a class; the class is kept, the person is not.
    if (key === 'RelevantName') {
      const cls = node.includes(',') ? node.slice(node.lastIndexOf(',') + 1).trim() : '';
      if (!relevant.has(node)) relevant.set(node, `Osoba ${relevant.size + 1}`);
      rememberSensitive(cls ? node.slice(0, node.lastIndexOf(',')) : node);
      return cls ? `${relevant.get(node)}, ${cls}` : relevant.get(node);
    }
    if (parent === 'Attachments' || (parent && /Attachments$/.test(parent))) {
      if (key === 'Name' || key === 'FileName') {
        const ext = /\.[A-Za-z0-9]{1,6}$/.exec(node)?.[0] ?? '';
        return `priloha-${++attachmentCount}${ext.toLowerCase()}`;
      }
    }
    if (isPeopleParent(parent) && (key === 'Name' || key === 'FullName')) return `Učitel ${++personCount}`;
    // Teaching group names can include a teacher abbreviation. Match the full abbreviation
    // against the known people because it is too short for stem matching.
    if (KEEP_TEXT_PARENTS.has(parent) || key === 'DayDescription' || (parent === 'Groups' && (key === 'Name' || key === 'Abbrev'))) {
      return replacePeopleIn(node);
    }
    if (FREE_TEXT_KEYS.has(key) && parent !== 'Hours') {
      const out = scrambleText(node);
      scrambled.add(out);
      return out;
    }
    return node;
  }

  return {
    /** Anonymises a set of documents together (so pseudonyms and ids match between them). */
    run(documents) {
      Object.values(documents).forEach((d) => collect(d, ''));
      const result = {};
      for (const [name, doc] of Object.entries(documents)) result[name] = scrub(walk(doc, '', ''));
      return result;
    },

    /** Original names and the like that still appear in the output; should be empty. */
    leaks(output, extraSensitive = []) {
      return this.leakLocations(output, extraSensitive).map((l) => l.token).filter((t, i, all) => all.indexOf(t) === i);
    },

    /** Where they appear, as a path of keys (never the text itself), so a leak can be traced to a field. */
    leakLocations(output, extraSensitive = []) {
      const tokens = [...sensitive, ...extraSensitive.map((s) => s.toLowerCase())].filter((t) => t.length >= 4);
      const found = [];
      const visit = (n, where) => {
        if (Array.isArray(n)) return n.forEach((v, i) => visit(v, `${where}[${i}]`));
        if (isObject(n)) return Object.entries(n).forEach(([k, v]) => visit(v, `${where}.${k}`));
        if (typeof n !== 'string') return;
        if (/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i.test(n)) found.push({ token: '[email]', path: where });
        if (/(?:\+\d{1,3}[ \u00a0.-]*)?(?:\d[ \u00a0.-]*){9,}/.test(n)) found.push({ token: '[phone]', path: where });
        if (scrambled.has(n)) return;
        const lower = n.toLowerCase();
        for (const token of tokens) {
          if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(token)}`, 'u').test(lower)) found.push({ token, path: where });
        }
      };
      visit(output, '$');
      return found;
    },
  };
}
