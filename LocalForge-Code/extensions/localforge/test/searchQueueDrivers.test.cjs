const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ChatArchive } = require('../out/chatArchive');
const { restoreQueue, enqueueRequest } = require('../out/requestQueue');
const { dumpKind, microsoftSymbols, analyzeDump } = require('../out/driverTools');

test('chat search matches titles, message contents, and filenames with explicit project scope', async () => {
	const storage = path.resolve(__dirname, '../../../../.build/history-search', randomUUID());
	const archive = new ChatArchive(storage);
	const first = archive.create('project-one'); first.title = 'Driver crash'; first.entries = [{ role: 'user', text: 'Inspect ntddk.h and fix DriverEntry' }];
	const second = archive.create('project-two'); second.title = 'Other project'; second.entries = [{ role: 'assistant', text: 'DriverEntry is the entry point' }];
	await archive.save(first); await archive.save(second);
	assert.equal((await archive.search('driver crash', 'project-one'))[0].id, first.id);
	assert.equal((await archive.search('NTDDK.H', 'project-one'))[0].id, first.id);
	assert.equal((await archive.search('DriverEntry')).length, 2);
	assert.equal((await archive.search('DriverEntry', 'project-one')).length, 1);
	assert.equal((await archive.search('does not exist')).length, 0);
});
test('queue preserves FIFO, captures context paths, and pauses interrupted work on restore', () => {
	const queue = restoreQueue(undefined);
	const first = enqueueRequest(queue, 'first', 'chat-one', ['main.cpp', 'main.cpp']);
	enqueueRequest(queue, 'second', 'chat-one', []);
	assert.deepEqual(queue.items.map(item => item.prompt), ['first', 'second']);
	assert.deepEqual(first.files, ['main.cpp']);
	first.state = 'running'; queue.paused = false;
	const restored = restoreQueue(JSON.parse(JSON.stringify(queue)));
	assert.equal(restored.paused, true); assert.equal(restored.items[0].state, 'interrupted'); assert.equal(restored.items[1].state, 'queued');
	assert.throws(() => enqueueRequest(queue, ' ', 'chat', []));
});
test('dump inspection distinguishes kernel and user dumps and rejects invalid files', async () => {
	const root = path.resolve(__dirname, '../../../../.build/dump-header-test', randomUUID()); await fs.mkdir(root, { recursive: true });
	const user = path.join(root, 'user.dmp'); const kernel = path.join(root, 'kernel.dmp'); const invalid = path.join(root, 'bad.dmp');
	await fs.writeFile(user, 'MDMPxxxx'); await fs.writeFile(kernel, 'PAGEDU64'); await fs.writeFile(invalid, 'not-dump');
	assert.equal(await dumpKind(user), 'user'); assert.equal(await dumpKind(kernel), 'kernel');
	await assert.rejects(dumpKind(invalid), /Unrecognized/);
	await assert.rejects(analyzeDump('never-execute.exe', user, 'bad\npath', new AbortController().signal, () => {}), /Invalid symbol/);
	assert.equal(microsoftSymbols('C:\\cache', 'C:\\pdb'), 'C:\\pdb;srv*C:\\cache*https://msdl.microsoft.com/download/symbols');
});
