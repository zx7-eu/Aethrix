/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recoverToolCalls, visibleResponseText } = require('../out/toolProtocol.js');
const tools = [{ type: 'function', function: { name: 'write_file', parameters: { properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }];
const xml = '<function=write_file>\n<parameter=path>\nhello.py\n</parameter>\n<parameter=content>\nprint("hi")\n</parameter>\n</function>\n</tool_call>';
test('recovers the exact leaked function call shown in the user screenshot', () => {
	assert.deepEqual(recoverToolCalls(xml, tools), { content: '', calls: [{ function: { name: 'write_file', arguments: { path: 'hello.py', content: 'print("hi")' } } }] });
});
test('preserves code indentation and handles a complete wrapper', () => {
	const result = recoverToolCalls('I will propose a file.\n<tool_call>' + xml.replace('print("hi")', 'def hello():\n    print("hi")'), tools);
	assert.equal(result.content, 'I will propose a file.');
	assert.equal(result.calls[0].function.arguments.content, 'def hello():\n    print("hi")');
});
test('never treats fenced examples as executable requests', () => {
	const example = 'Example only:\n```text\n' + xml + '\n```';
	assert.deepEqual(recoverToolCalls(example, tools), { content: example, calls: [] });
});
test('rejects truncated or unsupported calls', () => {
	assert.throws(() => recoverToolCalls(xml.replace('</function>', ''), tools), /incomplete/);
	assert.throws(() => recoverToolCalls(xml.replace('write_file', 'delete_all'), tools), /Unsupported/);
	assert.throws(() => recoverToolCalls(xml.replace('</parameter>', '</wrong>'), tools), /Incomplete|Invalid/);
});
test('hides tool protocol and partial opening markers during streaming', () => {
	for (let index = 1; index < '<function='.length; index++) { assert.equal(visibleResponseText('Working.\n' + '<function='.slice(0, index)), 'Working.'); }
	assert.equal(visibleResponseText('Working.\n' + xml), 'Working.');
});
test('discards an empty trailing tool wrapper after a successful summary', () => {
	assert.deepEqual(recoverToolCalls('The script ran and printed hi.\n<tool_call>\n</tool_call>', tools), { content: 'The script ran and printed hi.', calls: [] });
	assert.deepEqual(recoverToolCalls('Finished.\n<tool_call>', tools), { content: 'Finished.', calls: [] });
});
