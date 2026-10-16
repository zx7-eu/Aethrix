/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { ApiProvider, Provider, providerOf, listApiModels, streamApi } from './cloudProviders';
import { Message, Tool, streamChat } from './ollama';
export const keySlot = (provider: ApiProvider) => `aethrix.apiKey.${provider}`;
export async function findAgentCli(name: 'claude' | 'codex') {
	const home = process.env.USERPROFILE || '';
	const candidates = [path.join(home, '.local/bin', name + '.exe'), path.join(process.env.APPDATA || '', 'npm', name + '.cmd')];
	if (process.platform === 'win32') { try { const found = await new Promise<string>((resolve, reject) => execFile('where.exe', [name], { windowsHide: true, timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout))); candidates.unshift(...found.trim().split(/\r?\n/)); } catch { /* Try per-user installs. */ } }
	if (name === 'codex') { const directory = path.join(process.env.LOCALAPPDATA || '', 'OpenAI/Codex/bin'); for (const folder of (await fs.readdir(directory).catch(() => [])).reverse()) { candidates.push(path.join(directory, folder, 'codex.exe')); } }
	for (const candidate of candidates) { if (path.isAbsolute(candidate)) { try { await fs.access(candidate); return candidate; } catch { /* Try the next path. */ } } }
	return undefined;
}
/** Keys remain in editor SecretStorage, never settings, chat, terminal commands or webview state. */
export class ProviderConnections {
	private readonly terminals = new Set<vscode.Terminal>();
	constructor(private readonly context: vscode.ExtensionContext) { }
	provider(): Provider { return providerOf(vscode.workspace.getConfiguration('localforge').get('provider', 'ollama')); }
	model(provider = this.provider()) { const config = vscode.workspace.getConfiguration('localforge'); return provider === 'ollama' ? config.get('model', 'qwen3-coder:30b') : config.get(provider + 'Model', ''); }
	async status() { const [openai, anthropic, claude, codex] = await Promise.all([this.context.secrets.get(keySlot('openai')), this.context.secrets.get(keySlot('anthropic')), findAgentCli('claude'), findAgentCli('codex')]); return { selected: this.provider(), models: { openai: this.model('openai'), anthropic: this.model('anthropic') }, keys: { openai: !!openai, anthropic: !!anthropic }, cli: { claude: !!claude, codex: !!codex } }; }
	async manageKey(provider: ApiProvider, remove = false) {
		if (remove) { await this.context.secrets.delete(keySlot(provider)); return; }
		const key = await vscode.window.showInputBox({ title: vscode.l10n.t('{0} API Key', provider === 'openai' ? 'OpenAI' : 'Anthropic'), prompt: vscode.l10n.t('Stored securely by the editor. API billing is separate from CLI account subscriptions.'), password: true, ignoreFocusOut: true, validateInput: value => !value.trim() || /\s/.test(value.trim()) ? vscode.l10n.t('Enter a valid API key without spaces or line breaks.') : undefined });
		if (key?.trim()) { await this.context.secrets.store(keySlot(provider), key.trim()); }
	}
	async models(provider: ApiProvider) { const key = await this.context.secrets.get(keySlot(provider)); if (!key) { throw new Error('Save this provider’s API key first.'); } return listApiModels(provider, key); }
	async choose(provider: Provider, busy: boolean) {
		if (busy) { throw new Error('Stop active work and downloads before switching providers.'); }
		if (provider !== 'ollama') {
			if (!await this.context.secrets.get(keySlot(provider)) || !this.model(provider)) { throw new Error('Save an API key and choose a compatible model in Providers first.'); }
			const choice = await vscode.window.showWarningMessage(vscode.l10n.t('Use {0} API? Prompts, selected file context and tool results will be sent to this provider. API charges apply separately from subscriptions. Existing conversation context may also be sent.', provider === 'openai' ? 'OpenAI' : 'Anthropic'), { modal: true }, vscode.l10n.t('Use API Provider'));
			if (choice !== vscode.l10n.t('Use API Provider')) { return; }
		}
		await vscode.workspace.getConfiguration('localforge').update('provider', provider, vscode.ConfigurationTarget.Global);
	}
	async respond(provider: Provider, model: string, messages: Message[], tools: Tool[], context: number, signal: AbortSignal, text: (value: string) => void, progress: (seconds: number, received: boolean) => void) {
		if (provider === 'ollama') { return streamChat(model, messages, tools, context, signal, text, progress); }
		const key = await this.context.secrets.get(keySlot(provider)); if (!key) { throw new Error('The API key is missing. Reconnect this provider in Aethrix Settings → Providers.'); }
		return streamApi(provider, key, model, messages, tools, signal, text, progress);
	}
	async terminal(name: 'claude' | 'codex', action = 'open') {
		if (!vscode.workspace.isTrusted) { throw new Error('Trust the workspace before starting a coding agent.'); }
		const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (!root) { throw new Error('Open a project folder first.'); }
		if (action === 'setup') { const terminal = vscode.window.createTerminal({ name: name === 'claude' ? 'Install Claude Code' : 'Install Codex CLI', cwd: root }); terminal.show(); terminal.sendText(name === 'claude' ? 'winget install Anthropic.ClaudeCode' : 'npm install -g @openai/codex', false); return; }
		const binary = await findAgentCli(name); if (!binary) { throw new Error(`${name === 'claude' ? 'Claude Code' : 'Codex CLI'} is not installed. Use its Install CLI button, complete the command, then refresh.`); }
		const existing = [...this.terminals].find(terminal => vscode.window.terminals.includes(terminal) && terminal.name === `Aethrix · ${name}`);
		if (existing) { existing.show(); if (action === 'login') { throw new Error('An agent terminal is already open. Complete sign-in there or close that terminal before starting a separate login.'); } return; }
		const terminal = vscode.window.createTerminal({ name: `Aethrix · ${name}`, cwd: root, shellPath: 'powershell.exe', shellArgs: ['-NoLogo'] }); this.terminals.add(terminal); terminal.show();
		terminal.sendText(`& '${binary.replace(/'/g, "''")}'${action === 'login' ? (name === 'codex' ? ' login' : ' auth login') : ''}`);
	}
}
