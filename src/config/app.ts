import appConfig from '../../app.config.json';

/**
 * The display name of the app. It lives in `app.config.json` at the repository root, which is also
 * read by the Vite config (page title, PWA manifest, privacy page), the Capacitor config and the
 * Android Gradle build (launcher name, notification texts, application id).
 */
export const APP_NAME: string = appConfig.appName;
