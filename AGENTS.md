# Agent Guidelines

Welcome to the project repository. Any AI agent working on this codebase must adhere to the following workflow instructions and conventions.

## Mandatory Workflow Rules

### 1. Before Starting Work
- **Always read `JOURNAL.md` first.**
- Review the recent entries to understand the latest project context, recent changes, decisions, and ongoing work.

### 2. After Completing Work
- **Always add a new entry to `JOURNAL.md` before concluding the session.**
- The journal entry should:
  - Be placed under the `## Entries` section in reverse chronological order (newest entry at the top).
  - Include the current date (`YYYY-MM-DD`) and a clear header.
  - Briefly but clearly describe everything that was done (what changed, which files were affected, bugs fixed, or features added).
  - Include validation steps performed (e.g. build or test results).

### 3. Versioning
- `package.json` `version` is the single source of truth (`MAJOR.MINOR.PATCH`); Android `versionName` and `versionCode` are derived from it.
- When finishing a user-visible change that will be deployed to web only, bump the **patch** version.
- Any change in `android/` or any new native Capacitor plugin is a **minor** bump (resets patch to 0). Android release bumps are normally done by the owner.
- Keep minor and patch at or below 99.

---

## Project Overview & Conventions

- **Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite, Zustand, Capacitor.
- **Build / Typecheck:** Run `npm run build` (`tsc -b && vite build`) to verify there are no TypeScript or compilation errors after making changes.
- **Code Style:** Follow existing patterns, Material 3 Expressive styling, and keep changes clean and well-scoped.
- **STRICT UI RULE - NO OUTLINES / BORDERS:**
  - **Never add any outlines or borders** (`outline`, `border`, `border-t`, `border-b`, `border-m3-outline-variant`, etc.) to navigation bars, bars, floating docks, rails, cards, or other UI containers.
  - Rely exclusively on Material 3 tonal elevation (`bg-m3-surface-container*`), soft shadows (`shadow-xs`, `shadow-md`, `shadow-2xl`), and backdrop blur (`backdrop-blur-*`), never visible borders or outlines.
- **STRICT DATA RULE - NO HARDCODING DATES OR HOLIDAYS:**
  - **Never hardcode specific calendar dates, holidays, vacations, school breaks, or schedule calendars in code.**
  - Always infer and resolve holiday/break status dynamically from the Bakaláři API payload (`DayType`, `DayDescription`, `atoms`, etc.). Hardcoded dates become stale, cause wrong timetable fallbacks, and break across school years and institutions.
