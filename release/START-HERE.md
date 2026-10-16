# Start Aethrix

1. Extract the entire release ZIP into a folder you own. Double-click **Aethrix.exe**. The first start expands the editor to `%LOCALAPPDATA%\Aethrix\App`; later starts reuse it. This is an unsigned early release.
2. For AI, install Ollama using `requirements/Install Ollama.url`, then start it. If it is not running, open a terminal and run `ollama serve`. The usual local endpoint is `http://localhost:11434`.
3. Open a project folder. Open the Aethrix sidebar, then choose **Install Models** beneath the model picker. Check the hardware recommendation and disk requirement, download a model, and select **Use Model**. Models are not included in this download.
4. Keep **Ask first** initially. Trust a project when you want to enable builds, commands or edits. Review requested commands and file diffs.
5. Ask a question or choose Normal, Plan, Debug, Multi-task or Ask. See `USER-GUIDE.md` for detailed controls.

The editor works without Ollama. Local AI requires Ollama and a downloaded model. Alternatively, open Settings → Providers for OpenAI/Claude API chat or Claude Code/Codex terminals. API chat needs your own key, model access and billing; terminal agents need their official CLI and sign-in. No Aethrix subscription is required. Your selected model has its own license.

For C++, install a compiler and the required SDK; for C#, install the .NET SDK; for drivers, install matching Windows SDK/WDK and Visual Studio C++ tools. The release includes editor integrations, not those SDKs. See `REQUIREMENTS.md` and the official shortcuts in `requirements/`.

## Troubleshooting

- **Cannot connect:** check Ollama is running and the configured endpoint is correct. `ollama list` shows installed models.
- **Slow or out of memory:** choose a smaller model, reduce context, close other GPU-heavy apps and update supported GPU drivers. A memory estimate does not guarantee speed.
- **No project / access blocked:** open a folder. Read-only search is available in restricted workspaces; editing and commands need workspace trust.
- **Compiler not found:** install the toolchain from the requirements links, restart Aethrix, and use C++ Setup or Driver Tools.
- **Taskbar launch:** pin the running editor after the initial extraction, rather than an internal development Electron runtime.

Settings and chats: `%APPDATA%\Aethrix`. Extracted editor: `%LOCALAPPDATA%\Aethrix\App`. Ollama and model storage are separate. Existing profiles are retained on updates. `LOCALFORGE_DATA_DIR` and `LOCALFORGE_APP_DIR` can redirect the profile and extracted application for testing.

## Verify the download

Compare `Get-FileHash .\Aethrix.exe -Algorithm SHA256` with `SHA256SUMS.txt`. Checksums detect a changed download; they are not a publisher signature.
