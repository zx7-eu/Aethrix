const { chromium } = require('../LocalForge-Code/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
	const browser = await chromium.launch({ channel: 'msedge', headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 290, height: 700 } });
		let html = fs.readFileSync(path.join(__dirname, '../.build/localforge-tool-test/project/chat-preview.html'), 'utf8');
		html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '').replace(/<link rel="stylesheet"[^>]*>/, '');
		await page.setContent(html);
		await page.addStyleTag({ content: ':root{--vscode-font-family:Segoe UI,sans-serif;--vscode-font-size:12px;--vscode-foreground:#d4d4d4;--vscode-sideBar-background:#202020;--vscode-input-background:#292929;--vscode-input-foreground:#ddd;--vscode-input-placeholderForeground:#858585;--vscode-descriptionForeground:#999;--vscode-panel-border:#333;--vscode-button-background:#555;--vscode-button-foreground:white;--vscode-dropdown-foreground:#ddd;--vscode-dropdown-background:#292929;--vscode-list-hoverBackground:#303030;--vscode-menu-background:#252525;--vscode-editorGroupHeader-tabsBackground:#252525}' });
		const media = path.join(__dirname, '../LocalForge-Code/extensions/localforge/media');
		await page.addStyleTag({ path: path.join(media, 'chat.css') });
		await page.evaluate(() => { window.posts = []; window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {}, postMessage(message) { window.posts.push(message); } }); });
		for (const file of ['markdown-it.min.js', 'highlight.min.js', 'chat.js']) { await page.addScriptTag({ path: path.join(media, file) }); }
		await page.evaluate(() => {
			window.dispatchEvent(new MessageEvent('message', { data: { type: 'sessions', activeId: 'demo', sessions: [{ id: 'demo', title: 'Improve the C++ project' }] } }));
			window.dispatchEvent(new MessageEvent('message', { data: { type: 'connection', online: true, model: 'qwen3-coder:30b' } }));
			window.dispatchEvent(new MessageEvent('message', { data: { type: 'workflow', mode: 'normal' } }));
		});
		assert.equal(await page.locator('.worktools').isVisible(), false);
		await page.locator('#toolsLabel').click(); assert.equal(await page.locator('.worktools').isVisible(), true);
		await page.keyboard.press('Escape'); assert.equal(await page.locator('.worktools').isVisible(), false);
		for (const height of [700, 550]) {
			await page.setViewportSize({ width: 290, height });
			const geometry = await page.evaluate(() => ({ footer: document.querySelector('footer').getBoundingClientRect().bottom, send: document.getElementById('send').getBoundingClientRect().right, messageHeight: document.getElementById('messages').clientHeight, width: document.body.scrollWidth }));
			assert.ok(geometry.footer <= height + 1); assert.ok(geometry.send <= 290); assert.ok(geometry.messageHeight > 150); assert.ok(geometry.width <= 290);
		}
		await page.setViewportSize({ width: 290, height: 700 });
		await page.locator('#installModels').click();
		assert.deepEqual(await page.evaluate(() => window.posts.at(-1)), { type: 'modelInstaller', action: 'open' });
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'installerLoading' } })));
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'installerHardware', hardware: { cpu: 'Example CPU', cores: 16, ram: 32 * 1073741824, availableRam: 20 * 1073741824, gpus: [{ name: 'Example GPU', memory: 16 * 1073741824 }], modelPath: 'C:/models', diskFree: 200 * 1073741824 }, models: [{ name: 'qwen2.5-coder:14b' }, { name: 'qwen3-coder:30b' }], recommended: 'qwen2.5-coder:14b' } })));
		assert.equal(await page.evaluate(() => window.posts.at(-1).model), 'qwen2.5-coder:14b');
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'installerFit', name: 'qwen2.5-coder:14b', size: 9e9, needed: 12e9, fit: 'gpu', diskOkay: true, hardware: { cpu: 'Example CPU', cores: 16, ram: 32 * 1073741824, availableRam: 20 * 1073741824, gpus: [], modelPath: 'C:/models', diskFree: 200 * 1073741824 } } })));
		assert.equal(await page.locator('#downloadModel').isEnabled(), true);
		await page.locator('#downloadModel').click(); assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'install');
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'installerPull', active: true, status: 'Downloading', total: 100, completed: 25 } })));
		assert.equal(await page.locator('#downloadProgress').getAttribute('value'), '25');
		await page.locator('#cancelDownload').click(); assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'cancel');
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'installerIdle' } })));
		assert.equal(await page.locator('#inspectModel').isEnabled(), true);
		await page.screenshot({ path: path.join(__dirname, 'Aethrix-chat-redesign.png') });
		console.log('Compact chat layout fits narrow and short sidebars; tools menu opens and closes with Escape.');
	} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
