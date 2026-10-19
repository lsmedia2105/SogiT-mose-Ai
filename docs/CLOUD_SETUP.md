# Cloud development setup

Use the existing checkout at `/workspace/SogiT-mose-Ai`. Each task is already isolated; do not create Git worktrees unless the user explicitly asks.

## Reproduce the tested browser/core workflow

Node 24 and npm are available. FFmpeg, FFprobe and Chromium are needed for the integration/UI checks. On the current instance they are present at `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`, `/usr/bin/chromium`.

```sh
cd /workspace/SogiT-mose-Ai
npm --cache /tmp/sogit-npm-cache ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run dev
```

In another terminal in the same checkout, `npm run test:ui` validates real UI interactions in Chromium and writes `test-results/studio.png`. Do not expose loopback URLs as previews in the onboarding UI.

`--ignore-scripts` prepares browser/core development without automatically downloading Electron into an unwritable home cache. Desktop/packaging requires the official Electron binary. Preserve TLS and checksum verification:

```sh
electron_config_cache=/tmp/sogit-electron-cache node node_modules/electron/install.js
```

When the execution network uses an HTTPS proxy, the official downloader can be initialized with `ELECTRON_GET_USE_PROXY=1` and `GLOBAL_AGENT_HTTP_PROXY` set from the existing `HTTPS_PROXY`; do not print proxy URLs/credentials. Do not disable checksum/TLS verification or configure untrusted mirrors. Download access requires GitHub releases and their artifact hosts, npm needs registry.npmjs.org.

Packaging Windows ZIP from Linux:

```sh
XDG_CACHE_HOME=/tmp/sogit-cache ELECTRON_BUILDER_CACHE=/tmp/sogit-builder-cache npx electron-builder --win zip --x64 --config.win.signAndEditExecutable=false --config.electronDownload.cache=/tmp/sogit-electron-cache
```

Apply the existing proxy environment to this command if required. Windows signature editing is skipped for this test ZIP; it is unsigned. Build an installer on a Windows machine with `npm ci` and `npm run dist:win`.

Live processes do not survive environment publication. Start Vite again when needed. No Muse or AI credentials are required for metadata/reference/prompt-template work or the tests. Actual Muse account login and live AI provider requests remain separate validation steps.


## Optional native desktop integration test

The current Linux image includes Xorg and its dummy driver. Start a virtual display in a terminal:

```sh
cd /workspace/SogiT-mose-Ai
Xorg :99 -config "$PWD/scripts/xorg.conf" -logfile /tmp/sogit-xorg.log -noreset -nolisten tcp -novtswitch -sharevts -ac
```

Then run in another terminal:

```sh
cd /workspace/SogiT-mose-Ai
npm run build
DISPLAY=:99 XDG_CONFIG_HOME=/tmp/sogit-config XDG_CACHE_HOME=/tmp/sogit-cache npm run test:desktop
```

The test launches the built UI from disk (`--studio-built-ui`), exercises native dialogs with controlled test selections, media loading, isolated account windows with a stub remote page, and a real FFmpeg export. It never claims a live Muse login. Test-only `--no-sandbox` is needed in this Linux container; the normal application does not add it. All test project/credential state is under a temporary directory and removed afterward. Do not stop an X server you did not start.


## Muse automation fixture

`DISPLAY=:99 XDG_CONFIG_HOME=/tmp/sogit-config XDG_CACHE_HOME=/tmp/sogit-cache npm run test:muse` uses the same virtual display after `npm run build`. It intercepts the test account's HTTPS Muse session with local fixture HTML and valid image/video files. It checks native upload, send-once, result capture, media persistence, scripts, draft protection and cancellation. This is not evidence that the live Muse DOM works. For actual compatibility, use the account's **Check Muse** and redacted **Connection report** features on the user's desktop. Never collect cookies or passwords.
