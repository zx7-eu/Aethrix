/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */
const api = acquireVsCodeApi();
const labels = window.settingsLabels;
const t = value => labels[value] || value;
const post = (type, extra = {}) => api.postMessage({ type, ...extra });
const $ = id => document.getElementById(id);
const pages = { general: ['⚙', 'General'], usage: ['◷', 'Plan & Usage'], agents: ['◇', 'Agents'], models: ['▧', 'Models'], source: ['⑂', 'Source Control'], network: ['◎', 'Browser & Network'], intelligence: ['⌘', 'Code Intelligence'], beta: ['⌁', 'Beta'] };
let page = api.getState()?.page || 'general';
let state = { fields: [], hidden: [], usage: null, busy: false };
let catalog;
let git;
let period = 'total';
let pulling = false;
let query = '';
const node = (tag, text, cls) => { const element = document.createElement(tag); if (text !== undefined) { element.textContent = t(String(text)); } if (cls) { element.className = cls; } return element; };
const button = (label, action) => { const element = node('button', label); element.onclick = action; return element; };
const notice = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
const gb = bytes => `${(bytes / 1073741824).toFixed(1)} GiB`;
function card(parent, title) { if (title) { parent.append(node('h2', title)); } const element = node('section', undefined, 'card'); parent.append(element); return element; }
function row(parent, title, description, control) {
	const element = node('div', undefined, 'row'); const words = node('div', undefined, 'words'); words.append(node('strong', title)); if (description) { words.append(node('p', description)); } element.append(words); if (control) { element.append(control); } parent.append(element); return element;
}
function navigate(next) {
	page = pages[next] ? next : 'general'; api.setState({ page }); draw();
	if (page === 'models') { post('models'); }
	if (page === 'source') { post('git'); }
}
for (const [key, [icon, title]] of Object.entries(pages)) { const element = button(`${icon}  ${t(title)}`, () => navigate(key)); element.dataset.page = key; $('tabs').append(element); }
$('search').oninput = () => { query = $('search').value.toLowerCase(); draw(); };
function preference(parent, field) {
	let control;
	if (field.kind === 'boolean') { control = node('input'); control.type = 'checkbox'; control.className = 'toggle'; control.checked = field.value; }
	else if (field.options) { control = node('select'); for (const value of field.options) { const option = node('option', value); option.value = value; control.append(option); } control.value = field.value; }
	else { control = node('input'); control.type = field.kind === 'number' ? 'number' : 'text'; control.value = field.value; if (field.min !== undefined) { control.min = field.min; control.max = field.max; } }
	control.setAttribute('aria-label', field.title); control.dataset.setting = field.key;
	control.onchange = () => { control.disabled = true; post('set', { key: field.key, value: field.kind === 'boolean' ? control.checked : field.kind === 'number' ? Number(control.value) : control.value }); };
	row(parent, field.title, field.description, control);
}
function draw() {
	$('heading').textContent = query ? t('Search Settings') : t(pages[page][1]);
	for (const tab of $('tabs').children) { tab.classList.toggle('active', tab.dataset.page === page); tab.setAttribute('aria-current', tab.dataset.page === page ? 'page' : 'false'); }
	const body = $('body'); body.replaceChildren();
	if (query) { const section = card(body); for (const entry of state.fields.filter(item => `${item.title} ${item.description} ${item.section}`.toLowerCase().includes(query))) { preference(section, entry); } return; }
	if (page === 'usage') { usage(body); return; }
	if (page === 'models') { models(body); return; }
	if (page === 'general') { const section = card(body, 'Preferences'); for (const [label, action] of [['Editor Settings', 'editor'], ['Keyboard Shortcuts', 'keys'], ['Import VS Code Preferences', 'import']]) { row(section, label, '', button('Open', () => post('command', { action }))); } }
	if (page === 'agents') { const section = card(body, 'Default Model'); row(section, state.model || 'No model selected', 'Choose an installed local model in Models. The selected model is used for new requests.', button('Models', () => navigate('models'))); }
	if (page === 'source') { source(body); }
	let group; let last;
	for (const field of state.fields.filter(item => item.page === page)) { if (field.section !== last) { group = card(body, field.section); last = field.section; } preference(group, field); }
	if (page === 'network') { const section = card(body, 'Diagnostics'); row(section, 'Test Ollama Connection', '', button('Open', () => post('command', { action: 'test' }))); row(section, 'Open Local Preview', '', button('Open', () => post('command', { action: 'preview' }))); row(section, 'Download Services', 'Model checks and weights: registry.ollama.ai. Extensions: open-vsx.org and publishers’ download hosts. Local prompts go to your configured loopback server.'); }
	if (page === 'intelligence') { const section = card(body, 'Language Extensions'); row(section, 'Open Extension Manager', 'Install compatible language servers, debuggers and formatters from Open VSX.', button('Open', () => post('command', { action: 'extensions' }))); }
	if (page === 'beta') { const section = card(body, 'Local Diagnostics'); row(section, 'Open Logs', 'Inspect local editor and extension logs.', button('Open', () => post('command', { action: 'logs' }))); row(section, 'Export Usage', 'Save counters as JSON. No prompts or source code are included.', button('Save', () => post('command', { action: 'export' }))); }
}
function usage(parent) {
	const section = card(parent); row(section, 'Local · Free', 'No subscription or usage cap. These counters are stored on this PC.');
	const controls = node('div', undefined, 'actions'); controls.append(button('Today', () => { period = 'today'; draw(); }), button('All Time', () => { period = 'total'; draw(); }), button('Refresh', () => post('refresh')), button('Export Usage', () => post('command', { action: 'export' }))); parent.append(controls);
	const values = state.usage?.[period] || {}; const grid = node('div', undefined, 'stats'); parent.append(grid);
	for (const [key, title] of Object.entries({ requests: 'Requests', completed: 'Completed', canceled: 'Canceled', failed: 'Failed', tools: 'Tool Calls', inputTokens: 'Input Tokens', outputTokens: 'Output Tokens', seconds: 'Minutes Running', filesEdited: 'File Edit Operations', linesAdded: 'Lines Added', linesRemoved: 'Lines Removed' })) { const tile = node('section', undefined, 'stat'); tile.append(node('span', title), node('b', key === 'seconds' ? ((values[key] || 0) / 60).toFixed(1) : (values[key] || 0).toLocaleString())); grid.append(tile); }
	parent.append(node('p', 'Tracking starts with this version. Tokens are counted only when Ollama reports them; canceled streams may be missing tokens. Edits count applied assistant changes, including repeated edits, not manual edits or shell changes.', 'muted'));
}
function models(parent) {
	const intro = card(parent); row(intro, 'Models', 'Choose a model to see live memory and storage checks before installing.', button('Refresh', () => post('models', { action: 'rescan' })));
	if (!catalog) { intro.append(node('p', 'Checking hardware…')); return; }
	const h = catalog.hardware; intro.append(node('p', `${h.cpu} · RAM ${gb(h.ram)} · GPU ${gb(Math.max(0, ...h.gpus.map(gpu => gpu.memory)))} · Free storage ${h.diskFree === null ? 'Unknown' : gb(h.diskFree)}`));
	intro.append(node('p', 'Estimated fit; actual driver support and speed vary.', 'muted')); if (catalog.error) { intro.append(node('p', catalog.error, 'warning')); }
	const search = node('input'); search.id = 'modelSearch'; search.placeholder = t('Search models or enter a local tag'); search.setAttribute('aria-label', search.placeholder); parent.append(search);
	const actions = node('div', undefined, 'actions'); actions.append(button('Check Fit', () => post('model', { action: 'inspect', name: search.value.trim() })), button('Install', () => post('model', { action: 'install', name: search.value.trim() })), button('Cancel Download', () => post('model', { action: 'cancel' }))); parent.append(actions);
	const status = node('div', undefined, 'card'); status.id = 'modelStatus'; status.setAttribute('role', 'status'); parent.append(status);
	const list = card(parent);
	const render = () => {
		list.replaceChildren(); const installed = new Map(catalog.installed.map(model => [model.name, model]));
		const all = [...catalog.models, ...catalog.installed.filter(model => !catalog.models.some(item => item.name === model.name)).map(model => ({ name: model.name, size: model.disk, purpose: 'Installed local model', fit: 'unknown' }))];
		for (const model of all.filter(item => `${item.name} ${item.purpose}`.toLowerCase().includes(search.value.toLowerCase()))) {
			const controls = node('div', undefined, 'actions'); const visible = node('input'); visible.type = 'checkbox'; visible.checked = !state.hidden.includes(model.name); visible.setAttribute('aria-label', t('Show in Model Picker') + ': ' + model.name); visible.onchange = () => post('visibility', { name: model.name, value: visible.checked }); controls.append(visible);
			const check = button('Check Fit', () => post('model', { action: 'inspect', name: model.name })); controls.append(check);
			const action = button(installed.has(model.name) ? 'Use Model' : 'Install', () => post('model', { action: installed.has(model.name) ? 'select' : 'install', name: model.name })); action.disabled = pulling || state.busy; controls.append(action);
			row(list, model.name + (model.name === catalog.recommended ? ' ★' : '') + (model.name === state.model ? ' ✓' : ''), `${model.purpose} · ${gb(model.size)} · ${model.fit === 'gpu' ? 'GPU fit estimate' : model.fit === 'tooLarge' ? 'Likely too large' : model.fit === 'offload' ? 'CPU offload' : model.fit === 'cpu' ? 'CPU only' : 'Check fit'}${model.diskOkay === false ? ' · Insufficient storage' : ''} · ${installed.has(model.name) ? t('Installed') : t('Not Installed')}`, controls);
		}
	}; search.oninput = render; render();
}
function source(parent) {
	const section = card(parent, 'Repository'); row(section, git?.branch || 'Source Control', git?.error || git?.root || 'No Git repository in the open folder.');
	const actions = node('div', undefined, 'actions'); section.append(actions);
	for (const [label, action] of [['Refresh', 'refresh'], ['Open Source Control', 'open'], ['Choose Git Executable', 'choose'], ['Configure Git Author', 'identity'], ['Initialize Repository', 'init'], ['Stage All', 'stage'], ['Unstage All', 'unstage'], ['Commit Staged', 'commit'], ['New Branch', 'branch'], ['Fetch', 'fetch'], ['Pull', 'pull'], ['Push', 'push'], ['Open Remote', 'remote'], ['Review Working Changes', 'review']]) { const control = button(label, () => { if (!['open', 'identity'].includes(action)) { control.disabled = true; } post('git', { action }); }); control.disabled = state.busy; actions.append(control); }
	section.append(node('p', 'Git actions use the open repository. Push and Pull contact its configured remote.', 'muted'));
	const files = card(parent, 'Changes'); if (!git?.files?.length) { files.append(node('p', 'No changes.')); }
	for (const file of git?.files || []) { const controls = node('div', undefined, 'actions'); controls.append(button('Open', () => post('git', { action: 'diff', path: file.path })), button('Stage', () => post('git', { action: 'stage', path: file.path }))); row(files, file.path, `${file.index}${file.worktree}`, controls); }
}
window.addEventListener('message', ({ data }) => {
	if (data.type === 'settingsState') { state = data; draw(); }
	if (data.type === 'settingsModels') { catalog = data; if (page === 'models') { draw(); } }
	if (data.type === 'settingsGit') { git = data; if (page === 'source') { draw(); } }
	if (data.type === 'settingsSaved') { notice(t('Saved')); }
	if (data.type === 'settingsError') { notice(data.text, true); draw(); }
	if (data.type === 'settingsNotice' || data.type === 'installerError') { notice(data.text, data.type === 'installerError'); }
	if (data.type === 'busy') { state.busy = data.value; if (page !== 'models') { draw(); } }
	if (data.type === 'installerFit') { const area = $('modelStatus'); if (area) { area.replaceChildren(); area.append(node('strong', data.name), node('p', `${gb(data.size)} download · ${gb(data.needed)} estimated memory · ${gb(data.diskNeeded)} storage required · ${data.fit}${data.diskOkay === false ? ' · Insufficient storage' : ''}`)); } }
	if (data.type === 'installerPull') { pulling = data.active; const area = $('modelStatus'); if (area) { area.replaceChildren(node('p', `${data.status}${data.total ? ' · ' + ((data.completed / data.total) * 100).toFixed(1) + '%' : ''}`)); if (data.active) { const progress = node('progress'); if (data.total) { progress.max = data.total; progress.value = data.completed; } area.append(progress); } } }
	if (data.type === 'installerIdle') { pulling = false; post('models'); }
});
draw(); post('ready');
