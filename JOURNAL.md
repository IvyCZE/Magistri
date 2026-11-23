# Development Journal

Contributors record changes and validation here. Insert new entries directly
under the Entries heading with a date and short title.

## Entries

### [2026-11-23] Prepared Magistři v1.7.0

- The web and Android clients request a wider homework date range. The homework page groups active, overdue, and closed tasks by week. Badges and widgets count active tasks, and Android initializes the expanded notification history silently.
- Komens displays attachment counts on the message list and places downloads at the top of each message. Image previews use a centered Material morphing loader and only display supported raster images. The message list remembers its selected tab.
- Active navigation labels stay readable with wallpaper-derived colors in the bar, dock, and rail.
- The build, public-file scan, license and palette checks, npm audit, 205 web and proxy tests, and 129 Android unit tests passed. One optional capture test was skipped. Chromium verified homework tabs and grouping, message tab restoration, downloads, preview alignment and dismissal, and contrast with a simulated wallpaper palette.

### [2026-11-23] Added the README screenshot gallery

- Updated the opening description and added six cropped demo screenshots above the features and architecture section. The gallery uses two centered rows of three. The PNGs exclude the device notification bars and embedded metadata.
- Validated the gallery structure and image paths, public-file and notice checks, web build, and release APK checksum. All 72 built web files matched the signed APK.

### [2026-11-23] Prepared Magistři v1.6.2 for public release

- Added setup, contributor, Android, and deployment documentation. Documented the Android third-party licenses and provided the upstream desugaring source and license links.
- Used synthetic fixtures and examples for shared tests. The publication check rejects staged school-derived captures, API probe scripts, and common credential and signing files.
- The clean dependency install, npm audit, public-file and license notice checks, and web build passed. The web and proxy suite passed with 198 passing and one skipped. Android passed all 128 unit tests and assembled a debug APK.
- The signed APK passed signature and checksum verification. All 72 built web files matched the signed APK byte for byte.
