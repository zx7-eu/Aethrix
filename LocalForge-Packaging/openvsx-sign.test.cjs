const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { ZipFile } = require('../LocalForge-Code/node_modules/yazl');
const { verifyWithKey } = require('./openvsx-sign.cjs');
async function zip(file, entries) {
	const archive = new ZipFile(); const chunks = [];
	const finished = new Promise((resolve, reject) => { archive.outputStream.on('data', chunk => chunks.push(chunk)); archive.outputStream.on('error', reject); archive.outputStream.on('end', resolve); });
	for (const [name, data] of entries) { archive.addBuffer(data, name); } archive.end(); await finished; await fs.writeFile(file, Buffer.concat(chunks));
}
test('Open VSX signatures accept authentic packages and reject tampering and wrong keys', async () => {
	const directory = path.join(__dirname, '../LocalForge-Code/.build/signature-test'); await fs.mkdir(directory, { recursive: true });
	const vsix = path.join(directory, 'fixture.vsix'), signature = path.join(directory, 'fixture.sigzip');
	const keys = crypto.generateKeyPairSync('ed25519'); const key = keys.publicKey.export({ type: 'spki', format: 'pem' });
	await zip(vsix, [['extension/package.json', Buffer.from('{"name":"fixture","publisher":"aethrix","version":"1.0.0"}')]]);
	await zip(signature, [['.signature.sig', crypto.sign(null, await fs.readFile(vsix), keys.privateKey)]]);
	assert.equal(await verifyWithKey(vsix, signature, key), true);
	const wrong = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
	assert.equal(await verifyWithKey(vsix, signature, wrong), false);
	await fs.appendFile(vsix, 'tampered'); assert.equal(await verifyWithKey(vsix, signature, key), false);
});
