# Aethrix 0.9.0 — Claude, Codex and API connections

Download **Aethrix-0.9.0-windows-x64.zip** for Aethrix.exe, setup instructions, requirements, official links and licenses. A separate EXE and SHA256SUMS.txt are also available.

## Changes

- Open Claude Code or Codex in an integrated terminal, with official sign-in and installation helpers.
- Optional OpenAI and Claude API chat, secure API-key storage, available-model discovery and a provider selector.
- API chat uses the existing approval, Stop, queue and recovery controls. Queued requests and plans retain their provider and model.
- Local Ollama remains the default. API usage requires your own key, access and billing; CLI sessions use their own authentication and permissions.

## Setup and requirements

Restart Aethrix after updating. Open Settings → Providers to install or launch official Claude Code/Codex terminal agents, or save an API key and load available models. Select a compatible text/code model with tool support. API billing and CLI subscriptions/authentication are separate. No credentials or models are bundled. Ollama remains available for free local inference. See USER-GUIDE.md and REQUIREMENTS.md.

## Validation

45 regression tests passed, including local mock API streaming, tool-call IDs, cancellation, incomplete-stream rejection and secret handling. Settings/chat layout checks and packaged-editor settings/native Git integration also passed. No paid API inference was performed; live service access depends on your credentials, model permissions and billing.

Windows x64; unsigned EXE. Existing profiles are retained. No personal chats, credentials, model weights or private project files are included.
