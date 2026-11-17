# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

awDOC is a word processor (in the spirit of Word / Google Docs) built on TipTap (ProseMirror), TypeScript + Vite, shipped as a web app, an Electron desktop app (Linux AppImage/deb, Windows NSIS) and an Android app (Capacitor, APK). It is the sibling of awPDF and awCELL and follows the drAW family's conventions. The UI, test names, docs (README, `docs/yol-haritasi.md`) and messages are in **Turkish** — keep new user-facing strings and docs in Turkish.

Status: stage 1 (skeleton) done 2026-11-17. The web app is live at `madematik.com/awDOC/` since 2026-11-17 (the user's request; `.env` is a copy of awPDF's with `FTP_REMOTE_DIR=/public/awDOC`); no package release yet. **The user's rule (2026-11-17): commit only — no push unless asked, and no release, tag, deploy or Play upload until every stage in the roadmap is done.** The plan, the user's decisions and the stages are in `docs/yol-haritasi.md`; record new requests there with a date and do not implement any item until the user explicitly asks.

## Decisions (2026-11-17, the user's)

- **Name** awDOC ("Word" is Microsoft's trademark; Play risk). **App ID** `com.madematik.awdoc` is permanent (Play Store).
- **Focus:** a general word processor as the base, with teacher / exam-paper features as what sets it apart (formula editor and question blocks first). It must stay fully usable for general writing; teacher tools must not clutter a plain document.
- **View:** continuous (pageless) first; A4 page view comes in stage 3.
- **Formats:** `.docx`, `.odt`, `.doc` come later, as adapters in `src/formats/`; the editor must not need changes for them.
- **Stack and releases:** the family's (TypeScript + Vite, Electron, Capacitor); public repository `github.com/200709078/awDOC`, MIT; packages only on GitHub Releases; shared Android signing key.

## Commands

Node >= 22.13 (`.nvmrc`: 22).

```bash
npm ci
npm run dev              # Vite dev server
npm run typecheck        # tsc for src/ and for electron/ (tsconfig.electron.json)
npm run build            # typecheck + compile electron shell + vite build → dist/, dist-electron/
npm test                 # Playwright (Chromium); starts Vite dev server on 127.0.0.1:4176
npx playwright test tests/files.spec.ts       # single file
npm run test:electron    # build, then open the app with an .awd from the command line, edit, Ctrl+S (needs a graphical session)
npx electron-builder --dir && AWDOC_ELECTRON_EXECUTABLE=$PWD/release/linux-unpacked/awdoc node scripts/test-electron.mjs   # same on the packaged app
npm run electron:dev     # Electron against the Vite dev server
npm run dist:linux | dist:win
npm run android:sync     # build + copy dist/ into android/ (Capacitor)
npm run android:apk      # release APK; signed when ANDROID_KEYSTORE* env vars are set
npm run deploy           # build + FTP upload to public_html/public/awDOC (`-- --dry-run` only lists); live site: only when the user asks
bash scripts/icons.sh    # every icon from public/img/app-icon.svg (Inkscape + ImageMagick)
```

Ports: drAW2D/drAW3D 4173, awPDF 4175, awDOC 4176, awCELL 4177 — awDOC's tests may run beside the others. VS Code sets `ELECTRON_RUN_AS_NODE=1`; the scripts remove it before starting Electron.

Phone: a debug build installs as `com.madematik.awdoc.deneme` ("awDOC Deneme") beside a Play copy: `npm run build && npx cap sync android && (cd android && ./gradlew assembleDebug) && adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. Tried on a phone 2026-11-17: typing with the Turkish keyboard and its suggestions, Yazı ▾ keeping the keyboard open, saving through the system screen, Kaydet writing the same file again, opening, the back button.

## Architecture

- `src/main.ts` mounts the desktop title bar and calls `startApp` (`src/app/app.ts`, the composition root: platform, theme, editor, session, toolbar, Android back button, `beforeunload` guard).
- **Editor** (`src/editor/editor.ts`): TipTap `StarterKit` (headings 1–3, links that do not open on click) + `TextAlign`. A new feature is a TipTap extension added here. `replaceDocument` puts a new `EditorState` in the view so undo has no history from the previous document; `documentNode` builds and checks the node first, so a file with unknown content fails before anything changes.
- **Formats** (`src/formats/`): the document is always the editor's ProseMirror JSON. A `DocumentFormat` has `read`/`write`, extensions, MIME and `keepsEverything` (false for `.txt`: "Kaydet" then asks to save an `.awd` instead of writing over the text file). `formats/index.ts` is the single list; pickers, `accept` and the save type come from it. Electron (`electron/files.ts` `DOCUMENT_EXTENSIONS`) and Android (`AwDocNativePlugin.fileType`, the manifest's intent filter) keep their own short allowlists: update them with a new format.
- **`.awd`** (`formats/awd.ts`): UTF-8 JSON `{ format: "awDOC", version: 1, app, document }`. A newer `version` is refused with a message, never half-read. Pictures may later make it a ZIP container (v2); `read` would tell the two apart by the first byte.
- **Session** (`src/app/session.ts`): name, format, `FileRef`, dirty flag. Open reads and checks the file before asking about unsaved changes. Save writes the same file through `Platform.write`; when that returns false or throws, and for formats that do not keep everything, it falls back to `saveAs` (always `.awd`).
- **Platform** (`src/platform/`): `Platform` is everything that differs; files are read whole (`OpenedFile { name, data, ref }`). `FileRef` is opaque: a `FileSystemFileHandle` in Chromium (`queryPermission`/`requestPermission` readwrite before writing), the shell's number on the desktop, a content URI on Android. Browsers without file handles read through `#fileInput` and save to the downloads (no `ref`, so every save asks again).
- **Toolbar** (`src/ui/toolbar.ts`, tools in `src/tools/`): the family's style (2026-11-10). `ToolbarItem` is a `Tool` or a `ToolGroup` (▾). Groups open a small window under their button; `staysOpen` (Yazı) keeps it open for several choices; `iconOf` shows the state (alignment, heading); `marksActive` puts a dot on the group's button. Items that do not fit move, from the last back, into the ☰ menu (✕ while open), where groups open in place (accordion, one at a time) and icon-only tools (`iconOnly`: B/I/U/S, alignment) stay icons while the others show their names. Hakkında (`inMenu`) is always last in the menu. Buttons prevent `mousedown` so the editor keeps its focus and selection (on Android the keyboard stays open). App shortcuts (`ctrl+n/o/s/p`, `ctrl+shift+s`, `f11`) run in the capture phase ahead of the editor (TipTap's own Ctrl+Shift+S, strike, never fires); editor shortcuts (Ctrl+B…) are TipTap's and only shown in hints (`keys`). The document's name sits at the row's end; below 520 px it is hidden and Kaydet's dot (`isMarked`) shows unsaved changes.
- **Theme:** the dark theme colours the interface only; the paper stays white.
- **Print:** `@media print` shows only the document (`@page` A4, 2 cm / 2.5 cm margins); Android prints the WebView through the plugin.
- `electron/main.ts`: shell only, as awPDF's: `awdoc://app/` custom scheme with a CSP and no network, `sandbox`, `contextIsolation`, frameless window with the renderer's title bar, single instance (a second start hands its file over), `will-prevent-unload` asks before closing with unsaved changes. `electron/files.ts`: reads whole files (200 MB limit), writes through a temporary file then `rename`, `files:save-as` shows the save dialog; the page never learns a path. `electron/screen-keyboard.ts` is drAW's service (tested in `tests/screen-keyboard.spec.js`).
- `android/`: Capacitor 8 project taken from awPDF. `AwDocNativePlugin.java`: `pickFile` (`ACTION_OPEN_DOCUMENT`, any type, persistable read+write permission), `readFile` in chunks, `appendOutput` + `writeFile` (writes over the source with "wt"; a `SecurityException` answers `written: false`), `saveFile` (`ACTION_CREATE_DOCUMENT`, keeps the permission and returns the URI), print, full screen, system bar colours, back button. The app asks for **no permissions** (INTERNET removed in the manifest); do not add one without the user.
- Icons: `public/img/app-icon.svg` (the family style: blue A, red W, a page with a folded corner, DOC below, letters placed like awPDF's PDF); `scripts/icons.sh` makes the rest.

## Releases

Same as the siblings: `.github/workflows/release.yml` and `scripts/release-assets.mjs` are byte-identical copies shared with drAW, drAW2D, drAW3D, awPDF and awCELL — change all six together. New release: `npm version patch`, push, then the tag; ask the user first (no release permission for awDOC yet). Asset names have no version: `awDOC-linux-amd64.deb`, `awDOC-linux-x86_64.AppImage`, `awDOC-win-x64.exe`, `awDOC-android.apk`; the AAB is the `play-Android` artifact. The four Android signing secrets are set in the repository (2026-11-17). The privacy page is `public/gizlilik.html` (to be live at `madematik.com/awDOC/gizlilik.html`); a change that collects or sends anything must update it.

## Tests

Playwright specs in `tests/`: `formats.spec.ts` imports `src/formats` in Node (sets `__APP_VERSION__` first); `editor.spec.ts` (typing, marks, groups, unsaved-changes dialog, undo after "Yeni"), `toolbar.spec.ts` (row, ☰ menu, accordion, panels on screen, theme), `files.spec.ts` (save/open through `tests/helpers/fake-files.ts`, which stands in for `showSaveFilePicker` with handles whose prototype is `FileSystemFileHandle`), `about.spec.ts`. `dist/`, `dist-electron/`, `release/` are build outputs and not committed.
