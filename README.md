# VPS Control Panel

Native App (macOS + Android) zur Verwaltung eines einzelnen VPS mit Coolify, Hestia, GitHub und SSH-Terminal.

## Stack

- Tauri 2 + React 19 + Vite + TypeScript
- Tailwind CSS v4
- Rust-Backend mit `russh` (SSH), `reqwest` (HTTP), `tauri-plugin-stronghold` (Vault)
- xterm.js für Terminal-UI
- Octokit-äquivalente REST-Calls direkt in Rust (kein JS-Octokit im Webview)

## Tabs

1. **Dashboard** — VPS-Stats + Service-Status (Auto-Refresh 30s)
2. **Coolify** — Apps, Services, Datenbanken, Server; App-Detail + Deploy + Logs
3. **Hestia** — Web-Domains, DNS-Records, Mail-Accounts, Datenbanken
4. **GitHub** — PR-Inbox, Issues, Notifications, Repos; PR-Detail + Review + Merge
5. **Terminal** — xterm.js, multi-tab pro SSH-Profil, Default-User root + zweiter User

## Setup

Voraussetzungen (auf macOS):
- Node 24+ (LTS)
- pnpm 11+
- Rust 1.85+ via rustup
- Android Studio mit NDK 27.0.12077973
- Java 21 (im Android-Studio-JBR)
- Xcode CLI Tools

Env-Variablen in `~/.zshrc`:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$HOME/.cargo/bin:$PATH"
```

## Entwicklung

```bash
pnpm install
pnpm tauri dev          # Dev-Modus mit Hot-Reload
```

## Build

```bash
# macOS (lokal installierbares .app + .dmg)
pnpm tauri build

# Android (Debug-APK, aarch64)
pnpm tauri android build --debug --target aarch64
```

Artefakte:
- macOS: `src-tauri/target/release/bundle/macos/VPS Control Panel.app`
- macOS DMG: `src-tauri/target/release/bundle/dmg/VPS Control Panel_0.1.0_aarch64.dmg`
- Android: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

## Erste Schritte nach Build

1. App starten
2. Tab **Settings** öffnen
3. Profile anlegen:
   - **SSH:** zwei Profile (`root@<vps>` + `<user>@<vps>`), Key-Pfad oder Key-Inhalt
   - **Coolify:** Base-URL + API-Token (Scopes: read, write, deploy)
   - **Hestia:** Base-URL + API-Key
   - **GitHub:** Fine-grained PAT (Contents, Issues, PRs, Notifications)
4. Im Terminal-Tab `hermes` eintippen für AI-Chat
5. Dashboard zeigt Live-Status aller Services
