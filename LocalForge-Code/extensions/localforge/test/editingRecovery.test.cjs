const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exactPatch } = require('../out/exactPatch');
const { recoveryMessages } = require('../out/checkpoint');
const { modelInventory, unloadModel } = require('../out/modelManager');
const { createServer } = require('node:http');

test('patches preserve surrounding code and CRLF, reject ambiguous and stale text', () => {
	const original = 'before\r\nint x = 1;\r\nafter\r\n';
	const patched = exactPatch(original, 'int x = 1;\n', 'int x = 2;\n');
	assert.equal(patched.text, 'before\r\nint x = 2;\r\nafter\r\n');
	assert.equal(patched.start, 8);
	assert.throws(() => exactPatch('same same', 'same', 'new'), /multiple locations/);
	assert.throws(() => exactPatch(original, 'int x = 0;', ''), /not found/);
	assert.throws(() => exactPatch(original, '', 'insert'), /nonempty/);
	assert.equal(exactPatch('prefix REMOVE suffix', 'REMOVE', '').text, 'prefix  suffix');
});
test('recovery retains completed results and marks only unmatched calls uncertain', () => {
	const checkpoint = { prompt: 'fix', model: 'test', completed: 1, updated: '', messages: [{ role: 'user', content: 'fix' }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.cpp' } } }, { function: { name: 'run_command', arguments: { command: 'build' } } }] }, { role: 'tool', tool_name: 'read_file', content: 'verified contents' }] };
	const messages = recoveryMessages(checkpoint);
	assert.equal(messages.filter(message => message.role === 'tool').length, 2);
	assert.equal(messages[2].content, 'verified contents');
	assert.match(messages[3].content, /may or may not have completed/);
	assert.match(messages.at(-1).content, /Do not repeat completed actions/);
	assert.equal(checkpoint.messages.length, 3, 'does not mutate the stored checkpoint');
});
test('model manager combines installed and running stats and unloads without deleting models', async () => {
	const calls = [];
	const server = createServer(async (request, response) => {
		let body = ''; for await (const chunk of request) { body += chunk; }
		calls.push({ method: request.method, path: request.url, body });
		response.setHeader('Content-Type', 'application/json');
		if (request.url === '/api/tags') { response.end(JSON.stringify({ models: [{ name: 'coder:latest', size: 1000, details: { parameter_size: '7B' } }, { name: 'small:latest', size: 500 }] })); }
		else if (request.url === '/api/ps') { response.end(JSON.stringify({ models: [{ name: 'coder:latest', size: 1200, size_vram: 900, context_length: 8192 }] })); }
		else { response.end('{}'); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		const endpoint = `http://127.0.0.1:${server.address().port}`;
		const inventory = await modelInventory(endpoint);
		assert.equal(inventory[0].memory, 1200); assert.equal(inventory[0].vram, 900); assert.equal(inventory[1].loaded, false);
		await unloadModel('coder:latest', endpoint);
		assert.deepEqual(JSON.parse(calls.find(call => call.path === '/api/generate').body), { model: 'coder:latest', keep_alive: 0, stream: false });
		assert.equal(calls.some(call => call.method === 'DELETE'), false);
		await assert.rejects(unloadModel('not-installed', endpoint), /installed/);
	} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('Qwen XML patch recovery preserves indentation in exact-match parameters', () => {
    const { recoverToolCalls } = require('../out/toolProtocol');
    const tools = [{ type: 'function', function: { name: 'edit_file', parameters: { properties: { path: {}, old_text: {}, new_text: {} }, required: ['path', 'old_text', 'new_text'] } } }];
    const parsed = recoverToolCalls('<function=edit_file><parameter=path>main.cpp</parameter><parameter=old_text>\n    return 0;\n</parameter><parameter=new_text>\n    return 1;\n</parameter></function>', tools);
    assert.equal(parsed.calls[0].function.arguments.old_text, '    return 0;');
    assert.equal(parsed.calls[0].function.arguments.new_text, '    return 1;');
});
