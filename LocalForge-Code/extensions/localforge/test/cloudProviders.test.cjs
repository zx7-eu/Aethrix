const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { streamApi, encodeConversation, providerBody, listApiModels } = require('../out/cloudProviders');
const tool = { type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } };
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
async function server(handler, run) { const server = http.createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); try { await run('http://127.0.0.1:' + server.address().port); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }

test('OpenAI streaming preserves tool IDs and encrypted reasoning across the next tool round', async () => {
	const reasoning = { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'fixture-encrypted-reasoning' };
	await server((request, response) => {
		assert.equal(request.url, '/responses'); assert.equal(request.headers.authorization, 'Bearer fake-test-key');
		response.write(event({ type: 'response.output_text.delta', delta: 'Hi λ' }));
		response.end(event({ type: 'response.completed', response: { status: 'completed', output: [reasoning, { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'read_file', arguments: '{"path":"main.cpp"}' }], usage: { input_tokens: 15, output_tokens: 7 } } }));
	}, async endpoint => {
		const texts = []; const reply = await streamApi('openai', 'fake-test-key', 'test-model', [{ role: 'user', content: 'inspect' }], [tool], new AbortController().signal, text => texts.push(text), () => {}, endpoint);
		assert.equal(reply.tool_calls[0].id, 'call_fixture'); assert.deepEqual(reply.usage, { inputTokens: 15, outputTokens: 7 }); assert.equal(texts.at(-1), 'Hi λ');
		const body = providerBody('openai', 'test-model', [{ role: 'user', content: 'inspect' }, reply, { role: 'tool', tool_call_id: 'call_fixture', tool_name: 'read_file', content: 'verified source' }], [tool]);
		assert.equal(body.store, false); assert.deepEqual(body.input[1], reasoning); assert.equal(body.input.at(-1).call_id, 'call_fixture'); assert.equal(body.tools[0].strict, false);
	});
});

test('Claude streams fragmented tool JSON and encodes matching tool_result blocks', async () => {
	await server((request, response) => {
		assert.equal(request.url, '/messages'); assert.equal(request.headers['x-api-key'], 'fake-test-key');
		response.write(event({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 2 } } }));
		response.write(event({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_fixture', name: 'read_file', input: {} } }));
		response.write(event({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } }));
		response.write(event({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"main.cpp"}' } }));
		response.write(event({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } })); response.end(event({ type: 'message_stop' }));
	}, async endpoint => {
		const reply = await streamApi('anthropic', 'fake-test-key', 'test-model', [], [tool], new AbortController().signal, () => {}, () => {}, endpoint);
		assert.deepEqual(reply.tool_calls[0].function.arguments, { path: 'main.cpp' }); assert.equal(reply.usage.inputTokens, 12);
		const messages = encodeConversation('anthropic', [reply, { role: 'tool', tool_name: 'read_file', content: 'source' }]); assert.equal(messages[1].content[0].tool_use_id, 'toolu_fixture');
	});
});

test('incomplete, failed and truncated API streams never release tool calls', async () => {
	for (const provider of ['openai', 'anthropic']) {
		await server((_, response) => response.end(event(provider === 'openai' ? { type: 'response.output_text.delta', delta: 'partial' } : { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'partial', name: 'read_file', input: {} } })), endpoint => assert.rejects(streamApi(provider, 'fake-key', 'test', [], [tool], new AbortController().signal, () => {}, () => {}, endpoint), /before completing/));
	}
	await server((_, response) => response.end(event({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }) + event({ type: 'message_stop' })), endpoint => assert.rejects(streamApi('anthropic', 'fake-key', 'test', [], [tool], new AbortController().signal, () => {}, () => {}, endpoint), /before completing/));
});

test('API cancellation aborts a stalled request and errors do not echo secret response bodies', async () => {
	await server(() => {}, async endpoint => { const controller = new AbortController(); setTimeout(() => controller.abort(), 30); await assert.rejects(streamApi('openai', 'fake-secret-value', 'test', [], [], controller.signal, () => {}, () => {}, endpoint), /abort/i); });
	await server((_, response) => { response.writeHead(401); response.end('fake-secret-value'); }, async endpoint => { await assert.rejects(streamApi('openai', 'fake-secret-value', 'test', [], [], new AbortController().signal, () => {}, () => {}, endpoint), error => /401/.test(error.message) && !error.message.includes('fake-secret-value')); });
});

test('model discovery uses provider authorization and tool history rejects unmatched results', async () => {
	await server((request, response) => { assert.equal(request.url, '/models'); response.end(JSON.stringify({ data: [{ id: 'test-code-model' }] })); }, async endpoint => assert.deepEqual(await listApiModels('openai', 'fake-key', endpoint), ['test-code-model']));
	assert.throws(() => encodeConversation('openai', [{ role: 'tool', content: 'orphan' }]), /history is incomplete/);
});

test('provider credentials use SecretStorage only and rejected provider switching never updates settings', async () => {
	const file = path.resolve(__dirname, '../out/providerConnections.js'); const native = createRequire(file); const exports = {}; const secrets = new Map(); const settings = []; let passwordPrompt;
	const vscode = { ConfigurationTarget: { Global: 1 }, l10n: { t: text => text }, workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'openaiModel' ? 'test-model' : fallback, update: async (...args) => settings.push(args) }), isTrusted: false }, window: { showInputBox: async options => { passwordPrompt = options; return 'fake-private-key'; }, showWarningMessage: async () => undefined } };
	vm.runInNewContext(await fs.readFile(file, 'utf8'), { exports, require: name => name === 'vscode' ? vscode : native(name), process, console });
	const connections = new exports.ProviderConnections({ secrets: { get: async key => secrets.get(key), store: async (key, value) => secrets.set(key, value), delete: async key => secrets.delete(key) } });
	await connections.manageKey('openai'); assert.equal(passwordPrompt.password, true); assert.equal(secrets.get('aethrix.apiKey.openai'), 'fake-private-key'); assert.equal(settings.length, 0);
	await connections.choose('openai', false); assert.equal(settings.length, 0); const status = await connections.status(); assert.equal(status.keys.openai, true); assert.equal(JSON.stringify(status).includes('fake-private-key'), false);
	await assert.rejects(connections.choose('openai', true), /Stop active/); await assert.rejects(connections.terminal('codex'), /Trust/);
	await connections.manageKey('openai', true); assert.equal(secrets.size, 0);
	const sent = []; const terminals = []; vscode.workspace.isTrusted = true; vscode.workspace.workspaceFolders = [{ uri: { fsPath: os.tmpdir() } }];
	vscode.window.terminals = terminals; vscode.window.createTerminal = options => { const terminal = { name: options.name, show() {}, sendText(text, execute) { sent.push({ text, execute }); } }; terminals.push(terminal); return terminal; };
	await connections.terminal('claude', 'setup'); assert.deepEqual(sent.at(-1), { text: 'winget install Anthropic.ClaudeCode', execute: false });
	await connections.terminal('codex', 'setup'); assert.equal(sent.at(-1).execute, false); assert.equal(sent.at(-1).text.includes('fake-private-key'), false);
	if (status.cli.codex) { await connections.terminal('codex'); assert.match(sent.at(-1).text, /codex\.exe|codex\.cmd/i); assert.equal(/--yolo|--dangerously|fake-private-key/.test(sent.at(-1).text), false); const count = terminals.length; await connections.terminal('codex'); assert.equal(terminals.length, count); }
});
