const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { assessFit, recommend, parseModelName, inspectModel, GiB } = require('../out/modelAdvisor');
const { pullModel } = require('../out/modelManager');
const hardware = { cpu: 'Test CPU', cores: 16, ram: 32 * GiB, availableRam: 20 * GiB, gpus: [{ name: 'Test GPU', memory: 16 * GiB }], modelPath: 'C:/models', diskFree: 200 * GiB, scanned: '' };
test('hardware fit distinguishes GPU, offload, and oversized models without pooling GPUs', () => {
	assert.equal(assessFit(9e9, hardware).fit, 'gpu');
	assert.equal(assessFit(19e9, hardware).fit, 'offload');
	assert.equal(assessFit(43e9, hardware).fit, 'tooLarge');
	assert.equal(recommend(hardware), 'qwen2.5-coder:14b');
	assert.equal(assessFit(9e9, { ...hardware, gpus: [{ memory: 8 * GiB }, { memory: 8 * GiB }] }).fit, 'offload');
	assert.equal(assessFit(4e9, { ...hardware, gpus: [] }).fit, 'cpu');
	assert.equal(assessFit(9e9, { ...hardware, diskFree: GiB }).diskOkay, false);
	assert.equal(assessFit(9e9, { ...hardware, diskFree: null }).diskOkay, null);
	assert.ok(assessFit(9e9, hardware, 32768).needed > assessFit(9e9, hardware, 8192).needed);
	assert.throws(() => assessFit(NaN, hardware));
});
test('custom model tags accept registry names but reject URLs, shell text, traversal and cloud models', () => {
	assert.deepEqual(parseModelName('qwen3:8b'), { name: 'qwen3:8b', repository: 'library/qwen3', tag: '8b' });
	assert.equal(parseModelName('team/model').name, 'team/model:latest');
	for (const input of ['http://host/model', '../model', 'x;calc.exe', 'a/b/c', 'qwen3:480b-cloud', 'x:tag:extra']) { assert.throws(() => parseModelName(input)); }
});
async function withServer(handler, run) {
	const server = http.createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try { await run('http://127.0.0.1:' + server.address().port); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('registry inspection totals real layer sizes before download', async () => {
	await withServer((request, response) => { assert.equal(request.url, '/v2/library/qwen3/manifests/8b'); response.end(JSON.stringify({ layers: [{ size: 100 }, { size: 200 }], config: { size: 5 } })); }, async endpoint => {
		assert.deepEqual(await inspectModel('qwen3:8b', endpoint), { name: 'qwen3:8b', size: 305 });
	});
});
test('model pulls stream progress, require success, report errors, and cancel without deleting files', async () => {
	let mode = 'success';
	await withServer((request, response) => {
		assert.equal(request.url, '/api/pull');
		if (mode === 'wait') { return; }
		if (mode === 'error') { response.end('{"error":"no space left"}\n'); return; }
		response.write('{"status":"pulling","digest":"abc","total":100,"completed":20}\n');
		response.end(mode === 'success' ? '{"status":"success"}\n' : '');
	}, async endpoint => {
		const updates = []; await pullModel('qwen3:8b', new AbortController().signal, value => updates.push(value), endpoint);
		assert.equal(updates[0].completed, 20); assert.equal(updates.at(-1).status, 'success');
		mode = 'truncated'; await assert.rejects(pullModel('qwen3:8b', new AbortController().signal, () => {}, endpoint), /before Ollama confirmed/);
		mode = 'error'; await assert.rejects(pullModel('qwen3:8b', new AbortController().signal, () => {}, endpoint), /no space left/);
		mode = 'wait'; const controller = new AbortController(); const pulling = pullModel('qwen3:8b', controller.signal, () => {}, endpoint); setTimeout(() => controller.abort(), 30); await assert.rejects(pulling, /abort/i);
	});
});
