const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ChangeStore } = require('../out/changeStore');
const { searchRepository, parseBuildIssues } = require('../out/repoTools');

test('file-change groups survive restart and refuse undo after subsequent edits', async () => {
	const root = path.resolve(__dirname, '../../../../.build/change-test', randomUUID());
	await fs.mkdir(root, { recursive: true });
	const store = new ChangeStore(path.join(root, 'history'));
	const request = store.create(root, 'Update both files');
	await fs.writeFile(path.join(root, 'first.cpp'), 'after');
	await fs.writeFile(path.join(root, 'new.cpp'), 'new');
	await store.record(request, 'first.cpp', 'before', 'after');
	await store.record(request, 'first.cpp', 'after', 'after again');
	await fs.writeFile(path.join(root, 'first.cpp'), 'after again');
	await store.record(request, 'new.cpp', null, 'new');
	const saved = (await new ChangeStore(path.join(root, 'history')).list(root))[0];
	assert.equal(saved.files[0].before, 'before', 'keeps the state before the entire request');
	assert.equal(saved.files[1].before, null, 'tracks newly created files');
	const resolve = async relative => path.join(root, relative);
	await store.validateUndo(saved, resolve, () => false);
	await assert.rejects(store.validateUndo(saved, resolve, () => true), /changes made after/);
	await fs.writeFile(path.join(root, 'first.cpp'), 'manual edit');
	await assert.rejects(store.validateUndo(saved, resolve, () => false), /changes made after/);
	assert.equal(await fs.readFile(path.join(root, 'new.cpp'), 'utf8'), 'new', 'preflight leaves all files unchanged');
	assert.deepEqual(await store.list(root + '-other'), []);
});

test('repository search finds symbols and line numbers without evaluating shell text', async () => {
	const root = path.resolve(__dirname, '../../../../.build/search-test', randomUUID());
	await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
	await fs.writeFile(path.join(root, 'main.cpp'), 'void needle() {}\n// literal $(bad)\n');
	await fs.writeFile(path.join(root, 'notes.txt'), 'needle\n');
	await fs.writeFile(path.join(root, 'node_modules/hidden.cpp'), 'needle\n');
	const binary = path.resolve(__dirname, '../../../../VSCode-win32-x64/resources/app/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/win32-x64/rg.exe');
	const signal = new AbortController().signal;
	const result = await searchRepository(binary, root, 'needle', '**/*.cpp', signal);
	assert.match(result, /main.cpp:1:/);
	assert.doesNotMatch(result, /notes.txt|hidden.cpp/);
	assert.match(await searchRepository(binary, root, '$(bad)', undefined, signal), /main.cpp:2:/);
	assert.equal(await searchRepository(binary, root, 'not present', undefined, signal), 'No matches found.');
	await assert.rejects(searchRepository(binary, root, 'needle', '../*', signal), /project-relative/);
});

test('compiler diagnostics resolve MSVC and Clang positions and exclude external files', () => {
	const root = path.resolve(__dirname, '../../../../.build/diagnostics');
	const results = parseBuildIssues(`main.cpp(12,4): error C2065: missing identifier\nother.cpp:5:2: warning: unused variable\n${path.resolve(root, '../outside.cpp')}(1): error C1: outside`, root);
	assert.equal(results.length, 2);
	assert.equal(results[0].line, 11);
	assert.equal(results[0].column, 3);
	assert.equal(results[0].severity, 'error');
	assert.equal(results[1].severity, 'warning');
});
