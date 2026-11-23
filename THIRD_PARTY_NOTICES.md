# Third-party components

Magistři's original project code is GPL-3.0-only. Its dependencies retain
their own licenses. Full notices for the installed production npm packages
and Workbox service-worker components are generated in
[public/third-party-notices.txt](public/third-party-notices.txt), served with
the web app and included in the Capacitor web bundle.

Run `npm run licenses` after dependency changes. `npm run licenses:check`
checks that the committed notices match the lockfile and installed packages.
The inventory includes the Outfit and Plus Jakarta Sans font OFL notices,
Roboto Slab's Apache license, Lucide/Feather notices, DOMPurify, and the
Apache-licensed Material shapes port.

## Android dependencies

- AndroidX/Jetpack, Kotlin, and OkHttp include components under Apache-2.0.
  The checked-in Gradle wrapper and generated Glance layouts retain their
  Apache notices.
- Android core library desugaring uses `com.android.tools:desugar_jdk_libs:2.1.5`.
  Google Maven declares GPL version 2 with the Classpath Exception.
  Individual files retain their upstream licenses and additional notices.
  [Google Maven license metadata](https://dl.google.com/dl/android/maven2/com/android/tools/desugar_jdk_libs/2.1.5/desugar_jdk_libs-2.1.5.pom),
  [upstream 2.1.5 source tree](https://github.com/google/desugar_jdk_libs/tree/73170c345e6a762fc6a1f0301bb15218850023ef),
  [license text](https://github.com/google/desugar_jdk_libs/blob/73170c345e6a762fc6a1f0301bb15218850023ef/LICENSE),
  [additional licensing information](https://github.com/google/desugar_jdk_libs/blob/73170c345e6a762fc6a1f0301bb15218850023ef/ADDITIONAL_LICENSE_INFO).
- AndroidX Glance bundles Protocol Buffers under BSD-3-Clause. The APK
  retains the notice at
  `META-INF/androidx/glance/glance-appwidget-external-protobuf/LICENSE.txt`.
  [Protocol Buffers license](https://github.com/protocolbuffers/protobuf/blob/main/LICENSE).

Keep the original notices for bundled Android dependencies when redistributing
the app.

Development-only image tooling can include LGPL-licensed native image
libraries; this does not change the project code's license. If redistributing
those tools or a build environment, retain their own notices and comply with
their licenses as well.
