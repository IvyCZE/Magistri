# Contributing to Magistři

Use Node 22.12+ on the Node 22 release line, Node 24, or Node 26 and later. The exact dependency
versions are recorded in package-lock.json.

```sh
npm ci
npm run dev
npm test
npm run build
npm run check:public
npm run licenses:check
npm audit
```

The dev server binds to localhost. For testing from another device, use an
explicit `--host` value on a trusted network and set `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`
if a development hostname is needed. Never disable Vite's host checks.

The app includes demo mode for development without a school account. Keep
credentials, signing keys, environment files, screenshots with student data,
and API captures out of commits. Use synthetic fixtures for shared tests.
Use invented names and example domains in test data and source comments.
Optional real-school fixtures stay in the Git-ignored `fixtures/bakalari-real/`
directory. The capture script writes outside the repository by default.
Keep account, deployment, and local filesystem details out of the public journal.

Read AGENTS.md and the recent JOURNAL.md entries. Keep changes focused, use
Material tonal surfaces without adding container borders, and infer school
holidays from API metadata. Add a journal entry describing the change and
validation. Follow the existing versioning rules.

When updating dependencies, run `npm run licenses` and include the updated
third-party notices. Explain the problem, behavior change, and validation in
your pull request. Report vulnerabilities through SECURITY.md.

Contributions are accepted under the project's GPL-3.0-only license. Retain
the original Jan Hrudka / IvyCZ copyright notices and third-party notices.

For Android, use JDK 21 and Android SDK 36. Build the web app, run
`npx cap sync android`, then `cd android && ./gradlew testDebugUnitTest assembleDebug`.
Release signing keys are private and are not needed for a debug build.
