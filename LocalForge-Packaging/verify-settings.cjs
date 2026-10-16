const { chromium } = require('../LocalForge-Code/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
(async () => {
	const file = path.resolve(__dirname, '../LocalForge-Code/extensions/localforge/out/settingsPanel.js'); const native = createRequire(file); const exports = {};
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), { exports, require: name => name === 'vscode' ? {} : native(name), Buffer, URL, process });
	const fields = exports.settingsFields;
	const browser = await chromium.launch({ channel: 'msedge', headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1420, height: 950 } }); const errors = []; page.on('pageerror', error => errors.push(String(error)));
		await page.setContent('<aside><div class="brand">Aethrix<span>Local · Free</span></div><input id="search" aria-label="Search Settings"><nav id="tabs"></nav></aside><main><h1 id="heading"></h1><div id="body"></div></main><div id="notice"></div>');
		await page.addStyleTag({ path: path.join(__dirname, '../LocalForge-Code/extensions/localforge/media/settings.css') });
		await page.evaluate(() => { window.settingsLabels = {}; window.posts = []; window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {}, postMessage(message) { window.posts.push(message); } }); });
		await page.addScriptTag({ path: path.join(__dirname, '../LocalForge-Code/extensions/localforge/media/settings.js') });
		const send = data => page.evaluate(data => window.dispatchEvent(new MessageEvent('message', { data })), data);
		const snapshot = { type: 'settingsState', fields, hidden: [], model: 'qwen3-coder:30b', busy: false, usage: { total: { requests: 12, linesAdded: 55, linesRemoved: 8, inputTokens: 100 }, today: { requests: 4 } } };
		await send(snapshot);
		assert.equal(await page.locator('#tabs button').count(), 8); assert.equal(await page.getByRole('button', { name: /Cloud Agents|Voice|Customize|Docs/ }).count(), 0);
		await page.getByRole('checkbox', { name: 'Minimap', exact: true }).uncheck(); assert.deepEqual(await page.evaluate(() => window.posts.at(-1)), { type: 'set', key: 'editor.minimap.enabled', value: false }); await send(snapshot);
		await page.locator('[data-page="usage"]').click(); assert.match(await page.locator('.stats').textContent(), /55/); assert.equal(await page.getByRole('button', { name: /Upgrade|Buy credits/ }).count(), 0);
		await page.locator('[data-page="models"]').click();
		await send({ type: 'settingsModels', models: [{ name: 'qwen3-coder:30b', size: 19e9, fit: 'offload', purpose: 'Coding', diskOkay: true }, { name: 'gemma3:4b', size: 3e9, fit: 'gpu', purpose: 'General', diskOkay: true }], installed: [{ name: 'qwen3-coder:30b', disk: 19e9 }], hardware: { cpu: 'Local CPU', ram: 32e9, diskFree: 100e9, gpus: [{ memory: 16e9 }] } });
		await page.getByRole('checkbox', { name: 'Show in Model Picker: gemma3:4b' }).uncheck(); assert.equal(await page.evaluate(() => window.posts.at(-1).type), 'visibility');
		await page.getByRole('button', { name: 'Use Model', exact: true }).click(); assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'select');
		await page.locator('#modelSearch').fill('gemma3'); assert.equal(await page.locator('#body .row').count(), 2);
		await send({ type: 'installerFit', name: 'gemma3:4b', size: 3e9, needed: 5e9, diskNeeded: 4e9, fit: 'gpu', diskOkay: false }); assert.match(await page.locator('#modelStatus').textContent(), /Insufficient storage/);
		await page.getByRole('button', { name: 'Cancel Download', exact: true }).click(); assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'cancel');
		await page.locator('[data-page="source"]').click(); await send({ type: 'settingsGit', branch: 'main', root: 'C:/example', files: [{ path: '<img onerror=alert(1)>.cpp', index: ' ', worktree: 'M' }] });
		await page.getByRole('button', { name: 'Stage All', exact: true }).click(); assert.deepEqual(await page.evaluate(() => window.posts.at(-1)), { type: 'git', action: 'stage' }); assert.equal(await page.locator('#body img').count(), 0);
		await page.locator('[data-page="agents"]').click(); await page.getByRole('checkbox', { name: 'Code Block Word Wrap', exact: true }).check(); assert.equal(await page.evaluate(() => window.posts.at(-1).key), 'localforge.codeBlockWrap'); await send(snapshot);
		await page.locator('[data-page="general"]').click(); await page.screenshot({ path: path.join(__dirname, 'Aethrix-settings.png'), fullPage: true });
		await page.setViewportSize({ width: 720, height: 700 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		assert.deepEqual(errors, []); console.log('Settings navigation, controls, usage, model checks, source-control actions, safe rendering and responsive layout passed.');
	} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
