/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = acquireVsCodeApi();
const L = labels;
const $ = id => document.getElementById(id);
let current = null;
let busy = false;
let clock;
let started = 0;
let hasCheckpoint = false;
let chatSearchTimer;
const state = vscode.getState() || {};
const post = (type, extra = {}) => vscode.postMessage({ type, ...extra });
const markdown = window.markdownit({ html: false, linkify: false, breaks: true }).disable('image');
function render(element, text) {
	element.classList.add('markdown');
	element.innerHTML = markdown.render(text);
	for (const block of element.querySelectorAll('pre > code')) {
		const source = block.textContent;
		const requested = [...block.classList].find(name => name.startsWith('language-'))?.slice(9) || '';
		const language = ({ 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', py: 'python', ts: 'typescript', js: 'javascript', ps1: 'powershell' })[requested] || requested;
		if (window.hljs && language && window.hljs.getLanguage(language)) { block.innerHTML = window.hljs.highlight(source, { language, ignoreIllegals: true }).value; }
		const actions = document.createElement('div'); actions.className = 'codeActions';
		const label = document.createElement('span'); label.textContent = language || 'text';
		const copy = document.createElement('button'); copy.textContent = L.copy;
		copy.onclick = () => { post('copy', { text: source }); copy.textContent = L.copied; setTimeout(() => { copy.textContent = L.copy; }, 1500); };
		const open = document.createElement('button'); open.textContent = L.openCode;
		open.onclick = () => post('openCode', { text: source, language: ({ bash: 'shellscript', shell: 'shellscript', text: 'plaintext' })[language] || language || 'plaintext' });
		actions.append(label, copy, open); block.parentElement.before(actions);
	}
	for (const link of element.querySelectorAll('a[href]')) {
		const href = link.getAttribute('href');
		if (href && !/^[a-z][a-z0-9+.-]*:|^\/|^#/i.test(href)) { link.onclick = event => { event.preventDefault(); post('openFile', { path: href.replace(/#L(\d+)$/, ':$1') }); }; }
	}
}

function updateClock() {
	const elapsed = Math.floor((Date.now() - started) / 1000);
	if ($('elapsed')) { $('elapsed').textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`; }
}

function showChanges(requests) {
	if (!$('changesList')) { return; }
	$('changesList').replaceChildren();
	if (!requests.length) { $('changesList').textContent = L.noChanges; }
	for (const request of requests) {
		const card = document.createElement('div'); card.className = 'changeRequest';
		const title = document.createElement('strong'); title.textContent = request.title + (request.undone ? ` · ${L.undone}` : '');
		const files = document.createElement('div'); files.className = 'changeFiles'; files.textContent = request.files.map(file => `${file.created ? '+ ' : '↔ '}${file.path}`).join('\n');
		const actions = document.createElement('div'); actions.className = 'changeActions';
		const review = document.createElement('button'); review.textContent = L.review; review.onclick = () => post('review', { id: request.id });
		const undo = document.createElement('button'); undo.textContent = L.undo; undo.disabled = request.undone || busy; undo.onclick = () => post('undo', { id: request.id });
		actions.append(review, undo); card.append(title, files, actions); $('changesList').append(card);
	}
}

const gigabytes = bytes => `${(Number(bytes || 0) / 1073741824).toFixed(2)} GB`;
let installerName = '';
let installerPulling = false;
const installName = () => $('customModel')?.value.trim() || $('installCatalog')?.value || '';
function inspectInstallModel() {
	installerName = installName();
	if (!installerName || installerPulling) { return; }
	$('modelFit').textContent = L.scanPending; $('downloadModel').disabled = true;
	$('downloadModel').hidden = false; $('useInstalledModel').hidden = true;
	post('modelInstaller', { action: 'inspect', model: installerName });
}
function hardwareSummary(hardware) {
	const gib = value => `${(value / 1073741824).toFixed(1)} GiB`;
	return `${hardware.cpu} · ${hardware.cores} threads\nRAM ${gib(hardware.ram)} · ${gib(hardware.availableRam)} available\n` +
		(hardware.gpus.map(gpu => `${gpu.name} · ${gib(gpu.memory)} dedicated`).join('\n') || L.noGpu) +
		`\n${L.freeSpace}: ${hardware.diskFree === null ? L.unknown : gib(hardware.diskFree)}\n${hardware.modelPath}` + (hardware.warning ? '\n' + hardware.warning : '');
}
function renderHardware(hardware) {
	$('hardwareSummary').textContent = hardwareSummary(hardware);
	$('hardwareCompact').textContent = `RAM ${(hardware.ram / 1073741824).toFixed(1)} GiB · GPU ${(Math.max(0, ...hardware.gpus.map(gpu => gpu.memory)) / 1073741824).toFixed(1)} GiB`;
}
if ($('installModels')) {
	$('installModels').textContent = '+ ' + L.installModels;
	$('installModels').onclick = () => post('modelInstaller', { action: 'open' });
	$('installerTitle').textContent = L.installerTitle;
	$('rescanSpecs').textContent = L.refreshSpecs; $('rescanSpecs').onclick = () => post('modelInstaller', { action: 'rescan' });
	$('inspectModel').textContent = L.checkFit; $('inspectModel').onclick = inspectInstallModel;
	$('customModel').placeholder = L.customModel + ' · name:tag';
	$('customModelLabel').textContent = L.customModel;
	$('customModel').oninput = () => { $('downloadModel').disabled = true; $('useInstalledModel').hidden = true; $('modelFit').textContent = ''; };
	$('customModel').onkeydown = event => { if (event.key === 'Enter') { inspectInstallModel(); } };
	$('installCatalog').onchange = () => { $('customModel').value = ''; inspectInstallModel(); };
	$('fitDisclaimer').textContent = L.fitDisclaimer;
	$('downloadModel').textContent = L.installModel; $('downloadModel').onclick = () => { $('downloadModel').disabled = true; post('modelInstaller', { action: 'install', model: installName() }); };
	$('cancelDownload').textContent = L.cancelDownload; $('cancelDownload').onclick = () => post('modelInstaller', { action: 'cancel' });
	$('useInstalledModel').textContent = L.useModel; $('useInstalledModel').onclick = () => post('modelAction', { action: 'select', model: installerName.includes(':') ? installerName : installerName + ':latest' });
}
function showModels(message) {
	if (!$('modelsList')) { return; }
	$('modelsPanel').open = true; $('modelsList').replaceChildren();
	for (const model of message.models) {
		const card = document.createElement('div'); card.className = 'modelCard';
		const name = document.createElement('strong'); name.textContent = model.name;
		const stats = document.createElement('div'); stats.className = 'modelStats';
		stats.textContent = `${model.parameters} ${model.quantization} · ${L.disk}: ${gigabytes(model.disk)}\n` + (model.loaded ? `${L.loadedMemory}: ${gigabytes(model.memory)} · GPU ${gigabytes(model.vram)} · CPU ${gigabytes(Math.max(0, model.memory - model.vram))}${model.context ? ` · Context ${model.context.toLocaleString()}` : ''}` : L.notLoaded);
		stats.style.whiteSpace = 'pre-wrap';
		const actions = document.createElement('div'); actions.className = 'modelActions';
		const select = document.createElement('button'); select.textContent = model.name === message.selected ? L.selectedModel : L.useModel;
		select.disabled = busy || model.name === message.selected; select.onclick = () => post('modelAction', { action: 'select', model: model.name });
		const unload = document.createElement('button'); unload.textContent = L.unload; unload.disabled = busy || !model.loaded; unload.onclick = () => post('modelAction', { action: 'unload', model: model.name });
		actions.append(select, unload); card.append(name, stats, actions); $('modelsList').append(card);
	}
}

function searchChats() { post('searchChats', { text: $('chatQuery').value.slice(0, 200), mode: $('chatScope').value }); }
function showChatResults(message) {
	if (!$('chatSearchResults') || $('chatQuery').value !== message.query) { return; }
	$('chatSearchResults').replaceChildren();
	if (!message.results.length && message.query.trim()) { $('chatSearchResults').textContent = L.noChats; }
	for (const result of message.results) {
		const button = document.createElement('button'); button.className = 'chatResult';
		const title = document.createElement('strong'); title.textContent = result.title;
		const snippet = document.createElement('small'); snippet.textContent = result.snippet;
		const where = document.createElement('small'); where.textContent = `${result.workspace === message.workspace ? L.openChat : L.openProject} · ${new Date(result.updated).toLocaleDateString()}`;
		button.append(title, snippet, where); button.onclick = () => post('openChatResult', { id: result.id });
		$('chatSearchResults').append(button);
	}
}
function showQueue(message) {
	if (!$('queueItems')) { return; }
	$('queueState').textContent = message.paused ? (message.running ? L.pausing : L.paused) : L.running;
	$('queueRun').disabled = !message.paused || !message.items.some(item => item.state === 'queued');
	$('queuePause').disabled = message.paused;
	$('queueItems').replaceChildren();
	const pending = message.items.filter(item => ['queued', 'running', 'interrupted'].includes(item.state)).length;
	const toggle = document.querySelector('[data-action="queue"]'); if (toggle) { toggle.textContent = L.queue + (pending ? ` (${pending})` : ''); }
	for (const item of message.items) {
		const card = document.createElement('div'); card.className = 'queueItem';
		const state = document.createElement('strong'); state.textContent = ({ interrupted: L.interruptedJob, queued: L.queued, running: L.running, done: L.done, failed: L.failed })[item.state];
		const prompt = document.createElement('p'); prompt.textContent = item.prompt.slice(0, 180);
		const actions = document.createElement('div'); actions.className = 'queueActions';
		const open = document.createElement('button'); open.textContent = L.openChat; open.disabled = busy || message.running; open.onclick = () => post('queueControl', { action: 'open', id: item.id });
		const remove = document.createElement('button'); remove.textContent = L.remove; remove.disabled = item.state === 'running'; remove.onclick = () => post('queueControl', { action: 'remove', id: item.id });
		actions.append(open, remove); card.append(state, prompt);
		if (item.error) { const error = document.createElement('small'); error.textContent = item.error; card.append(error); }
		card.append(actions); $('queueItems').append(card);
	}
}

for (const button of document.querySelectorAll('[data-action]')) {
	button.textContent = L[button.dataset.action];
	button.onclick = () => {
		if (button.dataset.action === 'changes' && $('changesPanel')) { $('changesPanel').open = !$('changesPanel').open; }
		post('action', { action: button.dataset.action });
	};
}
if ($('attachFile')) { $('attachFile').textContent = L.attach; $('attachFile').onclick = () => post('attach', { mode: 'file' }); }
if ($('attachFolder')) { $('attachFolder').textContent = L.folder; $('attachFolder').onclick = () => post('attach', { mode: 'folder' }); }
if ($('changesTitle')) { $('changesTitle').textContent = L.changes; }
if ($('contextTitle')) { $('contextTitle').textContent = L.used; }
if ($('modelsTitle')) { $('modelsTitle').textContent = L.models; }
if ($('modelsRefresh')) { $('modelsRefresh').textContent = L.refresh; $('modelsRefresh').onclick = () => post('action', { action: 'models' }); }
if ($('resumeRequest')) { $('resumeRequest').textContent = L.resume; $('resumeRequest').onclick = () => post('action', { action: 'resume' }); }
if ($('discardRequest')) { $('discardRequest').textContent = L.discard; $('discardRequest').onclick = () => post('discardCheckpoint'); }
if ($('chatSearchTitle')) { $('chatSearchTitle').textContent = L.chatSearch; $('chatQuery').placeholder = L.chatQuery; $('chatScope').options[0].textContent = L.projectChats; $('chatScope').options[1].textContent = L.allChats; $('chatQuery').oninput = () => { clearTimeout(chatSearchTimer); chatSearchTimer = setTimeout(searchChats, 300); }; $('chatScope').onchange = searchChats; }
if ($('queueTitle')) { $('queueTitle').textContent = L.queue; $('queueRun').textContent = L.queueRun; $('queuePause').textContent = L.queuePause; $('queueRun').onclick = () => post('queueControl', { action: 'run' }); $('queuePause').onclick = () => post('queueControl', { action: 'pause' }); }
if ($('enqueueRequest')) { $('enqueueRequest').textContent = L.queue; $('enqueueRequest').title = L.queueAdd; $('enqueueRequest').onclick = () => { const text = $('prompt').value.trim(); if (text) { $('enqueueRequest').disabled = true; post('enqueue', { text, includeFile: $('include').checked }); } }; }

function welcome() {
	const card = document.createElement('div'); card.className = 'welcome';
	const heading = document.createElement('h2'); heading.textContent = L.hello;
	const text = document.createElement('p'); text.textContent = L.intro;
	card.append(heading, text); $('messages').append(card);
}
function add(role, text, kind = '') {
	const wrap = document.createElement('section'); wrap.className = 'message ' + kind;
	const title = document.createElement('div'); title.className = 'role'; title.textContent = role;
	const content = document.createElement('div'); content.className = 'content';
	if (role === 'Aethrix' && !kind) { render(content, text); } else { content.textContent = text; }
	wrap.append(title, content); $('messages').append(wrap);
	return content;
}
function tool(text, output) {
	const element = document.createElement('details'); element.className = 'tool';
	const summary = document.createElement('summary');
	summary.textContent = text.split('\n')[0].slice(0, 180);
	const details = document.createElement('pre'); details.textContent = output || text;
	element.append(summary, details);
	$('messages').append(element);
}
function scroll() { $('messages').scrollTop = $('messages').scrollHeight; }
function transcript(entries) {
	$('messages').replaceChildren(); current = null;
	if (!entries.length) { welcome(); }
	for (const entry of entries) {
		if (entry.role === 'tool' || entry.role === 'info') { tool(entry.text); }
		else if (entry.text) { add(entry.role === 'user' ? 'You' : 'Aethrix', entry.text, entry.role === 'user' ? 'user' : entry.role === 'error' ? 'error' : ''); }
	}
	scroll();
}
function send() {
	const text = $('prompt').value.trim();
	if (!text || busy) { return; }
	post('send', { text, includeFile: $('include').checked });
	$('prompt').value = ''; vscode.setState({ draft: '' });
}
function modeHint() {
	if ($('modeHint')) { $('modeHint').textContent = L[$('mode').value + 'Hint']; $('mode').title = $('modeHint').textContent; }
}
if ($('toolsLabel')) { $('toolsLabel').textContent = L.toolsMenu; }
if ($('contextSettingsLabel')) { $('contextSettingsLabel').textContent = L.contextSettings; }
document.addEventListener('click', event => { if ($('toolsMenu') && (!event.target.closest('#toolsMenu') || event.target.closest('[data-action]'))) { $('toolsMenu').open = false; } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('toolsMenu')?.open) { $('toolsMenu').open = false; $('toolsLabel').focus(); } });
if ($('mode')) {
	$('modeLabel').textContent = L.modeLabel;
	for (const option of $('mode').options) { option.textContent = L[option.value + 'Mode']; }
	$('mode').onchange = () => { modeHint(); post('setMode', { mode: $('mode').value }); };
	modeHint();
}
for (const action of ['Open', 'Model', 'Build']) {
	const button = $('plan' + action);
	if (button) { button.textContent = L['plan' + action]; button.onclick = () => post('planAction', { action: action.toLowerCase() }); }
}
$('send').textContent = L.send; $('cancel').textContent = L.cancel;
$('cancel').disabled = true; $('context').textContent = L.context;
$('prompt').placeholder = L.placeholder; $('prompt').value = state.draft || '';
$('connection').textContent = L.checking; $('status').textContent = L.ready;
$('reconnect').title = L.reconnect; $('reset').title = L.newChat;
$('approvalLabel').textContent = L.approval;
for (const option of $('approval').options) { option.textContent = { off: L.ask, files: L.files, all: L.all }[option.value]; }
$('history').title = L.saved;
$('history').onchange = () => post('selectChat', { id: $('history').value });
$('approval').onchange = () => post('approval', { mode: $('approval').value });
$('send').onclick = send; $('cancel').onclick = () => post('cancel');
$('reset').onclick = () => post('reset'); $('reconnect').onclick = () => post('check');
$('model').onchange = () => post('model', { model: $('model').value });
$('prompt').oninput = () => vscode.setState({ draft: $('prompt').value });
$('prompt').onkeydown = event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); } };
welcome();
window.addEventListener('message', ({ data: message }) => {
	if ($('installerPanel')) {
		if (message.type === 'installerReveal') { $('installerPanel').open = true; }
		if (message.type === 'installerLoading') { $('installerPanel').open = true; if ($('modelsPanel')) { $('modelsPanel').open = false; } $('hardwareCompact').textContent = L.scanPending; $('downloadModel').disabled = true; $('useInstalledModel').hidden = true; }
		if (message.type === 'installerHardware') {
			renderHardware(message.hardware);
			$('installCatalog').replaceChildren();
			for (const model of message.models) { const option = document.createElement('option'); option.value = model.name; option.textContent = model.name + (model.name === message.recommended ? ` · ${L.suggested}` : ''); $('installCatalog').append(option); }
			if (message.recommended) { $('installCatalog').value = message.recommended; }
			$('customModel').value = ''; if (!installerPulling) { inspectInstallModel(); }
		}
		if (message.type === 'installerFit' && message.name === (installerName.includes(':') ? installerName : installerName + ':latest')) {
			renderHardware(message.hardware);
			const fit = $('modelFit'); fit.className = 'fitBadge ' + message.fit;
			fit.textContent = ({ gpu: L.gpuFit, offload: L.offloadFit, cpu: L.cpuFit, tooLarge: L.largeFit })[message.fit] + `\n${L.downloadSize}: ${(message.size / 1073741824).toFixed(1)} GiB · ${L.memoryEstimate}: ${(message.needed / 1073741824).toFixed(1)} GiB` + (message.diskOkay === false && !message.installed ? '\n' + L.diskLow : '') + (message.memoryBusy ? '\n' + L.memoryBusy : '') + (message.installed ? '\n' + L.alreadyInstalled : '');
			if (message.offline) { fit.textContent += '\n' + L.ollamaRequired; }
			$('downloadModel').disabled = installerPulling || message.diskOkay === false || message.installed || !!message.offline;
			$('downloadModel').hidden = !!message.installed;
			$('useInstalledModel').hidden = !message.installed; $('useInstalledModel').disabled = busy || installerPulling;
		}
		if (message.type === 'installerPull') {
			installerPulling = message.active;
			$('downloadStatus').className = '';
			$('downloadStatus').textContent = message.status + (message.total ? ` · ${(message.completed / 1073741824).toFixed(1)} / ${(message.total / 1073741824).toFixed(1)} GiB` : '');
			$('downloadProgress').hidden = !message.active;
			if (message.total) { $('downloadProgress').max = message.total; $('downloadProgress').value = message.completed; } else { $('downloadProgress').removeAttribute('value'); }
			$('cancelDownload').hidden = !message.active;
			for (const id of ['installCatalog', 'customModel', 'inspectModel', 'rescanSpecs']) { $(id).disabled = message.active; }
			$('downloadModel').disabled = true;
		}
		if (message.type === 'installerError') { $('downloadStatus').textContent = message.text; $('downloadStatus').className = 'error'; }
		if (message.type === 'installerIdle') { installerPulling = false; $('downloadProgress').hidden = true; $('cancelDownload').hidden = true; for (const id of ['installCatalog', 'customModel', 'inspectModel', 'rescanSpecs']) { $(id).disabled = false; } }
	}
	if (message.type === 'workflow' && $('mode')) {
		$('mode').value = message.mode; modeHint();
		$('workflowPanel').hidden = !message.question && !message.plan;
		$('questionText').textContent = message.question ? message.question + '\n\n' + L.questionHint : '';
		$('planControls').hidden = !message.plan;
		$('planName').textContent = message.plan ? `${message.plan.path} · ${message.plan.model}` : '';
	}
	if (message.type === 'sessions') {
		$('history').replaceChildren();
		for (const session of message.sessions) {
			const option = document.createElement('option'); option.value = session.id; option.textContent = session.title;
			$('history').append(option);
		}
		$('history').value = message.activeId;
	}
	if (message.type === 'transcript') { transcript(message.entries); }
	if (message.type === 'approval') { $('approval').value = message.mode; }
	if (message.type === 'connection') {
		$('connection').textContent = message.online ? L.connected : L.offline;
		$('connection').title = $('connection').textContent; $('connection').setAttribute('aria-label', $('connection').textContent); $('connection').dataset.online = String(message.online);
		if (message.model) { $('model').value = message.model; }
	}
	if (message.type === 'file') { $('file').textContent = message.name ? '· ' + message.name : ''; }
	if (message.type === 'busy') {
		busy = message.value;
		if ($('useInstalledModel')) { $('useInstalledModel').disabled = busy || installerPulling; }
		for (const id of ['mode', 'planOpen', 'planModel', 'planBuild']) { if ($(id)) { $(id).disabled = busy; } }
		clearInterval(clock);
		if ($('progress')) { $('progress').hidden = !busy; }
		if (busy) { started = Date.now(); updateClock(); clock = setInterval(updateClock, 1000); }
		if ($('checkpointBar')) { $('checkpointBar').hidden = busy || !hasCheckpoint; }
		for (const button of document.querySelectorAll('[data-action], #attachFile, #attachFolder')) { button.disabled = (busy && button.dataset.action !== 'queue') || (button.id === 'fixBuild' && !button.dataset.ready); }
		$('send').disabled = busy; $('model').disabled = busy; $('history').disabled = busy;
		$('reset').disabled = busy; $('cancel').disabled = !busy;
		if (!busy && current?.dataset.pending) { current.closest('.message').remove(); current = null; }
	}
	if (message.type === 'checkpoint') { hasCheckpoint = message.available; if ($('checkpointBar')) { $('checkpointBar').hidden = busy || !hasCheckpoint; $('checkpointText').textContent = `${L.interrupted} · ${message.completed} saved steps`; } }
	if (message.type === 'modelInventory') { showModels(message); }
	if (message.type === 'showChatSearch' && $('chatSearchPanel')) { $('chatSearchPanel').open = true; $('chatQuery').focus(); }
	if (message.type === 'chatSearchResults') { showChatResults(message); }
	if (message.type === 'showQueue' && $('queuePanel')) { $('queuePanel').open = true; }
	if (message.type === 'requestQueue') { showQueue(message); }
	if (message.type === 'enqueued' && $('enqueueRequest')) { $('enqueueRequest').disabled = false; if ($('prompt').value.trim() === message.text) { $('prompt').value = ''; vscode.setState({ draft: '' }); } if ($('queuePanel')) { $('queuePanel').open = true; } }
	if (message.type === 'status') { $('status').textContent = message.text; if ($('phase')) { $('phase').textContent = message.text; } if (current?.dataset.pending) { current.textContent = message.text; } }
	if (message.type === 'attachments' && $('attachments')) {
		$('attachments').replaceChildren();
		for (const file of message.files) { const chip = document.createElement('button'); chip.className = 'attachment'; chip.textContent = `${file} ×`; chip.title = file; chip.onclick = () => post('detach', { path: file }); $('attachments').append(chip); }
	}
	if (message.type === 'contextSources' && $('contextSources')) { $('contextSources').textContent = `${message.characters.toLocaleString()} / ${message.limit.toLocaleString()} characters\n` + (message.sources.map(source => `${source.path} · ${source.characters.toLocaleString()}${source.partial ? ' · excerpt' : ''}`).join('\n') || 'No file contents attached.'); }
	if (message.type === 'changes') { showChanges(message.requests); }
	if (message.type === 'buildResult' && $('fixBuild')) { $('fixBuild').dataset.ready = 'true'; $('fixBuild').disabled = busy; }
	if (message.type === 'searchResults') {
		const results = add('Aethrix', `Search: ${message.query}`);
		for (const line of message.results.split('\n')) {
			const match = /^(.*?):(\d+):\s*(.*)$/.exec(line);
			const item = document.createElement(match ? 'button' : 'div'); item.className = 'searchHit'; item.textContent = line;
			if (match) { item.onclick = () => post('openFile', { path: `${match[1]}:${match[2]}` }); }
			results.append(item);
		}
	}
	if (message.type === 'reset') { transcript([]); }
	if (message.type === 'user') { $('messages').querySelector('.welcome')?.remove(); add('You', message.text, 'user'); }
	if (message.type === 'assistantStart') {
		if (current?.dataset.pending) { current.closest('.message').remove(); }
		current = add('Aethrix', L.working); current.dataset.pending = 'true'; $('status').textContent = L.working;
	}
	if (message.type === 'assistant' && current && message.text.trim()) { delete current.dataset.pending; render(current, message.text); }
	if (message.type === 'tool' || message.type === 'info') { tool(message.text, message.output); }
	if (message.type === 'error') { add('Aethrix', message.text, 'error'); $('status').textContent = message.text; if ($('enqueueRequest')) { $('enqueueRequest').disabled = false; } }
	scroll();
});
post('ready');
