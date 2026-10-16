# Aethrix

Open Aethrix.exe or the Aethrix taskbar shortcut. For local inference, Ollama must be running with your selected model. Optional API providers are configured in Settings → Providers.

The chat header has a **Tools** menu for search, builds, models, history search, queues, and driver tools. **Context & Permissions** above the message box contains attachments, active-file sharing, and auto-approval. The mode selector sits beside **Queue** and **Send**. Hover over the connection dot to check its status.

## Installing Models

Click **Install Models** below the model picker, or run **Aethrix: Install Models** from the command palette. The installer reads the CPU, total/available RAM, dedicated GPU memory, and free space on the detected Ollama model drive. Expand the RAM/GPU summary to inspect details or **Rescan PC** after changing hardware or freeing resources.

Choose a suggested coding model, or expand **Other Ollama Model**, enter a local `name:tag`, and choose **Check Fit**. The installer checks the registry's current download size, or uses the actual installed model size when already available. Suggestions use approximate catalog sizes; memory estimates include runtime/context overhead and reserve space for the OS. It does not add multiple GPUs together or count shared GPU memory twice.

**Likely Fits GPU Memory** describes capacity, not a promise of speed or GPU-driver support. **CPU Offload** and **CPU Only** warn that execution may be slower. **Likely Too Large** warns that the model may fail or become extremely slow. Longer context and other running apps affect the estimate. Switching installed models through the picker also checks memory fit.

**Download Model** streams progress from Ollama and offers cancellation. Retry the same model to reuse partial downloads. An oversized or offloaded model requires an explicit warning acknowledgment before download; insufficient free storage blocks it. Downloads do not automatically change the selected model. Once installation completes, click **Use Model** to switch. Ollama must be running, and new downloads require internet. Local cloud-model tags and arbitrary registry URLs are not accepted by this installer.

## Extensions

Press **Ctrl+Shift+X** to search Open VSX, install extensions, or manage installed extensions and automatic updates. Use the Extensions view's **… → Install from VSIX** action for a compatible local `.vsix` file. Registry installation requires internet access and no Aethrix account. Open VSX signatures are checked against the public key published by that registry; modified packages are rejected. Extensions are executable software, so choose publishers you trust.

The built-in Accounts button and hosted sign-in onboarding are removed. Compatible third-party extensions can still request their own authentication when needed. The Microsoft Marketplace and some proprietary extensions are restricted to Microsoft's products; Open VSX does not contain every VS Code extension. The bundled clangd, CMake Tools, and CodeLLDB remain available for C++ work.

## Modes

Choose a mode below the model name. It is remembered separately for each conversation.

- **Normal:** inspect, implement, and verify using the existing approval setting.
- **Plan:** send a request, answer the clarification questions, then let the assistant inspect the project and write an editable `.aethrix/plans/<id>/plan.md`. It cannot edit source or execute commands in this mode. Open the plan and use **Model** above the Markdown to choose an installed model, then **Build Plan** to implement it. The chat also has Open Plan, Choose Build Model, and Build Plan buttons. Save your plan edits before building. Planning never starts implementation automatically.
- **Debug:** creates a local JSONL log before model work. The assistant gathers diagnostics, build output, or an approved reproduction command, records a hypothesis citing evidence IDs, and only then gains access to file edits. Reproduction commands require approval even with auto-approval enabled. Tool starts and results are recorded; fixes without fresh verification evidence are marked unverified. The log's full path appears in the chat; open it through File → Open File to inspect it. Logs may contain source excerpts and command output.
- **Multi-task:** asks the coordinator to divide research into bounded tasks and delegate up to three separate read-only subagents. Reports are returned to the coordinator, which makes the actual changes and verifies them. Subagents run sequentially to reduce GPU contention, have separate model context, and cannot edit, run commands, or spawn more subagents. Use Queue Request for additional top-level jobs.
- **Ask:** asks for clarification before inspecting anything, then provides read-only answers. It cannot edit or execute commands; switch to Normal or Plan when ready to implement.

When the model asks a follow-up question, execution pauses and the question stays visible after reopening the chat. Reply in the normal composer. A queued request that needs answers pauses the queue. Queue items and recovery checkpoints preserve their original mode.

AirLLM has not been integrated. Its layer streaming trades GPU memory for storage and transfer overhead; a 70B FP16 model has roughly 140 GB of weights before conversion overhead. Speed, context limits, and AMD Windows compatibility need validation before choosing that backend.

- **Search** finds literal text, functions, and symbols across the project. Click a result to open its file and line. The assistant can use the same search tool while answering.
- **Build** lets you select a CMake build, MSBuild project/solution, npm build, or custom command. Compiler issues appear in Problems. **Fix Errors** asks the model to inspect the actual output, propose fixes, and rebuild with the saved command. Generated edits follow your approval setting; successful compilation still needs to be checked.
- **File Changes** lists requests that edited files. **Review** opens a before/current diff. **Undo Files** restores that request's edits and removes files it created. Undo refuses to overwrite unsaved or later manual changes. Commands, build outputs, and external actions are not undone.
- **Progress** shows the current operation and elapsed time. **Stop** cancels model requests and stops running command processes.
- **Code blocks** have syntax highlighting, **Copy**, and **Open in Editor**. Opening a block creates an editable untitled document; it does not automatically overwrite a project file.
- **Attach File / Attach Folder** add project files as context. Click a filename chip to remove it. **Context Used** shows what was actually included in the last request and whether it was an excerpt. Attachments are saved per workspace, with a 16,000-character shared-file budget; tools can read further sections.
- **C++ Setup** reports the detected compiler, clangd, CMake, and debugger. The Windows build bundles clangd, CMake Tools, and CodeLLDB. On this PC, builds use the existing Visual Studio C++ compiler and CMake/Ninja. A CMake build exports compile_commands.json and connects it to clangd. Existing MSBuild projects may need a .clangd file with their include paths. **Debug** launches a built project EXE with breakpoints, stepping, variables, and stack views in the native debugger UI.

Read-only search and repository reading work in restricted mode. Builds, debugging, file edits, and commands require a trusted workspace. Ask first remains the default approval mode; your existing project preference is preserved.

The debugger supports user-mode C++ programs. Windows kernel debugging needs a separate WDK/WinDbg setup.

## Editing and Recovery

- **Edit Selection:** select saved code in a project file, then press **Ctrl+Alt+E**, use the editor's Aethrix context-menu action, or click **Edit Selection**. Describe the change. A native editor diff previews it before you choose Apply. Inline edits cannot modify code outside the original selection and require preview approval even with auto-approval enabled.
- **Patch editing:** the assistant's edit_file tool replaces one exact, unique text block in an existing file. It preserves unrelated code and line endings, works with files read in pages, and refuses ambiguous matches or changes made since the last read. New files can still be created with write_file. Patches participate in File Changes and Undo Files.
- **Resume:** interrupted requests retain their original context and completed tool results in the selected chat. Resume restores that context after a cancellation, disconnect, or restart. Commands whose outcome is uncertain are not replayed automatically, and recovery commands require fresh approval. Changed inline-edit files must be selected again. Discard removes only that chat's pending checkpoint.
- **Models:** lists installed Ollama models, their disk size, quantization, and reported loaded memory/GPU use. Use Model changes the model for subsequent requests; it does not download or immediately load another model. Unload frees a loaded model without deleting its download. Refresh updates the values. Model switching and unloading are blocked during an active request.
## History, Queues, and Driver Tools

- **Find Chats** searches titles, messages, and recorded filenames. Choose This Project or All Projects. Opening a result from another project opens that project in a new window and selects its saved conversation.
- **Queue Request** saves the composer text and current context-file paths without starting it immediately. **Queue → Run Queue** processes saved requests one at a time, in order, in their original chats. File context is read when each request starts, so later jobs can inspect earlier edits. Pause lets the current request finish; Stop cancels it and pauses the queue. Failed/interrupted requests pause subsequent jobs. After a restart, the queue stays paused. Open an interrupted job's chat to Resume its checkpoint. The queue holds up to 20 pending requests and preserves normal trust and approval settings.
- **Driver Tools → Driver Toolchain Status** reports WDK versions, headers/libraries, compiler integration, WinDbg/KD/CDB, and the symbol path. This PC now has matching WDK/SDK 28000 installed for Visual Studio 2026.
- **Build Driver Project** uses the detected MSBuild/WDK for a selected project or solution. **Build One WDM Source File** compiles a single .c/.cpp source with the detected kernel headers and libraries, writes x64 outputs under .aethrix-build/driver, and expects DriverEntry. Multi-file/KMDF projects should use their own driver project. Compiler diagnostics appear in Problems and can be used with Fix Errors. Test builds do not install or load drivers.
- **Configure Symbol Path** selects Microsoft symbols with a private cache, adds a local PDB folder, or saves a custom path. **Open Dump in WinDbg** opens a selected Windows dump with those symbols. **Analyze Crash Dump** detects user/kernel dump headers, chooses CDB/KD, runs analysis/stack/module commands, and saves a local report. Stop cancels analysis. Symbol loading may download matching symbols; dump contents are not uploaded. **Explain Last Dump Analysis** sends a bounded excerpt of the report to your local model when you explicitly select it.

The driver tools do not configure live kernel transports or change boot/signing settings. WinDbg remains available for interactive debugging and further analysis.

## Aethrix Settings

Use the gear at the top-left of chat, the gear in the assistant title bar, or Aethrix: Aethrix Settings from the command palette. The settings open in an editor tab with General, Plan & Usage, Agents, Models, Source Control, Browser & Network, Code Intelligence and Beta sections. Changes persist in the appropriate user or workspace preferences.

Plan & Usage shows local counters starting with version 0.8: requests, outcomes, tool calls, reported tokens, running time, file edit operations and added/removed lines. Counts include repeated assistant edits; undo does not subtract historical work, and manual edits or shell effects are not counted. No subscription limits or billing are simulated. Completed local completion calls also contribute reported token counts.

Models contains 44 verified local tags plus custom-tag entry, model visibility checkboxes, installed-model selection, memory/storage estimates and the existing live install checks and cancellation. The catalog is a selection, not the entire Ollama registry; enter another local tag for live inspection. Models retain their own licenses. A GPU fit estimate does not guarantee speed or driver support.

Source Control detects installed Git and configures the native Git extension. Open a project folder; initialize a repository if needed. Stage changes before Commit Staged. Configure Git Author if a name/email is missing. Branches created here use the chosen prefix. Fetch/Pull/Push contact the configured remote and require workspace trust; Pull uses fast-forward only. Native Source Control and its diff editor remain available. Review Working Changes starts a read-only review of tracked changes.

Aethrix local inline suggestions are opt-in under Code Intelligence and use the selected Ollama model. They can compete with chat for model resources. They run only in trusted file workspaces; Tab accepts a suggestion. Auto-import and format settings control the actual editor/language service and require a compatible formatter where applicable.

The network page configures a loopback Ollama address, editor proxy, local preview destination and a connection check. The editor proxy applies to compatible editor/download features; Ollama uses its own local address directly. Beta offers local log viewing and a counters-only usage export.

## Claude, Codex and API Connections

Version 0.9 adds Settings → Providers and Claude Terminal / Codex Terminal shortcuts above the chat model picker. Terminal agents are independent official CLIs running in the open project. Open and trust a project first. Sign In starts the CLI’s own login flow. Install CLI opens the official installation command without executing it; press Enter yourself after reviewing it, complete installation, then refresh Providers. No account tokens are imported into Aethrix. The CLI’s own permissions, billing and cancellation apply; use Ctrl+C in its terminal to stop it.

For API-backed Aethrix chat, save an OpenAI or Anthropic API key with Save API Key. Keys are entered in a password prompt and stored in editor SecretStorage, never in the page, settings JSON, chat records or terminal commands. Load Available Models checks credentials by listing models; choose an appropriate API model ID in API Models, then select OpenAI API or Claude API as Chat Provider. OpenAI models must support Responses with function tools; Claude models use Messages. API availability depends on the key/account and selected model. No paid API request is sent automatically when saving a key or switching providers.

Selecting an API provider requires a notice acknowledging that prompts, selected source context and tool results go to that provider, with API charges separate from CLI subscriptions. Start a new conversation if earlier context should not be shared. API chat retains Aethrix approval modes, native diffs, Stop, recovery and tool limits. Checkpoints, queued requests and saved plans retain their request provider/model. Existing records without provider metadata default to Ollama rather than being silently routed to an API. API streams are accepted only when complete; incomplete tool calls are not executed. Provider errors do not echo credential-bearing response bodies.

Use Model for an installed local model switches chat back to Ollama. Inline suggestions remain local Ollama requests even when chat uses an API. Usage counters track Aethrix API tokens when reported, but do not track independent Claude/Codex terminal sessions or provider billing totals. API context/output limits are provider-specific; the Context Length preference controls local Ollama.

Official references: https://learn.chatgpt.com/docs/auth · https://developers.openai.com/api/docs/guides/function-calling · https://code.claude.com/docs/en/authentication · https://code.claude.com/docs/en/setup · https://platform.claude.com/docs/en/build-with-claude/streaming
