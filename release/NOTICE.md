# Attribution and distribution notices

Aethrix is an independent fork of Microsoft's MIT-licensed Code - OSS source. It is not the Microsoft Visual Studio Code product and is not affiliated with or endorsed by Microsoft. Base commit: 743b7f939f37a9c2a59f1e2177335db6e5735a1f. Original editor README: LocalForge-Code/README.upstream.md.

MIT notices are retained in LICENSE.txt and LocalForge-Code/LICENSE.txt. ThirdPartyNotices.txt preserves upstream dependency notices. Electron/Chromium notices are distributed as LICENSES.chromium.html. Additional component licenses remain beside the components inside the extracted application.

Bundled C++ components and their official release URLs and archive SHA-256 values are recorded in LocalForge-Packaging/cpp-packages.json. clangd/LLVM, CMake Tools, CodeLLDB and their dependencies retain their respective licenses. The chat Markdown and syntax-highlighting distributions retain adjacent license files. The custom Open VSX verifier includes its bundled dependency license notices.

Ollama, model weights, Visual Studio Build Tools, .NET SDK, Windows SDK/WDK, WinDbg, CMake and Ninja are separately obtained from their official sources. Their licenses and installation terms apply separately. No Microsoft Marketplace authorization, proprietary language extension license or Microsoft product license is granted by this repository.

This publication is a clean source snapshot with Aethrix changes, not a transfer of the local development Git history. Upstream workflows requiring Microsoft infrastructure are omitted. Generated output, development profiles, chats and private test evidence are excluded. No model weights or private project source are included.

Upstream Copilot simulation SQLite caches (98 Git LFS objects) are omitted. They are not Aethrix application source or runtime requirements and are not needed for the assistant tests or production editor. Full upstream Copilot simulation tests require the separately obtained upstream cache data.

Version 0.8 bundles jsonc-parser for importing commented editor preferences and jsdiff for counting changed lines. Their MIT/BSD notices are preserved as media/jsonc-parser.LICENSE.txt and media/diff.LICENSE.txt in the assistant source and extracted application.
