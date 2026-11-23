# Reporting a vulnerability

Please report security issues privately to **magistri@ivy.yt**, the contact
published in the app's privacy policy. Include the affected version, expected
behavior, reproduction steps using synthetic data, and likely impact.

Do not put school credentials, tokens, messages, attachments, or student data
in public issues or pull requests. If a credential has been exposed, revoke
or rotate it at the issuing service. Removing the current file does not remove
older copies from Git history.

Security fixes target the latest release. This project does not promise a
response deadline or security support for older versions.

The supplied web proxy verifies school URLs automatically against Bakaláři's
official school directory, including custom domains, ports and URL prefixes. HTTPS certificate verification and public IPv4 checks are
required on each connection; redirects are rejected. See
[deployment notes](deploy/SECURITY.md) before self-hosting.
