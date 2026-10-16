/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { UsageStore } from './usageStore';
import { modelInventory } from './modelManager';
import { assessFit, modelCatalog, scanHardware, recommend } from './modelAdvisor';
import { findGit, gitRun, gitStatus, stagePath } from './gitSupport';
import { ollamaEndpoint, setOllamaEndpoint } from './localRuntime';
interface Field { page: string; section: string; key: string; title: string; description: string; kind: string; value: string | number | boolean; options?: string[]; min?: number; max?: number }
const field = (page: string, section: string, key: string, title: string, description: string, value: string | number | boolean, options?: string[], min?: number, max?: number): Field => ({ page, section, key, title, description, value, options, min, max, kind: options ? 'select' : typeof value });
export const settingsFields: Field[] = [
	field('general', 'Appearance', 'workbench.colorTheme', 'Theme', 'Choose the editor and Aethrix appearance.', 'Dark Modern', ['Dark Modern', 'Light Modern']),
	field('general', 'Appearance', 'editor.fontSize', 'Editor Text Size', 'Size of code text in the editor.', 14, undefined, 8, 40),
	field('general', 'Appearance', 'editor.minimap.enabled', 'Minimap', 'Show the code overview beside the editor.', true),
	field('general', 'Layout', 'workbench.statusBar.visible', 'Status Bar', 'Show Git, language and diagnostic status.', true),
	field('general', 'Layout', 'workbench.editor.enablePreview', 'Preview Editor Tabs', 'Reuse preview tabs until you start editing.', true),
	field('general', 'Startup and Files', 'window.restoreWindows', 'Window Restoration', 'Choose which windows reopen on startup.', 'all', ['all', 'folders', 'one', 'none']),
	field('general', 'Startup and Files', 'files.autoSave', 'Auto Save', 'Control when edited files are saved.', 'off', ['off', 'afterDelay', 'onFocusChange', 'onWindowChange']),
	field('general', 'Notifications', 'localforge.completionNotification', 'Completion Notification', 'Show an editor notification when a request finishes.', false),
	field('general', 'Notifications', 'localforge.completionSound', 'Completion Sound', 'Play a short sound in the chat when a request finishes.', false),
	field('agents', 'Conversation', 'localforge.chatFontSize', 'Text Size', 'Size of conversation text.', 13, undefined, 10, 22),
	field('agents', 'Conversation', 'localforge.submitWithCtrlEnter', 'Submit with Ctrl + Enter', 'When off, Enter sends and Shift + Enter inserts a newline.', true),
	field('agents', 'Conversation', 'localforge.codeBlockWrap', 'Code Block Word Wrap', 'Wrap long lines in assistant code blocks.', false),
	field('agents', 'Conversation', 'localforge.detailedTools', 'Detailed Conversation', 'Expand tool activity automatically. You can also expand it manually.', false),
	field('agents', 'Conversation', 'localforge.usageSummary', 'Usage Summary', 'Show lifetime request and edit counters below the composer.', true),
	field('agents', 'Context and Execution', 'localforge.contextLength', 'Context Length', 'Longer context uses more RAM and VRAM.', 8192, undefined, 4096, 32768),
	field('agents', 'Context and Execution', 'localforge.autoApprove', 'Run Mode', 'Ask first, approve file edits, or approve files and commands. Requires a trusted workspace.', 'off', ['off', 'files', 'all']),
	field('network', 'Local Inference', 'localforge.endpoint', 'Ollama Address', 'Local loopback server address. Applies to chat, downloads, model inventory and completions.', 'http://127.0.0.1:11434'),
	field('network', 'Editor Network', 'http.proxy', 'HTTP Proxy', 'Proxy used by compatible editor and extension downloads. Ollama uses its local address directly.', ''),
	field('network', 'Browser', 'localforge.openLocalInBrowser', 'Open Local Links in Editor', 'Open localhost previews in the built-in Simple Browser.', true),
	field('source', 'Git', 'git.enabled', 'Enable Git', 'Enable native source control integration.', true),
	field('source', 'Git', 'git.autofetch', 'Auto Fetch', 'Let native Git periodically fetch configured remotes.', false),
	field('source', 'Git', 'git.confirmSync', 'Confirm Sync', 'Ask before native Git synchronizes with a remote.', true),
	field('source', 'Git', 'git.enableSmartCommit', 'Smart Commit', 'Allow native Git to offer committing all changes when nothing is staged.', false),
	field('source', 'Review', 'diffEditor.ignoreTrimWhitespace', 'Ignore Trim Whitespace', 'Ignore leading/trailing whitespace in native diffs.', true),
	field('source', 'Branches and Attribution', 'localforge.branchPrefix', 'Branch Prefix', 'Prefix new branches created from this settings page.', 'aethrix/'),
	field('source', 'Branches and Attribution', 'localforge.commitAttribution', 'Commit Attribution', 'Append Made with Aethrix to commits created here.', false),
	field('intelligence', 'Local Completions', 'localforge.inlineCompletion', 'Aethrix Inline Suggestions', 'Generate local suggestions using Ollama. Uses the selected chat model and can compete with agent GPU memory. Tab accepts a suggestion.', false),
	field('intelligence', 'Local Completions', 'localforge.suggestInComments', 'Suggestions While Commenting', 'Allow local completions on comment lines.', false),
	field('intelligence', 'Local Completions', 'localforge.whitespaceSuggestions', 'Whitespace-Only Suggestions', 'Allow local completions containing only whitespace.', false),
	field('intelligence', 'Editor Suggestions', 'editor.inlineSuggest.enabled', 'Show Inline Suggestions', 'Show suggestions from Aethrix and compatible extensions.', true),
	field('intelligence', 'Editor Suggestions', 'typescript.suggest.autoImports', 'TypeScript Auto Imports', 'Suggest imports using the bundled TypeScript language service.', true),
	field('intelligence', 'Editor Suggestions', 'javascript.suggest.autoImports', 'JavaScript Auto Imports', 'Suggest imports using the bundled JavaScript language service.', true),
	field('intelligence', 'Formatting', 'editor.formatOnSave', 'Format on Save', 'Use an installed compatible formatter when saving.', false),
	field('intelligence', 'Formatting', 'editor.wordWrap', 'Editor Word Wrap', 'Wrap long source lines in the editor.', 'off', ['off', 'on', 'wordWrapColumn', 'bounded'])
];
export function validateSetting(key: string, value: unknown) {
	const entry = settingsFields.find(item => item.key === key); if (!entry) { throw new Error('Unknown settings key.'); }
	if (typeof value !== typeof entry.value || (typeof value === 'number' && (!Number.isInteger(value) || value < (entry.min ?? 0) || value > (entry.max ?? 100000))) || (typeof value === 'string' && value.length > 1000) || (entry.options && !entry.options.includes(value as string))) { throw new Error('Invalid settings value.'); }
	if (key === 'localforge.endpoint') { const old = ollamaEndpoint(); try { setOllamaEndpoint(String(value)); } finally { setOllamaEndpoint(old); } }
	return entry;
}
interface Host { usage: UsageStore; busy(): boolean; model(action: string, name?: string): Promise<void>; selectModel(name: string): Promise<void>; preferences(): void; review(diff: string): Promise<void> }
export class AethrixSettings implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private hardware?: Awaited<ReturnType<typeof scanHardware>>;
	private git?: string;
	private gitBusy = false;
	private readonly disposables: vscode.Disposable[] = [];
	constructor(private readonly context: vscode.ExtensionContext, private readonly host: Host) {
		if (vscode.workspace.onDidChangeConfiguration) { this.disposables.push(vscode.workspace.onDidChangeConfiguration(() => { host.preferences(); if (this.panel) { void this.state(); } })); }
	}
	dispose() { this.panel?.dispose(); this.disposables.forEach(item => item.dispose()); }
	open() {
		if (this.panel) { this.panel.reveal(); return; }
		const panel = this.panel = vscode.window.createWebviewPanel('aethrix.settings', vscode.l10n.t('Aethrix Settings'), vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] });
		const nonce = randomBytes(20).toString('hex'); const uri = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', name));
		panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${uri('settings.css')}"></head><body><aside><div class="brand">Aethrix<span>Local · Free</span></div><input id="search" aria-label="${vscode.l10n.t('Search Settings')}" placeholder="${vscode.l10n.t('Search Settings')}"><nav id="tabs"></nav></aside><main><h1 id="heading"></h1><div id="body"></div></main><div id="notice" role="status" aria-live="polite"></div><script nonce="${nonce}">window.settingsLabels=${JSON.stringify(Object.fromEntries(['General', 'Plan & Usage', 'Agents', 'Models', 'Source Control', 'Browser & Network', 'Code Intelligence', 'Beta', 'Open', 'Refresh', 'Check Fit', 'Install', 'Use Model', 'Cancel Download', 'Ready', 'Save', 'Saved', 'Search models or enter a local tag', 'Show in Model Picker', 'Select', 'Installed', 'Not Installed', 'Estimated fit; actual driver support and speed vary.', 'No subscription or usage cap. These counters are stored on this PC.', 'Tracking starts with this version. Tokens are counted only when Ollama reports them; canceled streams may be missing tokens. Edits count applied assistant changes, including repeated edits, not manual edits or shell changes.', 'Today', 'All Time', 'Requests', 'Completed', 'Canceled', 'Failed', 'Tool Calls', 'Input Tokens', 'Output Tokens', 'Minutes Running', 'File Edit Operations', 'Lines Added', 'Lines Removed', 'Preferences', 'Editor Settings', 'Keyboard Shortcuts', 'Import VS Code Preferences', 'Choose Git Executable', 'Open Source Control', 'Stage All', 'Unstage All', 'Commit Staged', 'New Branch', 'Fetch', 'Pull', 'Push', 'Initialize Repository', 'Open Remote', 'Test Ollama Connection', 'Open Local Preview', 'Open Extension Manager', 'Open Logs', 'Export Usage', 'Review Working Changes', 'No changes.', 'Checking hardware…', 'No Git repository in the open folder.', 'Choose a model to see live memory and storage checks before installing.', 'Git actions use the open repository. Push and Pull contact its configured remote.'].map(text => [text, vscode.l10n.t(text)])))};</script><script nonce="${nonce}" src="${uri('settings.js')}"></script></body></html>`;
		panel.onDidDispose(() => { if (this.panel === panel) { this.panel = undefined; } });
		panel.webview.onDidReceiveMessage(message => { void this.message(message).catch(error => this.event({ type: 'settingsError', text: String(error) })); });
	}
	event(message: object) { const type = (message as { type?: string }).type || ''; if (/^installer|^modelInventory|^settings|^busy$/.test(type)) { void this.panel?.webview.postMessage(message); } }
	private root() { const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (!root) { throw new Error(vscode.l10n.t('Open a project folder first.')); } return root; }
	private async state() {
		const config = vscode.workspace.getConfiguration();
		this.event({ type: 'settingsState', fields: settingsFields.map(item => ({ ...item, title: vscode.l10n.t(item.title), description: vscode.l10n.t(item.description), section: vscode.l10n.t(item.section), value: config.get(item.key, item.value) })), usage: await this.host.usage.summary(), model: config.get('localforge.model'), hidden: this.context.globalState.get('aethrix.hiddenModels', []), busy: this.host.busy() });
	}
	private async models(rescan = false) {
		if (!this.hardware || rescan) { this.hardware = await scanHardware(path.join(this.context.extensionUri.fsPath, 'media/hardware.ps1')); }
		let installed: Awaited<ReturnType<typeof modelInventory>> = []; let error = '';
		try { installed = await modelInventory(); } catch (cause) { error = String(cause); }
		const context = vscode.workspace.getConfiguration('localforge').get('contextLength', 8192);
		this.event({ type: 'settingsModels', hardware: this.hardware, installed, error, recommended: recommend(this.hardware, context), models: modelCatalog.map(model => ({ ...model, ...assessFit(installed.find(item => item.name === model.name)?.disk || model.size, this.hardware!, context) })) });
	}
	private async gitState() {
		this.git = await findGit(vscode.workspace.getConfiguration('git').get<string>('path'));
		if (this.git) { await vscode.workspace.getConfiguration('git').update('path', this.git, vscode.ConfigurationTarget.Global); }
		try { if (!this.git) { throw new Error('Git is not installed or could not be found.'); } this.event({ type: 'settingsGit', binary: this.git, ...await gitStatus(this.git, this.root()) }); }
		catch (error) { this.event({ type: 'settingsGit', binary: this.git, error: String(error), files: [] }); }
	}
	private async gitAction(action: string, relative?: string) {
		if (this.gitBusy) { throw new Error('Another Git operation is running.'); }
		this.gitBusy = true;
		try {
			if (action === 'open') { await vscode.commands.executeCommand('workbench.view.scm'); return; }
			if (action === 'choose') { const files = await vscode.window.showOpenDialog({ filters: { Git: ['exe'] }, canSelectMany: false }); if (files?.[0]) { await gitRun(files[0].fsPath, this.root(), ['--version']); await vscode.workspace.getConfiguration('git').update('path', files[0].fsPath, vscode.ConfigurationTarget.Global); } await this.gitState(); return; }
			if (!vscode.workspace.isTrusted) { throw new Error('Trust the workspace before changing Git state.'); }
			const binary = this.git || await findGit(); if (!binary) { throw new Error('Install Git or choose its executable first.'); }
			const folder = this.root(); const root = action === 'init' ? folder : (await gitRun(binary, folder, ['rev-parse', '--show-toplevel'])).trim();
			if (action === 'init') { await gitRun(binary, root, ['init']); }
			else if (action === 'stage') { if (relative) { await stagePath(binary, root, relative); } else { await gitRun(binary, root, ['add', '-A', '--', '.']); } }
			else if (action === 'unstage') { let head = true; try { await gitRun(binary, root, ['rev-parse', '--verify', 'HEAD']); } catch { head = false; } await gitRun(binary, root, head ? ['reset', 'HEAD', '--', '.'] : ['rm', '--cached', '-r', '--ignore-unmatch', '--', '.']); }
			else if (action === 'commit') { const message = await vscode.window.showInputBox({ title: vscode.l10n.t('Commit Staged Changes'), prompt: vscode.l10n.t('Commit message'), ignoreFocusOut: true }); if (message?.trim()) { await gitRun(binary, root, ['commit', '-m', message.trim() + (vscode.workspace.getConfiguration('localforge').get('commitAttribution', false) ? '\n\nMade with Aethrix' : '')]); } }
			else if (action === 'branch') { const name = await vscode.window.showInputBox({ title: vscode.l10n.t('New Branch'), value: vscode.workspace.getConfiguration('localforge').get('branchPrefix', 'aethrix/') }); if (name) { await gitRun(binary, root, ['check-ref-format', '--branch', name]); if (name.startsWith('-')) { throw new Error('Invalid branch name.'); } await gitRun(binary, root, ['checkout', '-b', name]); } }
			else if (action === 'identity') { const name = await vscode.window.showInputBox({ title: vscode.l10n.t('Git Author Name'), ignoreFocusOut: true }); if (!name?.trim()) { return; } const email = await vscode.window.showInputBox({ title: vscode.l10n.t('Git Author Email'), ignoreFocusOut: true }); if (!email?.trim()) { return; } await gitRun(binary, root, ['config', '--local', 'user.name', name.trim()]); await gitRun(binary, root, ['config', '--local', 'user.email', email.trim()]); }
			else if (['fetch', 'pull', 'push'].includes(action)) { const confirmed = await vscode.window.showWarningMessage(vscode.l10n.t('Run Git {0} against this repository’s configured remote?', action), { modal: true }, vscode.l10n.t('Continue')); if (confirmed) { await gitRun(binary, root, action === 'pull' ? ['pull', '--ff-only'] : [action]); } }
			else if (action === 'diff' && relative) { const status = await gitStatus(binary, root); if (!status.files.some(item => item.path === relative)) { throw new Error('File is no longer in the change list.'); } await vscode.commands.executeCommand('git.openChange', vscode.Uri.file(path.join(status.root, relative))); }
			else if (action === 'review') { const diff = await gitRun(binary, root, ['diff', 'HEAD', '--no-ext-diff', '--', '.']); if (!diff.trim()) { throw new Error('No tracked changes to review.'); } await this.host.review(diff.slice(0, 24000)); }
			else if (action === 'remote') { const remote = (await gitRun(binary, root, ['remote', 'get-url', 'origin'])).trim().replace(/^git@github.com:/, 'https://github.com/').replace(/\.git$/, ''); const url = new URL(remote); if (url.protocol !== 'https:' || url.username || url.password) { throw new Error('Remote must have a public HTTPS web address.'); } await vscode.env.openExternal(vscode.Uri.parse(url.href)); }
			await vscode.commands.executeCommand('git.refresh').then(undefined, () => {}); await this.gitState();
		} finally { this.gitBusy = false; }
	}
	private async message(message: { type: string; key?: string; value?: unknown; action?: string; name?: string; path?: string }) {
		if (message.type === 'ready' || message.type === 'refresh') { await this.state(); return; }
		if (message.type === 'set') {
			const entry = validateSetting(message.key || '', message.value);
			if (entry.key === 'localforge.endpoint' && this.host.busy()) { throw new Error('Stop the agent before changing its server.'); }
			if (entry.key === 'localforge.autoApprove' && (!vscode.workspace.isTrusted || !vscode.workspace.workspaceFolders?.length)) { throw new Error('Open and trust a project before changing its approval mode.'); }
			await vscode.workspace.getConfiguration().update(entry.key, message.value, entry.key === 'localforge.autoApprove' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global); this.host.preferences(); await this.state(); this.event({ type: 'settingsSaved' });
		} else if (message.type === 'models') { await this.models(message.action === 'rescan'); }
		else if (message.type === 'model') { if (message.action === 'select' && message.name) { await this.host.selectModel(message.name); await this.state(); } else { await this.host.model(message.action || 'inspect', message.name); } }
		else if (message.type === 'visibility' && message.name && typeof message.value === 'boolean') { const hidden = new Set(this.context.globalState.get<string[]>('aethrix.hiddenModels', [])); if (message.value) { hidden.delete(message.name); } else { hidden.add(message.name); } await this.context.globalState.update('aethrix.hiddenModels', [...hidden]); this.host.preferences(); await this.state(); }
		else if (message.type === 'git') { if (!message.action || message.action === 'refresh') { await this.gitState(); } else { await this.gitAction(message.action, message.path); } }
		else if (message.type === 'command') {
			const commands: Record<string, string> = { editor: 'workbench.action.openSettings', keys: 'workbench.action.openGlobalKeybindings', extensions: 'workbench.view.extensions', logs: 'workbench.action.openLogsFolder' };
			if (commands[message.action || '']) { await vscode.commands.executeCommand(commands[message.action!]); }
			if (message.action === 'test') { const response = await fetch(ollamaEndpoint() + '/api/version', { signal: AbortSignal.timeout(5000) }); if (!response.ok) { throw new Error('Ollama HTTP ' + response.status); } this.event({ type: 'settingsNotice', text: vscode.l10n.t('Connected to Ollama {0}', (await response.json() as { version: string }).version) }); }
			if (message.action === 'preview') { const address = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Local preview URL'), value: 'http://localhost:3000' }); if (address) { const url = new URL(address); if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) { throw new Error('Enter a local HTTP preview URL.'); } if (vscode.workspace.getConfiguration('localforge').get('openLocalInBrowser', true)) { await vscode.commands.executeCommand('simpleBrowser.show', address); } else { await vscode.env.openExternal(vscode.Uri.parse(address)); } } }
			if (message.action === 'export') { const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('aethrix-usage.json'), filters: { JSON: ['json'] } }); if (uri) { await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(await this.host.usage.summary(), null, 2))); } }
			if (message.action === 'import') {
				const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'VS Code settings': ['json'] }, defaultUri: vscode.Uri.file(path.join(process.env.APPDATA || '', 'Code/User/settings.json')) });
				if (files?.[0]) { const parser = require('jsonc-parser') as { parse(text: string): Record<string, unknown> }; const values = parser.parse(await fs.readFile(files[0].fsPath, 'utf8')); const entries = settingsFields.filter(item => !item.key.startsWith('localforge.') && values[item.key] !== undefined); for (const item of entries) { validateSetting(item.key, values[item.key]); } const yes = await vscode.window.showInformationMessage(vscode.l10n.t('Import {0} supported editor preferences? Existing values for these preferences will be replaced.', entries.length), { modal: true }, vscode.l10n.t('Import')); if (yes) { for (const item of entries) { await vscode.workspace.getConfiguration().update(item.key, values[item.key], vscode.ConfigurationTarget.Global); } await this.state(); } }
			}
		}
	}
}
