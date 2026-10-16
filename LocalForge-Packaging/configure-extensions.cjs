// Apply Aethrix's local-first product settings to source and packaged builds.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = path.resolve(process.argv[2] || path.join(root, 'VSCode-win32-x64/resources/app'));
const verifier = path.join(app, 'node_modules/aethrix-ovsx-sign');
fs.mkdirSync(verifier, { recursive: true });
fs.writeFileSync(path.join(verifier, 'package.json'), JSON.stringify({ name: 'aethrix-ovsx-sign', version: '1.0.0', main: 'index.cjs', license: 'MIT' }));
const notices = ['yauzl', 'buffer-crc32', 'pend'].map(name => name + '\n' + fs.readFileSync(path.join(root, 'LocalForge-Code/node_modules', name, 'LICENSE'), 'utf8')).join('\n\n');
require('../LocalForge-Code/extensions/node_modules/esbuild').buildSync({ entryPoints: [path.join(__dirname, 'openvsx-sign.cjs')], bundle: true, platform: 'node', format: 'cjs', banner: { js: '/*!\nBundled dependency licenses:\n' + notices + '\n*/' }, outfile: path.join(verifier, 'index.cjs') });
fs.copyFileSync(path.join(root, 'LocalForge-Code/LICENSE.txt'), path.join(verifier, 'LICENSE.txt'));
for (const relative of ['vs/code/node/cliProcessMain.js', 'vs/code/electron-utility/sharedProcess/sharedProcessMain.js']) {
	const file = path.join(app, 'out', relative);
	let contents = fs.readFileSync(file, 'utf8');
	if (!contents.includes('"@vscode/vsce-sign"') && !contents.includes('"aethrix-ovsx-sign"')) { throw new Error('Signature verifier import changed: ' + relative); }
	contents = contents.replaceAll('"@vscode/vsce-sign"', '"aethrix-ovsx-sign"');
	fs.writeFileSync(file, contents);
}
for (const file of [path.join(root, 'LocalForge-Code/product.json'), path.join(app, 'product.json')]) {
	const product = JSON.parse(fs.readFileSync(file, 'utf8'));
	product.extensionsGallery = {
		serviceUrl: 'https://open-vsx.org/vscode/gallery',
		itemUrl: 'https://open-vsx.org/vscode/item',
		resourceUrlTemplate: 'https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}',
		extensionUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest'
	};
	product.linkProtectionTrustedDomains = [...new Set([...(product.linkProtectionTrustedDomains || []), 'https://open-vsx.org'])];
	delete product.configurationSync;
	delete product.editSessions;
	fs.writeFileSync(file, JSON.stringify(product, null, '\t') + '\n');
}
const file = path.join(app, 'out/vs/workbench/workbench.desktop.main.js');
let bundle = fs.readFileSync(file, 'utf8');
bundle = bundle.replace('assertDefined(product_default.defaultChatAgent, "Onboarding requires a default chat agent product configuration.");', '/* Aethrix: hosted onboarding is optional. */');
if (!bundle.includes('/* Aethrix: skip hosted onboarding */')) {
	const start = bundle.indexOf('var OnboardingVariationA =');
	const show = bundle.indexOf('  show() {', start);
	if (start < 0 || show < 0) { throw new Error('Hosted onboarding implementation changed.'); }
	bundle = bundle.slice(0, show) + bundle.slice(show).replace('  show() {', '  show() { /* Aethrix: skip hosted onboarding */ if (product_default.nameShort === "Aethrix" || !product_default.defaultChatAgent) { return; }');
}
bundle = bundle.replace('/* Aethrix: skip hosted onboarding */ if (!product_default.defaultChatAgent)', '/* Aethrix: skip hosted onboarding */ if (product_default.nameShort === "Aethrix" || !product_default.defaultChatAgent)');
if (!bundle.includes('/* Aethrix: accounts disabled */')) {
	const visible = /function isAccountsActionVisible\(storageService\) \{\s*return storageService\.getBoolean\(AccountsActivityActionViewItem\.ACCOUNTS_VISIBILITY_PREFERENCE_KEY,[^;]+;\s*\}/;
	if (!visible.test(bundle)) { throw new Error('Accounts visibility implementation changed; review the patch.'); }
	bundle = bundle.replace(visible, 'function isAccountsActionVisible(storageService) { /* Aethrix: accounts disabled */ return false; }');
	for (const id of ['toggleAccountsVisibility', 'toggle.hideAccounts']) {
		const pattern = new RegExp('toAction\\(\\{ id: "' + id.replace('.', '\\.') + '",[^\\n]+?\\}\\)');
		if (!pattern.test(bundle)) { throw new Error('Account menu implementation changed: ' + id); }
		// The first menu is a single-item array; the second menu also contains Manage.
		bundle = id === 'toggleAccountsVisibility' ? bundle.replace(pattern, '') : bundle.replace(new RegExp(pattern.source + ',\\s*'), '');
	}
}
fs.writeFileSync(file, bundle);
console.log('Open VSX configured; built-in account controls and hosted assistant sign-in removed.');
