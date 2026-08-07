# Quarantined legacy web demo

This Create React App demo is unsupported. It stores plaintext passwords in
browser `localStorage`, so it must never receive real credentials or real
finance data. It has no deploy path, is not a migration source, and is retained
only for unsafe local archaeology.

Repository `start` and local-build scripts require this exact acknowledgement:

```bash
FINOVA_ALLOW_UNSAFE_LEGACY_WEB=I_UNDERSTAND_PLAINTEXT_PASSWORD_STORAGE npm start
```

The guard protects only the repository scripts. Someone can bypass it by
invoking `react-scripts` manually; that does not make the demo safe or
supported.

This local commit does not disable or update the already-published GitHub Pages
branch, does not clear any browser `localStorage`, and must not be represented
as fixing the live site. Never migrate `finova_users` or `finova_session`. If a
user says historical finance entries matter, recovery must be a separate,
user-directed workflow completed before an authorized shutdown.

Before an iOS release, replace the Pages root with a safe static landing/legal
host or disable Pages, then verify the result anonymously. Do not publish only
the retained legal pages onto the unsafe existing branch: their return links
lead to its root. The repository-root `public/privacy.html`,
`public/terms.html`, and `public/support.html` remain static legal artifacts.
