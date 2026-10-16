const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { UsageStore, changedLines } = require('../out/usageStore');
const { findGit, gitRun, gitStatus, stagePath, parseGitStatus } = require('../out/gitSupport');
const { setOllamaEndpoint, ollamaEndpoint } = require('../out/localRuntime');

test('usage persists concurrent counters and counts disjoint line edits without counting unchanged lines', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aethrix-usage-'));
	try {
		const file = path.join(directory, 'usage.json'); const store = new UsageStore(file);
		await Promise.all(Array.from({ length: 10 }, () => store.add({ requests: 1, inputTokens: 12, outputTokens: 4 })));
		const edit = changedLines('a\nb\nc\nd\ne\n', 'x\nb\nc\nd\ny\n');
		assert.deepEqual(edit, { linesAdded: 2, linesRemoved: 2 });
		assert.deepEqual(changedLines('same\r\n', 'same\n'), { linesAdded: 0, linesRemoved: 0 });
		await store.add({ filesEdited: 1, ...edit }); const snapshot = await new UsageStore(file).summary();
		assert.equal(snapshot.total.requests, 10); assert.equal(snapshot.total.inputTokens, 120); assert.equal(snapshot.total.linesAdded, 2); assert.equal(snapshot.total.linesRemoved, 2);
		assert.equal(JSON.stringify(snapshot).includes('a\nb\nc'), false);
	} finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('settings accepts only supported values and prevents nonlocal inference destinations', async () => {
	const file = path.resolve(__dirname, '../out/settingsPanel.js'); const native = createRequire(file); const exports = {}; const updates = [];
	const vscode = { l10n: { t: text => text }, ConfigurationTarget: { Global: 1, Workspace: 2 }, workspace: { isTrusted: false, workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async (...args) => updates.push(args) }) } };
	vm.runInNewContext(await fs.readFile(file, 'utf8'), { exports, require: name => name === 'vscode' ? vscode : native(name), Buffer, URL, AbortSignal, process, console });
	const { validateSetting, AethrixSettings } = exports;
	assert.throws(() => validateSetting('unknown', true)); assert.throws(() => validateSetting('localforge.chatFontSize', 99)); assert.throws(() => validateSetting('localforge.autoApprove', 'invalid'));
	assert.throws(() => validateSetting('localforge.endpoint', 'https://example.com'));
	const previous = ollamaEndpoint(); validateSetting('localforge.endpoint', 'http://localhost:11435'); assert.equal(ollamaEndpoint(), previous);
	const panel = new AethrixSettings({}, { preferences() {}, busy: () => false });
	await assert.rejects(panel.message({ type: 'set', key: 'localforge.autoApprove', value: 'all' }), /trust/i);
	assert.equal(updates.length, 0);
});

test('Git source control stages, commits, branches, and reports changes in a real isolated repository', async () => {
	const binary = await findGit(); assert.ok(binary, 'Git is required for this integration test');
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aethrix-git-'));
	try {
		await gitRun(binary, directory, ['init']); await gitRun(binary, directory, ['config', 'user.name', 'Aethrix Test']); await gitRun(binary, directory, ['config', 'user.email', 'test@example.invalid']);
		await fs.writeFile(path.join(directory, 'file with spaces.cpp'), 'int main() {}\n');
		assert.equal((await gitStatus(binary, directory)).files[0].worktree, '?');
		await stagePath(binary, directory, 'file with spaces.cpp'); assert.equal((await gitStatus(binary, directory)).files[0].index, 'A');
		await gitRun(binary, directory, ['commit', '-m', 'Initial fixture']); await gitRun(binary, directory, ['checkout', '-b', 'aethrix/test']);
		assert.equal((await gitStatus(binary, directory)).branch, 'aethrix/test'); assert.equal((await gitStatus(binary, directory)).files.length, 0);
		await fs.writeFile(path.join(directory, 'file with spaces.cpp'), 'int main() { return 0; }\n'); assert.equal((await gitStatus(binary, directory)).files[0].worktree, 'M');
		await assert.rejects(stagePath(binary, directory, '../outside.cpp'));
		assert.deepEqual(parseGitStatus('R  new.cpp\0old.cpp\0?? next.cpp\0').map(file => file.path), ['new.cpp', 'next.cpp']);
	} finally { await fs.rm(directory, { recursive: true, force: true }); }
});
