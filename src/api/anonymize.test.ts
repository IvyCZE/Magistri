import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAnonymizer, scrambleText } from '../../scripts/lib/anonymize.js';

const raw = path.resolve(__dirname, '../../fixtures/bakalari/raw');
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(raw, name), 'utf8'));
const names = ['timetable-actual.json', 'marks.json', 'homeworks.json', 'events.json', 'komens-received.json', 'komens-noticeboard.json'];
const documents = () => Object.fromEntries(names.map((n) => [n, load(n)]));

describe('fixture anonymiser', () => {
  it('removes every teacher name and abbreviation from the output', () => {
    const anonymizer = createAnonymizer();
    const out = anonymizer.run(documents());
    const text = JSON.stringify(out);
    expect(text).not.toContain('Nováková');
    expect(text).not.toContain('Svoboda');
    expect(text).not.toContain('Dvořák');
    expect(anonymizer.leaks(out, ['Nováková', 'Svoboda'])).toEqual([]);
  });

  it('keeps the structure the parsers rely on', () => {
    const out = createAnonymizer().run(documents());
    const original = load('timetable-actual.json');
    const anonymized = out['timetable-actual.json'];
    expect(anonymized.Hours).toEqual(original.Hours);
    expect(anonymized.Days.map((d: any) => [d.Date, d.DayType, d.Atoms.length])).toEqual(
      original.Days.map((d: any) => [d.Date, d.DayType, d.Atoms.length]),
    );
    expect(anonymized.Subjects.map((s: any) => s.Name)).toEqual(original.Subjects.map((s: any) => s.Name));
    expect(out['marks.json'].Subjects[0].Marks.map((m: any) => m.MarkText)).toEqual(load('marks.json').Subjects[0].Marks.map((m: any) => m.MarkText));
  });

  it('maps an id to the same replacement everywhere', () => {
    const out = createAnonymizer().run(documents());
    const atom = out['timetable-actual.json'].Days[0].Atoms[0];
    const teacher = out['timetable-actual.json'].Teachers.find((t: any) => t.Id === atom.TeacherId);
    const subject = out['timetable-actual.json'].Subjects.find((s: any) => s.Id === atom.SubjectId);
    expect(teacher).toBeTruthy();
    expect(subject).toBeTruthy();
    expect(atom.TeacherId).not.toBe(load('timetable-actual.json').Days[0].Atoms[0].TeacherId);
  });

  it('scrambles text but keeps length, spacing and HTML tags', () => {
    const input = '<p>Schůzky se konají <b>15. 10.</b>&nbsp;ve škole</p>';
    const out = scrambleText(input);
    expect(out).toHaveLength(input.length);
    expect(out.match(/<[^>]+>/g)).toEqual(input.match(/<[^>]+>/g));
    expect(out).toContain('&nbsp;');
    expect(out).not.toContain('Schůzky');
    expect(scrambleText(input)).toBe(out);
  });

  it('drops contact data and renames attachments', () => {
    const out = createAnonymizer().run({
      m: { Messages: [{ Id: 'A', Email: 'teacher@example.invalid', Attachments: [{ Id: 'F1', Name: 'Zadání Karel.PDF' }] }] },
    });
    expect(out.m.Messages[0].Email).toBeUndefined();
    expect(out.m.Messages[0].Attachments[0].Name).toBe('priloha-1.pdf');
  });

  it('finds people under any people-like key and in declined forms inside kept text', () => {
    const anonymizer = createAnonymizer();
    const out = anonymizer.run({
      e: {
        Events: [{ Id: 'E', Participants: [{ Id: 'P1', Name: 'Mgr. Dana Příkladová' }, { Id: 'P2', Name: 'Alex Ukázka' }], Title: 'Výlet' }],
        Days: [{ Atoms: [{ Change: { Description: 'Suplování: Příkladové (Pří) místo Alexe Ukázky', Note: 'Dana' } }] }],
        Misc: { Remark: 'Zeptejte se paní Příkladové', Subject: 'Matematika' },
      },
    });
    const text = JSON.stringify(out);
    for (const word of ['Příklad', 'Dana', 'Alex', 'Ukázk']) expect(text).not.toContain(word);
    expect(out.e.Misc.Subject).toBe('Matematika');
    expect(anonymizer.leaks(out)).toEqual([]);
  });

  it('reports where a leftover name sits, without quoting it', () => {
    const anonymizer = createAnonymizer();
    anonymizer.run({ a: { Teachers: [{ Name: 'Karel Dvořák' }] } });
    const locations = anonymizer.leakLocations({ x: { Key: 'řekl Dvořák' } });
    expect(locations).toEqual([{ token: 'dvořák', path: '$.x.Key' }]);
  });

  it('removes link targets from message HTML', () => {
    const out = scrambleText('<p><a href="https://docs.google.com/forms/d/e/SECRET/viewform" target="_blank">odkaz</a> <img src=\'x.png\'></p>');
    expect(out).not.toContain('SECRET');
    expect(out).toContain('href="#"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("src=\"#\"");
  });

  it('removes private HTML attributes, including unquoted and entity-encoded values', () => {
    const anonymizer = createAnonymizer();
    const out = anonymizer.run({ message: { Text: '<!-- teacher@example.invalid --><p title="teacher&#64;example.invalid" aria-label="+420 555 123 456"><a href=mailto:teacher@example.invalid title=teacher@example.invalid>Contact</a><span data-account="private-id">Phone</span></p>' } });
    const json = JSON.stringify(out);
    for (const value of ['example.invalid', '555 123 456', 'private-id', 'title=', 'aria-label=', 'data-account=', '<!--']) expect(json).not.toContain(value);
    expect(anonymizer.leaks(out)).toEqual([]);
  });

  it('scrubs contact details in unknown fields and reports leftover contact data without printing it', () => {
    const anonymizer = createAnonymizer();
    const out = anonymizer.run({ m: { UnknownField: 'teacher@example.invalid +420 555 123 456' } });
    expect(JSON.stringify(out)).not.toContain('example.invalid');
    expect(JSON.stringify(out)).not.toContain('555 123 456');
    expect(anonymizer.leakLocations({ Text: '<a title="teacher@example.invalid">x</a>' })).toContainEqual({ token: '[email]', path: '$.Text' });
  });

  it('replaces teacher abbreviations in group names and keeps group and cycle ids pointing at their records', () => {
    const anonymizer = createAnonymizer();
    const out = anonymizer.run({
      t: {
        Teachers: [{ Id: 'teacher-a', Abbrev: 'Xa', Name: 'Učitel Ukázka' }, { Id: 'teacher-b', Abbrev: 'Xb', Name: 'Učitelka Vzorová' }],
        Groups: [{ Id: 'group-a', Name: 'Ukázková skupina Xa', Abbrev: '9.Z angličtina' }, { Id: 'group-b', Name: 'Ukázková skupina Xb;Xb+Xa' }],
        Cycles: [{ Id: '1', Name: 'Lichy tyden' }],
        Days: [{ Atoms: [{ GroupIds: ['group-a', 'group-b'], CycleIds: ['1'] }] }],
      },
    });
    const text = JSON.stringify(out.t.Groups);
    expect(text).not.toMatch(/\b(Xa|Xb)\b/);
    expect(out.t.Groups[0].Abbrev).toBe('9.Z angličtina');
    expect(out.t.Days[0].Atoms[0].GroupIds).toEqual(out.t.Groups.map((g: any) => g.Id));
    expect(out.t.Days[0].Atoms[0].CycleIds).toEqual([out.t.Cycles[0].Id]);
  });

  it('keeps the class of a relevant person and drops the person', () => {
    const anonymizer = createAnonymizer();
    const out = anonymizer.run({ e: { Events: [{ Id: 'E', Relevant: [{ RelevantName: 'Novák Jan, 3.C' }, { RelevantName: 'Novák Jan, 3.C' }] }] } });
    const [a, b] = out.e.Events[0].Relevant.map((r: any) => r.RelevantName);
    expect(a).toBe('Osoba 1, 3.C');
    expect(b).toBe(a);
  });
});
