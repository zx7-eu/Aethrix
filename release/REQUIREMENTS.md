# Requirements

## To run the prebuilt editor

- Windows 10 22H2 or newer, **64-bit x64**. Windows 11 is the recommended target. No ARM64 build is included.
- At least 4 GB free for the release download and editor extraction; leave additional working space. Model/runtime storage is extra.
- Electron and the editor runtime are bundled. A separate Node.js, .NET runtime, source checkout or Electron installation is not required to launch the editor.

## To use the AI assistant

- [Ollama for Windows](https://ollama.com/download/windows), installed and running locally. See its [current Windows requirements](https://docs.ollama.com/windows). Allow at least 4 GB for Ollama itself, plus space for downloaded models.
- A downloaded local model that supports the workflow you want. Small coding models can work on modest PCs; 16 GB RAM is a practical starting point, and 32 GB gives more room. A compatible dedicated GPU helps. GPU support and driver requirements are determined by Ollama.
- Model storage can range from around 1 GB for small models to tens or hundreds of GB. RAM/VRAM must cover weights, context and runtime overhead. Use Aethrix's live model fit check; no single memory minimum applies to every model.
- Internet for initial runtime/model downloads. Once a local model is installed, inference can run locally without a paid API key. Downloads, extensions and other editor features may still contact online services.

Ollama is not bundled: its installer and GPU packages are large and change independently. Official download shortcuts are included in `requirements/`. Model weights are also separate and subject to their own licenses. This release is not an all-dependencies offline installer.

## Optional development toolchains

- **C/C++:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio) with Desktop development with C++, an appropriate Windows SDK, and MSVC; or your compatible LLVM/MinGW toolchain. Install [CMake](https://cmake.org/download/) and [Ninja](https://ninja-build.org/) for projects that need them. Git is useful for version control.
- **C#:** the [.NET SDK](https://dotnet.microsoft.com/download) matching the project. Editor syntax support is included; advanced language support depends on compatible extensions. Do not assume proprietary Microsoft extensions are licensed for this fork.
- **Windows drivers:** matching [Windows SDK and WDK](https://learn.microsoft.com/windows-hardware/drivers/download-the-wdk), supported Visual Studio C++ tools and WDK integration. Driver signing, deployment and kernel debugging are separate tasks; use an appropriate isolated test machine or VM.
- **Dump analysis / kernel debugging:** [WinDbg](https://learn.microsoft.com/windows-hardware/drivers/debugger/). Driver Tools detects installed debugging tools; none is silently installed.
- **Extensions:** the editor uses [Open VSX](https://open-vsx.org/). Availability and licenses differ from Microsoft's Marketplace. Compatible local VSIX installation is supported.

## Bundled components

The release includes the Code - OSS editor, Electron, Aethrix assistant, Markdown/highlighting assets, clangd 23.1.0 with its editor extension 0.6.0, CMake Tools 1.24.42, and CodeLLDB 1.12.3. See `BUNDLED-COMPONENTS.json`, `LICENSE.txt`, `ThirdPartyNotices.txt`, `LICENSES.chromium.html`, and license files inside the extracted application for component notices. CMake Tools does not include the CMake build tool; clangd is not a C++ compiler.

## Building the editor source

See `BUILDING.md` in the repository. Source builds require Git, Node 24.18.0 or newer in the 24.x line, npm below 13, Python, Visual Studio C++ build tools, Windows SDK and additional build disk space. NSIS 3 is needed to recreate the single-EXE launcher. These tools are not required merely to run the prebuilt editor.

## Optional API and terminal providers

Local Ollama is one AI option. OpenAI or Claude API chat instead requires internet, your own provider API key, access to a compatible tool-capable model and any required API billing. Save keys through Settings → Providers; keys are kept in editor SecretStorage. Conversation context and tool results are sent to the selected API provider.

Claude Code and Codex terminal sessions require their official CLI installed and signed in with an eligible account or supported API setup. The settings page offers installation commands for review and official sign-in commands. They are independent terminal agents: their permissions and billing apply, and Ctrl+C stops them. Aethrix Stop controls the built-in assistant. Terminal-agent usage is not included in Aethrix usage counters.

Official setup: https://code.claude.com/docs/en/setup and https://developers.openai.com/codex/cli/ .
