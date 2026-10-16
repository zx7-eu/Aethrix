/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { streamChat } = require('../out/ollama.js');

async function server(handler, run) {
	const instance = createServer(handler);
	await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
	try { await run(`http://127.0.0.1:${instance.address().port}`); }
	finally { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); }
}

test('streams fragmented UTF-8 text and tool calls before completion', async () => {
	await server((request, response) => {
		assert.equal(request.url, '/api/chat');
		response.setHeader('Content-Type', 'application/x-ndjson');
		const first = Buffer.from(JSON.stringify({ message: { content: 'Hello λ' } }) + '\n');
		response.write(first.subarray(0, first.length - 4));
		setTimeout(() => {
			response.write(first.subarray(first.length - 4));
			response.end(JSON.stringify({ message: { tool_calls: [{ function: { name: 'read_file', arguments: { path: 'main.cpp' } } }] }, done: true }));
		}, 10);
	}, async endpoint => {
		const texts = [];
		const result = await streamChat('test', [{ role: 'user', content: 'hello' }], [], 8192, new AbortController().signal, text => texts.push(text), () => { }, endpoint);
		assert.deepEqual({ content: result.content, tools: result.tool_calls, texts }, { content: 'Hello λ', tools: [{ function: { name: 'read_file', arguments: { path: 'main.cpp' } } }], texts: ['Hello λ'] });
	});
});
test('reports Ollama HTTP errors instead of hanging', async () => {
	await server((_, response) => { response.writeHead(404); response.end('model is not installed'); }, async endpoint => {
		await assert.rejects(streamChat('missing', [], [], 8192, new AbortController().signal, () => { }, () => { }, endpoint), /404.*model is not installed/);
	});
});

test('usage tokens come from the completed Ollama response rather than estimates', async () => {
	await server((_, response) => response.end(JSON.stringify({ message: { content: 'done' }, done: true, prompt_eval_count: 123, eval_count: 17 }) + '\n'), async endpoint => {
		const reply = await streamChat('test', [], [], 8192, new AbortController().signal, () => {}, () => {}, endpoint);
		assert.deepEqual(reply.usage, { inputTokens: 123, outputTokens: 17 });
	});
});
test('cancel interrupts a model that has not returned headers', async () => {
	await server(() => { }, async endpoint => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 30);
		await assert.rejects(streamChat('test', [], [], 8192, controller.signal, () => { }, () => { }, endpoint), /abort/i);
	});
});
test('rejects disconnected incomplete streams', async () => {
	await server((_, response) => { response.end(JSON.stringify({ message: { content: 'Partial' } }) + '\n'); }, async endpoint => {
		await assert.rejects(streamChat('test', [], [], 8192, new AbortController().signal, () => { }, () => { }, endpoint), /disconnected/);
	});
});
test('does not execute incomplete tool proposals at the token limit', async () => {
	await server((_, response) => { response.end(JSON.stringify({ message: { content: 'partial proposal' }, done: true, done_reason: 'length' }) + '\n'); }, async endpoint => {
		await assert.rejects(streamChat('test', [], [], 8192, new AbortController().signal, () => { }, () => { }, endpoint), /length limit/);
	});
});
