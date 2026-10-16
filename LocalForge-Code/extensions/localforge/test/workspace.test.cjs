/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');

test('bundled assistant enforces workspace boundaries and produces valid webview JavaScript', async () => {
	const root = path.resolve(__dirname, '../../../..', '.build/localforge-tool-test/project');
	const outside = path.resolve(root, '..', 'outside');
	fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(outside, { recursive: true });
	fs.writeFileSync(path.join(root, 'main.cpp'), 'int main() { return 0; }');
	const file = path.resolve(__dirname, '../out/extension.js');
	const nativeRequire = createRequire(file);
	let provider;
	let approvalMode = 'off';
	const disposable = { dispose() { } };
	const vscode = { WorkspaceEdit: undefined, Range: undefined, Position: undefined,
		Uri: { joinPath: (_, ...segments) => ({ fsPath: path.join(root, ...segments) }) },
		l10n: { t: (text, ...args) => text.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)])) },
		window: {
			activeTextEditor: undefined,
			createOutputChannel: () => ({ ...disposable, appendLine() { }, append() { }, show() { } }),
			onDidChangeActiveTextEditor: () => disposable,
			registerWebviewViewProvider: (_, value) => { provider = value; return disposable; }
		},
		workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: root } }], registerTextDocumentContentProvider: () => disposable, getConfiguration: () => ({ get: (key, fallback) => key === 'autoApprove' ? approvalMode : fallback }) },
		commands: { registerCommand: () => disposable }
	};
	const exports = {};
	let installSize = 9e9; let installedPulls = 0;
	const installHardware = { cpu: 'Example CPU', cores: 16, ram: 32 * 1073741824, availableRam: 24 * 1073741824, gpus: [{ name: 'Example GPU', memory: 16 * 1073741824 }], modelPath: 'C:/models', diskFree: 200 * 1073741824, scanned: '' };
	let repairNext = false;
	let requestCount = 0; let transportMode = ''; let transportStep = 0; let resumedMessages; let activeRequests = 0; let peakRequests = 0; let workerResults; let lastModel;
	const transport = { streamChat: async (_model, _messages, _tools, _length, _signal, onText) => {
		requestCount++;
		lastModel = _model;
		if (transportMode === 'worker') {
			if (transportStep++ === 0) { return { role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: 'should-not-exist.cpp', content: 'bad' } } }, { function: { name: 'read_file', arguments: { path: 'main.cpp' } } }] }; }
			workerResults = _messages.filter(message => message.role === 'tool'); return { role: 'assistant', content: 'Verified main.cpp; prohibited write was rejected.' };
		}
        if (transportMode === 'queue') { activeRequests++; peakRequests = Math.max(peakRequests, activeRequests); await new Promise(resolve => setTimeout(resolve, 15)); activeRequests--; }
        if (transportMode === 'interrupt') { if (transportStep++ === 0) { return { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'main.cpp' } } }] }; } throw new Error('simulated connection loss'); }
        if (transportMode === 'resume') { resumedMessages = _messages; }
		if (repairNext) { repairNext = false; throw new (nativeRequire('./toolProtocol').ToolProtocolError)('Incomplete tool request'); }
		onText('Saved assistant response');
		return { role: 'assistant', content: 'Saved assistant response' };
	} };
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), { exports, require: name => name === 'vscode' ? vscode : name === './providerConnections' ? { ProviderConnections: class { async choose() {} provider() { return 'ollama'; } model() { return 'qwen3-coder:30b'; } async status() { return { selected: 'ollama', keys: {}, cli: {}, models: {} }; } respond(_provider, ...args) { return transport.streamChat(...args); } } } : name === './settingsPanel' ? { AethrixSettings: class { event() {} dispose() {} open() {} } } : name === './inlineCompletion' ? { registerLocalCompletion() {} } : name === './ollama' ? transport : name === './cppSupport' ? {} : name === './modelAdvisor' ? { ...nativeRequire(name), scanHardware: async () => installHardware, inspectModel: async name => ({ name, size: installSize }) } : name === './modelManager' ? { modelInventory: async () => [{ name: 'test-model', disk: 1e9 }], pullModel: async () => { installedPulls++; } } : nativeRequire(name), Buffer, AbortController, AbortSignal, setInterval, clearInterval, setTimeout, clearTimeout, process, console }, { filename: file });
	let activeId; const savedState = new Map();
	const context = { subscriptions: [], globalState: { get: (key, fallback) => key === 'welcomed' ? true : fallback }, workspaceState: { get: key => key === 'localforge.activeChat' ? activeId : savedState.get(key), update: async (key, value) => { if (key === 'localforge.activeChat') { activeId = value; } else { savedState.set(key, value); } } }, globalStorageUri: { fsPath: path.join(root, 'chat-storage', randomUUID()) } };
	context.extensionUri = { fsPath: path.resolve(__dirname, '..') };
	exports.activate(context);
	assert.equal(await provider.resolve('main.cpp'), path.join(root, 'main.cpp'));
	assert.deepEqual([provider.autoApproves('files'), provider.autoApproves('commands')], [false, false]);
	approvalMode = 'files';
	assert.deepEqual([provider.autoApproves('files'), provider.autoApproves('commands')], [true, false]);
	approvalMode = 'all';
	assert.deepEqual([provider.autoApproves('files'), provider.autoApproves('commands')], [true, true]);
	for (const unsafe of ['../escape.cpp', 'C:\\outside.cpp', '.git/config', '.localforge/config', 'x:stream']) {
		await assert.rejects(provider.resolve(unsafe));
	}
	const link = path.join(root, 'outside-link');
	if (!fs.existsSync(link)) { fs.symlinkSync(outside, link, 'junction'); }
	await assert.rejects(provider.resolve('outside-link/escape.cpp'), /outside project/);
	vscode.workspace.isTrusted = false;
	assert.deepEqual([provider.autoApproves('files'), provider.autoApproves('commands')], [false, false]);
	await assert.rejects(provider.resolve('main.cpp'), /Trust/);
	vscode.workspace.findFiles = async () => [{ fsPath: path.join(root, 'main.cpp') }];
	vscode.workspace.asRelativePath = uri => path.relative(root, uri.fsPath);
	vscode.workspace.openTextDocument = async file => ({ getText: () => fs.readFileSync(file, 'utf8') });
	const signal = new AbortController().signal;
	assert.equal(await provider.tool({ function: { name: 'list_files', arguments: {} } }, signal), 'main.cpp');
	assert.equal(await provider.tool({ function: { name: 'read_file', arguments: { path: 'main.cpp' } } }, signal), 'int main() { return 0; }');
	await assert.rejects(provider.tool({ function: { name: 'read_file', arguments: { path: '../outside/secret.cpp' } } }, signal), /outside/);
	await assert.rejects(provider.tool({ function: { name: 'read_file', arguments: { path: 'outside-link/secret.cpp' } } }, signal), /outside/);
	await assert.rejects(provider.tool({ function: { name: 'write_file', arguments: { path: 'main.cpp', content: 'changed' } } }, signal), /Trust/);
	await assert.rejects(provider.tool({ function: { name: 'run_command', arguments: { command: 'echo test' } } }, signal), /Trust/);
	vscode.workspace.isTrusted = true;
	const events = [];
	const view = { webview: { options: {}, html: '', onDidReceiveMessage: () => disposable, asWebviewUri: () => ({ toString: () => 'vscode-resource:/chat.js' }), postMessage: async message => { events.push(message); return true; } }, onDidDispose: () => disposable };
	provider.resolveWebviewView(view);
	fs.writeFileSync(path.join(root, 'chat-preview.html'), view.webview.html);
	const script = view.webview.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
	assert.doesNotThrow(() => new vm.Script(script));
	assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.resolve(__dirname, '../media/chat.js'), 'utf8')));
	assert.match(view.webview.html, /Content-Security-Policy/);
	assert.match(view.webview.html, /var\(--vscode-sideBar-background\)/);
	assert.match(view.webview.html, /id="approval"/);
	await provider.ready;
	await provider.chat('Please review my Python script', false);
	const firstId = provider.current.id;
	assert.equal(provider.current.title, 'review my Python script');
	await provider.reset();
	assert.equal(provider.current.entries.length, 0);
	await provider.chat('Explain my C++ driver', false);
	const secondId = provider.current.id;
	await provider.selectChat(firstId);
	assert.equal(provider.current.id, firstId);
	assert.equal(provider.current.entries.at(-1).text, 'Saved assistant response');
	assert.ok(events.some(event => event.type === 'transcript' && event.entries.length > 0));
	repairNext = true;
	const before = requestCount;
	await provider.chat('Continue reviewing', false);
	assert.equal(requestCount - before, 2, 'malformed model output is repaired once automatically');
	assert.equal(provider.current.entries.some(entry => entry.role === 'error'), false);
	// Exercise the actual host write/undo workflow, not only journal serialization.
	vscode.Uri.file = file => ({ fsPath: file });
	vscode.Uri.parse = value => ({ toString: () => value });
	vscode.Range = class { constructor(start, end) { this.start = start; this.end = end; } };
	vscode.Position = class { constructor(line, character) { this.line = line; this.character = character; } };
	vscode.WorkspaceEdit = class {
		operations = [];
		replace(uri, range, content) { this.operations.push({ kind: 'write', uri, content, range }); }
		createFile() { }
		insert(uri, _position, content) { this.operations.push({ kind: 'write', uri, content }); }
		deleteFile(uri) { this.operations.push({ kind: 'delete', uri }); }
	};
	vscode.workspace.textDocuments = [];
	vscode.workspace.openTextDocument = async input => {
		const file = typeof input === 'string' ? input : input.fsPath;
		return { uri: { fsPath: file }, isDirty: false, version: 1, getText: () => fs.readFileSync(file, 'utf8'), positionAt: offset => ({ offset }), save: async () => true };
	};
	vscode.workspace.applyEdit = async edit => { for (const operation of edit.operations) { if (operation.kind === 'delete') { fs.unlinkSync(operation.uri.fsPath); } else { const existing = fs.existsSync(operation.uri.fsPath) ? fs.readFileSync(operation.uri.fsPath, 'utf8') : ''; fs.writeFileSync(operation.uri.fsPath, operation.range ? existing.slice(0, operation.range.start.offset) + operation.content + existing.slice(operation.range.end.offset) : operation.content); } } return true; };
	vscode.workspace.fs = { createDirectory: async uri => fs.mkdirSync(uri.fsPath, { recursive: true }), writeFile: async (uri, bytes) => fs.writeFileSync(uri.fsPath, bytes) };
	vscode.window.showTextDocument = async () => { };
	approvalMode = 'all';
	provider.request = undefined;
	await provider.tool({ function: { name: 'read_file', arguments: { path: 'main.cpp' } } }, signal);
	await provider.tool({ function: { name: 'write_file', arguments: { path: 'main.cpp', content: 'int changed = 1;' } } }, signal);
	await provider.tool({ function: { name: 'write_file', arguments: { path: 'new-file.cpp', content: 'int added = 2;' } } }, signal);
	await provider.tool({ function: { name: 'edit_file', arguments: { path: 'main.cpp', old_text: 'changed = 1', new_text: 'changed = 3' } } }, signal);
	assert.equal(fs.readFileSync(path.join(root, 'main.cpp'), 'utf8'), 'int changed = 3;', 'applies a range replacement without destroying surrounding code');
	const changeId = provider.request.id;
	assert.equal(provider.request.files.length, 2);
	await provider.undo(changeId);
	assert.equal(fs.readFileSync(path.join(root, 'main.cpp'), 'utf8'), 'int main() { return 0; }');
	assert.equal(fs.existsSync(path.join(root, 'new-file.cpp')), false);
	assert.equal((await provider.changes.list(root)).find(item => item.id === changeId).undone, true);
	const sourceText = fs.readFileSync(path.join(root, 'main.cpp'), 'utf8');
	provider.inlineTarget = { path: 'main.cpp', start: sourceText.indexOf('return 0'), end: sourceText.indexOf('return 0') + 8, version: 1 };
	await provider.tool({ function: { name: 'read_file', arguments: { path: 'main.cpp' } } }, signal);
	let previews = 0; let approvals = 0;
	vscode.commands.executeCommand = async name => { if (name === 'vscode.diff') { previews++; } };
	vscode.window.showInformationMessage = async () => { approvals++; return 'Apply'; };
	await assert.rejects(provider.tool({ function: { name: 'edit_file', arguments: { path: 'main.cpp', old_text: 'int main', new_text: 'int other' } } }, signal), /outside the original selection/);
	await provider.tool({ function: { name: 'edit_file', arguments: { path: 'main.cpp', old_text: 'return 0', new_text: 'return 1' } } }, signal);
	assert.equal(previews, 1); assert.equal(approvals, 1, 'inline changes require preview approval even with auto-approve all');
	provider.inlineTarget = undefined;
	assert.match(await provider.runCommand("Write-Output 'command works'", signal), /Exit 0[\s\S]*command works/);
	assert.match(await provider.runCommand('cmd.exe /c exit 7', signal), /Exit 7/);
	const cancellation = new AbortController();
	const running = provider.runCommand('Start-Sleep -Seconds 30', cancellation.signal);
	setTimeout(() => cancellation.abort(), 300);
	await assert.rejects(running, /canceled|abort/i);
	await provider.selectChat(secondId);
	provider.dispose();
	exports.activate(context);
	await provider.ready;
	assert.equal(provider.current.id, secondId, 'active chat is restored when the assistant restarts');
	assert.equal(provider.current.entries.at(-1).text, 'Saved assistant response');
	await provider.reset(); transportMode = 'interrupt'; transportStep = 0;
	await provider.chat('Review and continue safely', false);
	assert.equal(provider.current.checkpoint.completed, 1);
	const interruptedId = provider.current.id;
	provider.dispose(); exports.activate(context); await provider.ready;
	assert.equal(provider.current.id, interruptedId);
	assert.equal(provider.current.checkpoint.completed, 1, 'checkpoint survives extension restart');
	transportMode = 'resume';
	await provider.action('resume');
	assert.ok(resumedMessages.some(message => message.role === 'tool' && message.tool_name === 'read_file'));
	assert.ok(resumedMessages.some(message => message.role === 'system' && /Do not repeat completed actions/.test(message.content)));
	assert.equal(provider.current.checkpoint, undefined, 'successful recovery clears the checkpoint');
	transportMode = 'queue';
	await provider.enqueue('Queued first request', false); await provider.enqueue('Queued second request', false);
	assert.equal(provider.requestQueue.items.filter(item => item.state === 'queued').length, 2);
	provider.requestQueue.paused = false;
	await Promise.all([provider.drainQueue(), provider.drainQueue()]);
	assert.equal(peakRequests, 1, 'the queue never makes concurrent model requests');
	assert.equal(provider.requestQueue.items.filter(item => item.state === 'done').length, 2);
	transportMode = 'interrupt'; transportStep = 0; provider.requestQueue.paused = true;
	await provider.enqueue('Interrupted queued request', false); await provider.enqueue('Must wait', false);
	provider.requestQueue.paused = false; await provider.drainQueue();
	assert.equal(provider.requestQueue.paused, true);
	assert.equal(provider.requestQueue.items.at(-1).state, 'queued', 'failure stops subsequent work');
	// Clarification never invokes the model, tools, or shell before the user responds.
	transportMode = ''; await provider.reset(); provider.current.mode = 'ask'; provider.requestQueue.items = [];
	const clarificationCount = requestCount;
	await provider.submit('Explain this repository', false);
	assert.equal(requestCount, clarificationCount);
	assert.ok(provider.current.question);
	await provider.enqueue('Independent job must wait', false);
	provider.requestQueue.paused = false; await provider.drainQueue();
	assert.ok(provider.current.question, 'a queued job cannot answer pending questions');
	assert.equal(requestCount, clarificationCount, 'clarification pauses queued model execution');
	await provider.submit('Focus on main.cpp, use defaults otherwise', false);
	assert.equal(provider.current.question, undefined);
	assert.equal(requestCount, clarificationCount + 1);
	provider.workflow = { mode: 'plan', evidence: [], workers: 0 };
	await assert.rejects(provider.tool({ function: { name: 'write_file', arguments: { path: 'no.cpp', content: 'bad' } } }, signal), /blocked/);
	await provider.savePlan('# Test Plan\n\n1. Inspect main.cpp\n2. Build and verify', 'test-model');
	const savedPlan = provider.current.plan;
	assert.equal(fs.readFileSync(path.join(root, savedPlan.path), 'utf8').startsWith('# Test Plan'), true);
	assert.equal(requestCount, clarificationCount + 1, 'saving a plan never starts implementation');
	await assert.rejects(provider.planAction('build', '.aethrix/plans/wrong/plan.md'), /owns this plan/);
	provider.workflow = undefined;
	await provider.planAction('build', savedPlan.path);
	assert.equal(provider.current.mode, 'normal');
	assert.equal(lastModel, 'test-model', 'Build uses the model selected for the plan');
	assert.equal(requestCount, clarificationCount + 2, 'only explicit Build starts the implementing request');
	provider.workflow = { mode: 'debug', evidence: [], workers: 0, log: path.join(root, 'debug-test.jsonl') };
	await assert.rejects(provider.tool({ function: { name: 'edit_file', arguments: {} } }, signal), /blocked/);
	provider.buildResult = 'Exit 1\nmain.cpp:1: error: missing semicolon';
	assert.match(await provider.tool({ function: { name: 'collect_debug_evidence', arguments: {} } }, signal), /^E1:/);
	await assert.rejects(provider.tool({ function: { name: 'record_hypothesis', arguments: { hypothesis: 'guess', evidence_ids: 'E999' } } }, signal), /actual evidence/);
	await provider.tool({ function: { name: 'record_hypothesis', arguments: { hypothesis: 'Missing semicolon explains the compiler failure', evidence_ids: 'E1' } } }, signal);
	assert.match(fs.readFileSync(provider.workflow.log, 'utf8'), /"event":"hypothesis"/);
	transportMode = 'worker'; transportStep = 0; provider.workflow = { mode: 'multi', evidence: [], workers: 0 };
	assert.match(await provider.tool({ function: { name: 'delegate_task', arguments: { task: 'Inspect main.cpp' } } }, signal), /Verified/);
	assert.equal(fs.existsSync(path.join(root, 'should-not-exist.cpp')), false);
	assert.match(workerResults[0].content, /blocked/);
	assert.match(workerResults[1].content, /int main/);
	assert.equal(provider.worker, false);
	provider.workflow = undefined;
	// The installer rechecks both hardware and actual registry size before pulling.
	await provider.modelInstaller('install', 'qwen2.5-coder:14b');
	assert.equal(installedPulls, 1);
	let modelWarnings = 0;
	vscode.window.showWarningMessage = async () => { modelWarnings++; return undefined; };
	installSize = 43e9;
	await provider.modelInstaller('install', 'deepseek-r1:70b');
	assert.equal(modelWarnings, 1, 'oversized models require a warning before downloading');
	assert.equal(installedPulls, 1, 'declining the warning prevents the pull');
	installSize = 9e9; installHardware.diskFree = 1073741824;
	await provider.modelInstaller('install', 'qwen2.5-coder:14b');
	assert.equal(installedPulls, 1, 'insufficient storage prevents downloads');
	assert.equal(provider.modelDownload, undefined, 'installer always releases its download lock');
	provider.dispose();
});
