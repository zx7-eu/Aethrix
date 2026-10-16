// Run after all branding and workbench modifications, before creating the EXE.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const app = path.resolve(process.argv[2] || path.join(__dirname, '../VSCode-win32-x64/resources/app'));
const productFile = path.join(app, 'product.json');
const product = JSON.parse(fs.readFileSync(productFile, 'utf8'));
const updated = [];
for (const [relative, expected] of Object.entries(product.checksums || {})) {
	const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(app, 'out', relative))).digest('base64').replace(/=+$/, '');
	if (actual !== expected) { updated.push(relative); product.checksums[relative] = actual; }
}
if (!Object.keys(product.checksums || {}).length) { throw new Error('Missing integrity manifest'); }
fs.writeFileSync(productFile, JSON.stringify(product, null, '\t'));
console.log(JSON.stringify({ integrityFiles: Object.keys(product.checksums).length, updated }));
