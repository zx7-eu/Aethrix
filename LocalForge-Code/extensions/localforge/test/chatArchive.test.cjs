/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ChatArchive, titleFromPrompt } = require('../out/chatArchive.js');

test('names chats from the first request and bounds long titles', () => {
	assert.equal(titleFromPrompt('Please make a Python script\nthat prints hi'), 'make a Python script that prints hi');
	assert.ok(titleFromPrompt('a '.repeat(100)).length <= 58);
});
test('persists multiple conversations, context and tool results across reloads', async () => {
	const directory = path.resolve(__dirname, '../../../..', '.build/chat-archive-tests', randomUUID());
	const archive = new ChatArchive(directory);
	const first = archive.create('project-a'); first.title = titleFromPrompt('Create a greeting script');
	first.entries = [{ role: 'user', text: 'Create a greeting script' }, { role: 'tool', text: 'write_file: Applied hello.py.' }];
	first.context = [{ role: 'user', content: 'Create a greeting script' }, { role: 'assistant', content: 'Created hello.py.' }];
	const second = archive.create('project-a'); second.entries = [{ role: 'user', text: 'Review code' }];
	await Promise.all([archive.save(first), archive.save(second)]);
	const loaded = await new ChatArchive(directory).load('project-a');
	assert.equal(loaded.length, 2);
	assert.deepEqual(loaded.find(session => session.id === first.id), first);
	assert.deepEqual(await archive.load('another-project'), []);
	first.entries.push({ role: 'assistant', text: 'Saved reply' }); await archive.save(first);
	assert.equal((await archive.load('project-a')).find(session => session.id === first.id).entries.length, 3);
});
