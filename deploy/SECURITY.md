# Web deployment

The Docker image serves the static app with Nginx and runs a small Node
proxy on **127.0.0.1:3001** inside the container. Use the provided image entry
point; copying nginx.conf into a plain Nginx image is insufficient. Only expose
the Nginx port. Put HTTPS termination in front of it.

`/api-proxy/<school-host[:port]>/<optional-prefix>/api/...` automatically
accepts schools verified against **Bakaláři's official directory** at
`sluzby.bakalari.cz`. This includes schools with their own domain, HTTPS port,
and URL prefix such as `/bakaweb/`. No per-school environment variables or
manual allowlist are required.

The browser keeps the public school ID returned by the normal school search.
The server verifies the ID against `/api/v1/school/<id>` and matches the full
school base URL, including its port and path, before forwarding credentials.
Directory searches also populate the verified cache. A browser-provided ID
or URL is never itself trusted.

Older saved sessions and directly entered URLs are resolved automatically
through `/api-school/resolve`. If necessary, the server looks through the
municipality school lists with bounded concurrency and shares the resulting
catalog between requests. This initial lookup can take longer than a normal
API call; the browser performs it before starting the school request timeout.
Directory responses/approvals are refreshed after 24 hours. Previously verified
schools can use their cached approval for up to seven days during a temporary
directory outage; an unknown school is never approved on a failed lookup. Public IDs and
URLs are cached in `.cache/school-directory.json` inside the server working
directory; no credentials or school-account records are stored there. The
cache is ignored by Git and excluded from Docker's build context. Existing
cache entries survive process/container restarts. A new container can rebuild
the cache automatically, using browser-persisted school IDs for fast lookups.

Native Android requests still go directly to the school and do not use this
web proxy.

The proxy checks every DNS answer, rejects private/reserved addresses, and pins
the connection to a validated public IPv4 address while retaining the original
TLS hostname and certificate verification. Like the previous Nginx resolver,
it uses IPv4; IPv6-only schools are not supported. Redirects are rejected:
configure the school's final HTTPS API origin rather than disabling the checks.

The default per-client limit is 240 requests/minute, with a 1 MiB request limit,
50 MiB response limit, 25-second inactivity timeout and 60-second upstream
deadline. Cookies, wildcard CORS headers, and upstream redirects are not relayed.
Non-JSON responses are served as downloads with a sandbox policy so school
HTML/SVG cannot execute in the app's origin. School responses are marked
`no-store`; Nginx proxy buffering and API access
logging are disabled. If a trusted reverse proxy sits in front of the container,
configure Nginx's real-IP handling for its exact addresses before relying on
per-user rate limits; otherwise limits apply to that reverse proxy's address.

Upstream hosting/CDN logs and retention are outside these repository defaults.
Review them and the privacy policy for your deployment. Do not log bodies,
Authorization headers, credentials, or private school responses. Keep your
Node/Nginx base images updated and restrict container egress at the network
layer as defense in depth.
