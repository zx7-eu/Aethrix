# Build Aethrix from source

The prebuilt release is the easiest way to use Aethrix. This guide is for rebuilding the editor and Windows x64 package. Keep the directory names shown here: packaging scripts use LocalForge-Code and VSCode-win32-x64 as sibling paths for historical reasons.

## Prerequisites

Use a short checkout path without spaces, for example `C:\src\Aethrix`. Install Git, Node.js matching `LocalForge-Code/.nvmrc` (24.18.0 or newer in the 24.x line), npm below 13, Python for node-gyp, and Visual Studio C++ Build Tools with the Windows SDK and native build prerequisites. NSIS 3 is needed for packaging. Allow tens of GB for source, dependencies, runtime downloads and build output. Network access is required for dependency and runtime downloads.

The upstream [Windows build prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites) document compiler components, SDK requirements and troubleshooting. Use the pinned package-lock files and `.npmrc` in this snapshot. The shipped editor uses Electron 43.7.7. The original local build used Node 24.21.0. Building on a different toolchain is not a bit-for-bit reproducibility guarantee.

## Install and validate the assistant

Run in PowerShell from the repository root:

```powershell
Set-Location LocalForge-Code
npm install
npm install --prefix extensions/localforge --ignore-scripts
node node_modules/@typescript/native/lib/tsc.js -p extensions/localforge/tsconfig.json --pretty false
node --test extensions/localforge/test/*.test.cjs
node --experimental-strip-types extensions/localforge/esbuild.mts --production
```

The unit tests include a local HTTP fixture server and need permission to bind to loopback. The assistant production bundle is written to `extensions/localforge/dist/extension.js`. Browser/native UI verification requires a running packaged app and is separate from this suite.

## Build the production editor

Still in LocalForge-Code:

```powershell
npm run gulp localforge-win32-x64
npm run gulp localforge-win32-x64-finalize
Set-Location ..
```

Have the installed Windows SDK's x64 `signtool.exe` directory on PATH for the finalize task. This produces the sibling `VSCode-win32-x64` directory. The editor is unsigned unless you separately configure signing.

If the Electron downloader cannot reach GitHub, place the official Electron ZIP and SHASUMS256.txt in `LocalForge-Code/.build/downloads`, set `$env:LOCALFORGE_ELECTRON_CACHE='.build/downloads'`, and rerun the build. The cache resolver retains checksum validation.

## Apply Aethrix packaging

Run from the repository root. PowerShell 7 is recommended for the logo script. C++ bundle downloads are pinned and checksum checked.

```powershell
./LocalForge-Packaging/bundle-cpp.ps1
./LocalForge-Packaging/prepare-logo.ps1
node LocalForge-Packaging/configure-extensions.cjs
New-Item -ItemType Directory -Force VSCode-win32-x64/resources/app/extensions/localforge/dist | Out-Null
Copy-Item LocalForge-Code/extensions/localforge/dist/extension.js VSCode-win32-x64/resources/app/extensions/localforge/dist/extension.js -Force
Copy-Item LocalForge-Code/extensions/localforge/media/* VSCode-win32-x64/resources/app/extensions/localforge/media/ -Force
Copy-Item LocalForge-Code/extensions/localforge/package.nls.json VSCode-win32-x64/resources/app/extensions/localforge/ -Force
$manifestPath = 'VSCode-win32-x64/resources/app/extensions/localforge/package.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.main = './dist/extension.js'
$manifest | ConvertTo-Json -Depth 100 | Set-Content $manifestPath -Encoding utf8
node LocalForge-Packaging/finalize-package.cjs
node --test LocalForge-Packaging/openvsx-sign.test.cjs
Set-Location LocalForge-Packaging
& 'C:/Program Files (x86)/NSIS/makensis.exe' /V2 portable.nsi
Set-Location ..
```

`configure-extensions.cjs` validates its expected upstream production patterns and fails if they change; investigate rather than bypassing those checks. `finalize-package.cjs` refreshes the real workbench integrity hashes after branding/patching. Do not disable integrity checks.

The result is `Aethrix-Standalone.exe`. Copy it to `release/Aethrix.exe`, copy the release documentation and notices, and generate SHA-256 checksums before distributing. Never bundle local profiles, chats, credentials or private projects. Change the build marker in portable.nsi for every changed application payload so existing cached installs are refreshed. The public launcher includes only seed settings, never saved conversations.

## Source layout

- LocalForge-Code/src: editor, workbench branding, account UI and extension verifier changes.
- LocalForge-Code/extensions/localforge: TypeScript assistant, webview assets, hardware scanner and regression tests.
- LocalForge-Packaging: logo assets, pinned C++ dependencies, Open VSX configuration/verifier, integrity finalization and NSIS launcher.
- release: user-facing setup and requirements; large EXE/ZIP files are attached to GitHub Releases.

The source snapshot intentionally omits upstream Microsoft-internal GitHub workflows. Windows checkout may materialize the upstream terminal-suggest symlink fixture as a link-target text file when Git symlink support is disabled; this fixture is unrelated to the Windows production application build.

Upstream Copilot simulation SQLite caches are excluded from this distribution. Rebuilding Aethrix does not need them; running the full upstream Copilot simulation suite requires the original upstream Git LFS data.
