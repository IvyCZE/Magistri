# Android development and releases

The Capacitor project lives in `android/`. The display name and application ID
(`yt.ivy.vistaria`) come from `app.config.json`. The Kotlin sources use the
`cz.prehled.app` package.

## Build and test

Use JDK 21 and Android SDK 36. Set `ANDROID_HOME` to your SDK installation or
let Android Studio create `android/local.properties`.

```sh
npm ci
npm run build
npx cap sync android
cd android
./gradlew testDebugUnitTest assembleDebug
```

The TypeScript and Kotlin parser tests use the same synthetic JSON fixtures
under `fixtures/bakalari`. Test the installed debug build with demo mode
before connecting it to a school account.

## Prepare a release

`package.json` is the version source. Gradle computes the Android version code
as `major × 10000 + minor × 100 + patch`. Follow the version rules in
[AGENTS.md](AGENTS.md). From a clean checkout, the release helpers update
the version and create a local commit and tag.

1. Run the web checks and regenerate or verify the third-party notices.
2. Build the web bundle, sync Capacitor, and run the Android unit tests.
3. Configure release signing in the ignored `android/keystore.properties`
   using `android/keystore.properties.example`. Keep the keystore and its
   passwords outside the repository.
4. Run `./gradlew assembleRelease` in `android/` for a signed APK, or
   `./gradlew bundleRelease` for a Play Store bundle.
5. Test the signed build on a device. For a GitHub APK release, include its
   SHA-256 checksum and link the matching tagged source.

The [privacy policy](https://storage.ivy.yt/vistaria/privacypolicy) is published
from `public/privacypolicy.html`.
