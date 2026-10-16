# Aethrix

Aethrix is a local source build of Microsoft's MIT-licensed Code - OSS, with its real workbench, Monaco editor, explorer, terminal and built-in language support. Branding is configured in product.json. The bundled extensions/localforge feature supplies local Ollama chat, streaming progress, cancellation and reviewed project tools. No subscription or API key is required.

Double-click Aethrix.exe in the parent directory to start. The Start-LocalForge.cmd launcher opens the same app. The executable under .build/electron is the internal Electron runtime and requires an application path; use the parent-directory launcher for normal startup. The Local Assistant appears in the secondary sidebar. Start Ollama and select an installed model. Open a project folder and trust it to enable project tools. Review file changes in the native diff editor before applying. Commands require separate approval unless auto-approval is enabled, and their output appears in the Aethrix output channel. Existing files receive backups in the assistant's global storage. File/command tools run with your user permissions. The command runner supports non-interactive PowerShell commands; the normal integrated terminal remains available for interactive use.

The standalone executable packages the production editor and extracts it to %LOCALAPPDATA%\Aethrix\App. Taskbar shortcuts must target that packaged app, never .build/electron/Aethrix.exe. Settings and chat history use %APPDATA%\Aethrix. See ../LocalForge-Packaging/README.md for production packaging. The executable is unsigned.

For source development, keep the source directory, dependencies and .build runtime together. Dependencies install with npm install. Build the workbench with npm run build-fast -- --client-only and built-in extensions with npm run gulp transpile-extensions compile-extension-media. npm run electron downloads the runtime. Microsoft's copyright notices and MIT license are retained. The old C# prototype is separate.

If the runtime downloader cannot reach GitHub, download the official Electron ZIP and SHASUMS256.txt into .build/downloads and set LOCALFORGE_ELECTRON_CACHE=.build/downloads before running npm run electron. Both the upstream manifest and the repository checksums remain enforced.

Aethrix does not configure Microsoft's proprietary Marketplace or cloud Copilot service. Those services are not required for the local assistant. Language IntelliSense beyond the built-in language features may require compatible extensions and your compiler toolchain.

The assistant's Auto-approve selector offers Ask first, File edits, and Files and commands. The selection is stored for the open workspace. File edits mode skips file approval dialogs; Files and commands also runs commands without confirmation. Workspace trust, project path boundaries, backups, and changed-file checks remain active. The default is Ask first.

Chats are saved locally in the assistant's global storage, grouped by project. Each is automatically titled from its first request without another model call. Choose a saved conversation using the dropdown above the model selector, or use + to start a new one. Conversations and context survive app restarts. Incomplete tool requests are never executed: an empty leftover wrapper is discarded, and malformed requests receive one repair attempt without repeating successful tool actions.

For version 0.8 source builds, also run npm install --prefix extensions/localforge --ignore-scripts to install the pinned JSON-with-comments parser before bundling the assistant. All new parser/diff license notices are included in extension media.
