# Aethrix 0.8.0 — settings, local usage and source control

Download **Aethrix-0.8.0-windows-x64.zip** for the standalone EXE, setup guide, requirements, official dependency links and licenses. The individual EXE and SHA256SUMS.txt are also available.

## Changes

- Separate Aethrix Settings with General, Plan & Usage, Agents, Models, Source Control, Browser & Network, Code Intelligence and Beta sections. No Voice, Cloud Agents, Customize or Docs tabs.
- Local usage and line-edit statistics. Counts start with this version; completed-response tokens are recorded only when Ollama reports them.
- 44 verified local Ollama model tags, custom tags, model visibility controls, hardware fit estimates, live download-size checks, low-storage blocking and cancellation.
- Git discovery and native source control, staging/unstaging, commits, branches, diffs, fetch/pull/push and read-only review. Git author configuration is available; remote authentication and repository setup are still required.
- One continuous agent response, grouped tool activity, a red Stop control, and a guard against repetitive repository-overview reads.
- Opt-in local inline suggestions, editor preferences, local preview controls and an Ollama connection check.

## Validation

39 regression tests passed, along with settings/chat browser checks and an actual packaged-editor integration check for settings persistence and native Git staging/commit. Model tags and sizes were checked against the official Ollama registry without downloading model weights.

Windows x64. The EXE is unsigned. Ollama and model weights are separate downloads; compilers/SDKs/WDK/WinDbg are optional task-specific dependencies. Fit estimates do not guarantee speed or GPU support. No personal chats, credentials, model weights or private project source are included. Existing profiles are retained on update.
