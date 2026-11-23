# Threat model for Magistři

## System overview
Unofficial client for the Czech Bakaláři school information system used by students and parents (grades, timetable, homework, Komens messages, absence excuses). Builds on the repository's `SECURITY.md` and `deploy/SECURITY.md`.

## Components
| Name | Code | Notes |
|---|---|---|
| Web client | `src/` (React/Vite PWA: `src/api/client.ts`, `src/stores/`, `src/pages/`, `src/utils/textUtils.ts`) | Runs in the browser and inside the Android WebView. |
| School proxy | `server/proxy.mjs`, `server/school-directory.mjs`, `server/start.mjs` | Node HTTP service on loopback 127.0.0.1:3001. `/api-proxy/<host>/.../api/...` makes verified HTTPS requests to schools; `/api-sluzby/` queries the official directory; `/api-school/resolve` resolves URLs through the local directory registry/cache. |
| Deployment | `Dockerfile`, `nginx.conf`, `deploy/proxy-security.conf`, `docker-compose.yml`, `.github/workflows/ci.yml` | Nginx serves the SPA and fronts the proxy; CI builds and smoke-tests. |
| Android native | `android/app/src/main/java/cz/prehled/app/` (`auth/`, `sync/`, `bridge/`, `notify/`), `AndroidManifest.xml`, `capacitor.config.ts` | Capacitor shell; native token store (Keystore), WorkManager sync, attachment downloads, `PrehledNativePlugin` JS bridge, `prehled://open` deep links. |
| Android widgets | `android/app/src/main/java/cz/prehled/app/widget/`, `data/` | Glance widgets fed from the local snapshot store. |

## Trust boundaries and entry points
- Public browser connection → deployment-provided HTTPS termination → Nginx (HTTP port 80) → Node proxy (loopback HTTP port 3001). TLS termination must be supplied by the hosting setup; the repository does not configure it or establish encryption for every infrastructure hop. Any client can call `/api-proxy/`, `/api-sluzby/`, `/api-school/resolve` (rate limit 240/min per IP; 1 MiB request, 50 MiB response).
- Proxy → school servers: only hosts verified against `sluzby.bakalari.cz` directory; DNS answers checked against private ranges and pinned; TLS verified; redirects rejected.
- School data → shared React client (browser and Android WebView): JSON API data and Komens message HTML. HTML is sanitized by the DOMPurify allowlist in `sanitizeMessageHtml` and rendered in `MessageDetailPage.tsx`.
- Browser attachment downloads → web proxy: non-JSON responses are served as `application/octet-stream` downloads with a sandbox CSP and `nosniff`. These headers protect the web proxy response.
- Android → school: requests and attachment downloads go directly to school servers. Native download/storage and file-opening/URI-permission handling are separate boundaries; the web proxy attachment headers do not apply to this path.
- WebView JS → native: `PrehledNativePlugin` methods (`getTokens`, `setTokens`, attachments, palette, icon...).
- Other Android apps → app: exported `MainActivity` with `prehled://open/<screen>?id=` deep links; exported widget receivers; FileProvider (not exported, grants URI permissions; `external-path .` and `cache-path .`).

## Assets
- Bakaláři credentials (username/password at login) and access/refresh tokens (web: `localStorage`; Android: Keystore-encrypted native store).
- Students' private data: grades, absences, messages and attachments, timetable.
- The hosted proxy itself (must not become an open relay / SSRF into internal networks).

## Attacker profiles
- Anonymous internet user abusing the hosted proxy (SSRF, open relay, credential capture, DoS).
- Malicious content inside school data (message HTML, attachment names/content, API fields) rendered by the client.
- An ordinary, unprivileged third-party app on the same non-rooted Android phone is in scope (deep links, exported components, shared files). The attacker is not assumed to already have root or system privileges or control of the Android operating system.
- Network attacker on public network links: the default proxy validates HTTPS certificates for school/directory requests, Android disables cleartext traffic, and the public web connection requires deployment-provided HTTPS termination. Nginx and the loopback proxy use HTTP inside the container; do not assume that every hosting/network hop is encrypted.
- Content authored by school users, including Komens message bodies and attachments, is in scope.

## Existing controls
See `deploy/SECURITY.md`: directory-verified schools, DNS pinning and private-range blocking, TLS verification, no redirects, no cookies/CORS relayed, `no-store`, access logging disabled, sandbox CSP on web-proxied responses. DOMPurify allowlist and link-protocol filter for message HTML. Android: `allowBackup=false`, `usesCleartextTraffic=false`, `webContentsDebuggingEnabled=false`, Keystore-backed tokens.

## Out of scope / accepted risk
- Stolen devices and attacks requiring physical access to or physical control of the user's device are out of scope.
- Attacks requiring pre-existing root/system privileges or an already compromised Android operating system are out of scope. This does not exclude attacks by an ordinary app that can exploit the application without those privileges.
- Compromised Bakaláři school servers are out of scope: findings that require the school server itself to be malicious or compromised are accepted risk.
