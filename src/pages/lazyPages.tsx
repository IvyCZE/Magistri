import React, { createElement, type ComponentProps, type ComponentType } from 'react';

// Only the home screen ships in the entry chunk. Every other screen is its own
// chunk, so the first render does not parse code the user may never open.
//
// The screens are not wrapped in React.lazy: once a chunk is loaded, lazy still suspends
// for one more round trip on first use, which shows as a blank gap. The wrapper below renders
// a loaded screen synchronously and only suspends while the chunk is really missing.
const loaders = {
  MarksPage: () => import('./MarksPage').then((m) => m.MarksPage),
  TimetablePage: () => import('./TimetablePage').then((m) => m.TimetablePage),
  HomeworkPage: () => import('./HomeworkPage').then((m) => m.HomeworkPage),
  MessagesPage: () => import('./MessagesPage').then((m) => m.MessagesPage),
  EventsPage: () => import('./EventsPage').then((m) => m.EventsPage),
  AbsencePage: () => import('./AbsencePage').then((m) => m.AbsencePage),
  SubstitutionsPage: () => import('./SubstitutionsPage').then((m) => m.SubstitutionsPage),
  SubjectsPage: () => import('./SubjectsPage').then((m) => m.SubjectsPage),
  TeachingPage: () => import('./TeachingPage').then((m) => m.TeachingPage),
  SettingsPage: () => import('./SettingsPage').then((m) => m.SettingsPage),
  LoginPage: () => import('./LoginPage').then((m) => m.LoginPage),
  MessageDetailPage: () => import('./MessageDetailPage').then((m) => m.MessageDetailPage),
  NewMessagePage: () => import('./NewMessagePage').then((m) => m.NewMessagePage),
};

const components = new Map<string, ComponentType<any>>();
const failed = new Set<string>();

function screenOf<K extends keyof typeof loaders>(name: K): React.FC<ComponentProps<Awaited<ReturnType<(typeof loaders)[K]>>>> {
  const Screen = (props: ComponentProps<Awaited<ReturnType<(typeof loaders)[K]>>>) => {
    const Component = components.get(name);
    if (!Component) {
      if (failed.has(name)) throw new Error(`Screen ${name} failed to load`);
      throw load(name);
    }
    return createElement(Component, props as object);
  };
  Screen.displayName = name;
  return Screen;
}

export const MarksPage = screenOf('MarksPage');
export const TimetablePage = screenOf('TimetablePage');
export const HomeworkPage = screenOf('HomeworkPage');
export const MessagesPage = screenOf('MessagesPage');
export const EventsPage = screenOf('EventsPage');
export const AbsencePage = screenOf('AbsencePage');
export const SubstitutionsPage = screenOf('SubstitutionsPage');
export const SubjectsPage = screenOf('SubjectsPage');
export const TeachingPage = screenOf('TeachingPage');
export const SettingsPage = screenOf('SettingsPage');
export const LoginPage = screenOf('LoginPage');
export const MessageDetailPage = screenOf('MessageDetailPage');
export const NewMessagePage = screenOf('NewMessagePage');

const screenLoader: Record<string, keyof typeof loaders> = {
  marks: 'MarksPage',
  timetable: 'TimetablePage',
  homework: 'HomeworkPage',
  messages: 'MessagesPage',
  infochannel: 'MessagesPage',
  'message-detail': 'MessageDetailPage',
  'new-message': 'NewMessagePage',
  events: 'EventsPage',
  absence: 'AbsencePage',
  substitutions: 'SubstitutionsPage',
  subjects: 'SubjectsPage',
  teaching: 'TeachingPage',
  settings: 'SettingsPage',
  login: 'LoginPage',
};

const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

function load(name: keyof typeof loaders): Promise<void> {
  if (loaded.has(name)) return Promise.resolve();
  let promise = pending.get(name);
  if (!promise) {
    promise = loaders[name]().then(
      (component) => {
        components.set(name, component as ComponentType<any>);
        loaded.add(name);
      },
      () => {
        // The error boundary shows the failure; opening the screen again retries the fetch.
        failed.add(name);
        pending.delete(name);
      },
    );
    pending.set(name, promise);
  }
  return promise;
}

/** True when the screen's code is already in memory, so rendering it cannot suspend. */
export function isScreenLoaded(screen: string): boolean {
  const name = screenLoader[screen];
  return !name || loaded.has(name);
}

/** Resolves when the screen's code is in memory (also after a failed fetch, so a screen never gets stuck). */
export function loadScreen(screen: string): Promise<void> {
  const name = screenLoader[screen];
  if (!name) return Promise.resolve();
  if (!pending.has(name)) failed.delete(name);
  return load(name);
}

const PRELOAD_ORDER: Array<keyof typeof loaders> = [
  'TimetablePage',
  'MarksPage',
  'MessagesPage',
  'HomeworkPage',
  'SettingsPage',
  'MessageDetailPage',
  'EventsPage',
  'SubstitutionsPage',
  'AbsencePage',
  'SubjectsPage',
  'TeachingPage',
  'NewMessagePage',
];

/**
 * Loads the signed-in screens one after another right after the first screen is drawn, most used first,
 * with a short pause between them so the main thread stays free for touch and scrolling.
 */
export function preloadPages(): void {
  let index = 0;
  const next = () => {
    if (index >= PRELOAD_ORDER.length) return;
    const name = PRELOAD_ORDER[index++];
    void load(name).then(() => setTimeout(next, 60));
  };
  setTimeout(next, 250);
}
