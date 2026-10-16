const { chromium } = require('../LocalForge-Code/node_modules/playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
	const browser = await chromium.launch({ channel: 'msedge', headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent('<div id="messages"></div><textarea id="prompt"></textarea>' + ['send','cancel','context','connection','status','reconnect','reset','approvalLabel','file'].map(id => `<button id="${id}"></button>`).join('') + '<input id="model"><input id="include"><select id="history"></select><select id="approval"><option value="off"></option></select>');
		await page.evaluate(() => {
			window.labels = { send: 'Send', cancel: 'Stop', hello: 'Hello', intro: 'Intro', working: 'Working', copy: 'Copy', copied: 'Copied', openCode: 'Open in Editor', review: 'Review', undo: 'Undo Files', models: 'Models', refresh: 'Refresh', resume: 'Resume', discard: 'Discard', interrupted: 'Interrupted', useModel: 'Use Model', selectedModel: 'Selected', unload: 'Unload', notLoaded: 'Not loaded', loadedMemory: 'Loaded memory', disk: 'Disk' }; window.posts = [];
			window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {}, postMessage(message) { window.posts.push(message); } });
		});
		const media = path.join(__dirname, '../LocalForge-Code/extensions/localforge/media');
		await page.addScriptTag({ path: path.join(media, 'markdown-it.min.js') });
		await page.addScriptTag({ path: path.join(media, 'highlight.min.js') });
        await page.evaluate(() => {
            for (const id of ['progress','phase','elapsed','attachments','contextSources','changesList','changesPanel','changesTitle','contextTitle','modelsPanel','modelsList','modelsTitle','checkpointBar','checkpointText','chatSearchPanel','chatSearchTitle','chatSearchResults','queuePanel','queueTitle','queueState','queueItems']) { const element = document.createElement(id === 'changesPanel' ? 'details' : 'div'); element.id = id; document.body.append(element); }
            for (const id of ['attachFile','attachFolder','modelsRefresh','resumeRequest','discardRequest','queueRun','queuePause','enqueueRequest']) { const element = document.createElement('button'); element.id = id; document.body.append(element); }
            const query = document.createElement('input'); query.id = 'chatQuery'; document.body.append(query);
            const scope = document.createElement('select'); scope.id = 'chatScope'; scope.innerHTML = '<option value="project"></option><option value="all"></option>'; document.body.append(scope);
            Object.assign(window.labels, { chatSearch: 'Find Chats', chatQuery: 'Search chats', projectChats: 'This Project', allChats: 'All Projects', openChat: 'Open Chat', openProject: 'Open Project', noChats: 'No results', queue: 'Queue', queueAdd: 'Queue Request', queueRun: 'Run Queue', queuePause: 'Pause', remove: 'Remove', paused: 'Paused', running: 'Running', queued: 'Queued', done: 'Done', failed: 'Failed', interruptedJob: 'Interrupted' });
            Object.assign(window.labels, { attach: 'Attach File', folder: 'Attach Folder', changes: 'File Changes', used: 'Context Used', noChanges: 'No changes', undone: 'Undone' });
			for (const id of ['modeLabel', 'modeHint', 'workflowPanel', 'questionText', 'planControls', 'planName']) { const element = document.createElement('div'); element.id = id; document.body.append(element); }
			for (const action of ['Open', 'Model', 'Build']) { const button = document.createElement('button'); button.id = 'plan' + action; document.body.append(button); window.labels['plan' + action] = 'Plan ' + action; }
			const mode = document.createElement('select'); mode.id = 'mode';
			for (const name of ['normal', 'plan', 'debug', 'multi', 'ask']) { const option = document.createElement('option'); option.value = name; mode.append(option); window.labels[name + 'Mode'] = name; window.labels[name + 'Hint'] = name + ' explanation'; }
			document.body.append(mode); window.labels.modeLabel = 'Mode'; window.labels.questionHint = 'Reply below';
        });
        await page.addScriptTag({ path: path.join(media, 'chat.js') });
		await page.selectOption('#mode', 'plan');
		assert.deepEqual(await page.evaluate(() => window.posts.at(-1)), { type: 'setMode', mode: 'plan' });
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'workflow', mode: 'plan', question: 'What is the success criterion?' } })));
		assert.equal(await page.locator('#workflowPanel').evaluate(element => element.hidden), false);
		assert.match(await page.locator('#questionText').textContent(), /success criterion/);
		assert.equal(await page.locator('#planControls').evaluate(element => element.hidden), true);
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'workflow', mode: 'plan', plan: { path: '.aethrix/plans/abc/plan.md', model: 'local-model' } } })));
		assert.equal(await page.locator('#planControls').evaluate(element => element.hidden), false);
		await page.locator('#planBuild').click();
		assert.deepEqual(await page.evaluate(() => window.posts.at(-1)), { type: 'planAction', action: 'build' });
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'transcript', entries: [{ role: 'assistant', text: '## Repo\n\n**Bold** and `code`\n\n- Item\n\n```cpp\nint x;\n```\n<script>window.injected=true</script>\n[bad](javascript:alert(1))' }] } })));
		assert.equal(await page.locator('.content h2').textContent(), 'Repo');
		assert.equal(await page.locator('.content strong').textContent(), 'Bold');
		assert.equal(await page.locator('.content pre code').textContent(), 'int x;\n');
		assert.ok(await page.locator('.content pre code .hljs-type, .content pre code .hljs-keyword').count());
		await page.getByRole('button', { name: 'Copy', exact: true }).click();
		assert.equal(await page.evaluate(() => window.posts.at(-1).type), 'copy');
		assert.equal(await page.evaluate(() => window.posts.at(-1).text), 'int x;\n');
		await page.getByRole('button', { name: 'Open in Editor', exact: true }).click();
		assert.equal(await page.evaluate(() => window.posts.at(-1).language), 'cpp');
		assert.equal(await page.locator('.content script, .content a[href^="javascript:"]').count(), 0);
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'tool', text: 'read_file · main.cpp · Done', output: 'line one\nline two' } })));
		assert.equal(await page.locator('details.tool summary').textContent(), 'read_file · main.cpp · Done');
		assert.equal(await page.locator('details.tool').evaluate(element => element.open), false);
		await page.locator('.responseActivity > summary').click();
		await page.locator('details.tool summary').click();
		assert.equal(await page.locator('details.tool pre').textContent(), 'line one\nline two');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'attachments', files: ['src/main.cpp'] } })));
        await page.getByRole('button', { name: 'src/main.cpp ×' }).click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).type), 'detach');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'changes', requests: [{ id: 'request-1', title: 'Fix compiler errors', files: [{ path: 'main.cpp', created: false }] }] } })));
        await page.getByRole('button', { name: 'Undo Files' }).click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).id), 'request-1');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'busy', value: true } })));
        await page.waitForFunction(() => document.getElementById('elapsed').textContent === '0:01');
        assert.equal(await page.locator('#progress').evaluate(element => element.hidden), false);
        assert.equal(await page.locator('#send').textContent(), 'Stop');
        assert.equal(await page.locator('#send').isEnabled(), true);
        await page.locator('#send').click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).type), 'cancel');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'busy', value: false } })));
        assert.equal(await page.locator('#progress').evaluate(element => element.hidden), true);
        assert.equal(await page.locator('#send').isEnabled(), true);
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'checkpoint', available: true, completed: 3 } })));
        assert.equal(await page.locator('#checkpointBar').evaluate(element => element.hidden), false);
        await page.locator('#resumeRequest').click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'resume');
        await page.locator('#discardRequest').click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).type), 'discardCheckpoint');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'modelInventory', selected: 'one', models: [{ name: 'one', disk: 1073741824, loaded: true, memory: 1073741824, vram: 536870912, context: 8192 }, { name: 'two', disk: 500000000, loaded: false, memory: 0, vram: 0 }] } })));
        assert.equal(await page.locator('.modelCard').count(), 2);
        assert.match(await page.locator('.modelStats').first().textContent(), /GPU 0.50 GB/);
        await page.getByRole('button', { name: 'Use Model', exact: true }).click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).model), 'two');
        await page.getByRole('button', { name: 'Unload', exact: true }).first().click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'unload');
        await page.locator('#chatQuery').fill('driver.cpp');
        await page.waitForFunction(() => window.posts.some(message => message.type === 'searchChats' && message.text === 'driver.cpp'));
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'chatSearchResults', query: 'driver.cpp', workspace: 'current', results: [{ id: 'saved-chat', title: 'Driver fix', snippet: 'Read driver.cpp', workspace: 'current', updated: new Date().toISOString() }] } })));
        await page.locator('.chatResult').click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).id), 'saved-chat');
        await page.locator('#prompt').fill('Queued request');
        await page.locator('#enqueueRequest').click();
        assert.equal(await page.evaluate(() => window.posts.at(-1).type), 'enqueue');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'enqueued', text: 'Queued request' } })));
        assert.equal(await page.locator('#prompt').inputValue(), '');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'requestQueue', paused: true, running: false, items: [{ id: 'job', prompt: 'Queued request', state: 'queued', chatId: 'saved-chat', files: [] }] } })));
        await page.locator('#queueRun').click(); assert.equal(await page.evaluate(() => window.posts.at(-1).action), 'run');
        await page.locator('#queueItems').getByRole('button', { name: 'Remove', exact: true }).click(); assert.equal(await page.evaluate(() => window.posts.at(-1).id), 'job');
		await page.evaluate(() => {
			const send = data => window.dispatchEvent(new MessageEvent('message', { data }));
			send({ type: 'reset' }); send({ type: 'busy', value: true }); send({ type: 'user', text: 'Explain this repo' });
			for (let index = 0; index < 4; index++) { send({ type: 'assistantStart' }); send({ type: 'assistant', text: 'Inspecting ' + index }); send({ type: 'tool', text: 'read_file · Done', output: 'Source ' + index }); }
			send({ type: 'assistantStart' }); send({ type: 'assistant', text: '## Final explanation\nVerified summary.' }); send({ type: 'busy', value: false });
		});
		assert.equal(await page.locator('#messages .message:not(.user)').count(), 1);
		assert.equal(await page.locator('.responseActivity').evaluate(element => element.open), false);
		assert.equal(await page.locator('.responseActivity .tool').count(), 4);
		assert.match(await page.locator('#messages .message:not(.user) > .content').textContent(), /Final explanation/);
		await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'transcript', entries: [{ role: 'user', text: 'Explain repo' }, { role: 'assistant', text: 'Looking' }, { role: 'tool', text: 'read_file · Done' }, { role: 'assistant', text: 'Final summary' }] } })));
		assert.equal(await page.locator('#messages .message:not(.user)').count(), 1);
		assert.equal((await page.locator('#messages .message:not(.user) > .content').textContent()).trim(), 'Final summary');
		console.log('Grouped live and restored responses, Markdown, safe HTML and collapsed tools passed.');
	} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
