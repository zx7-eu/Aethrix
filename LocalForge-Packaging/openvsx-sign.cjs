// Open VSX signs the entire VSIX with an Ed25519 key and stores the detached
// signature as .signature.sig in the signature ZIP. No Microsoft verifier needed.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const yauzl = require('../LocalForge-Code/node_modules/yauzl');

function readEntry(file, name, limit = 1048576) {
	return new Promise((resolve, reject) => {
		yauzl.open(file, { lazyEntries: true, autoClose: false }, (error, zip) => {
			if (error) { reject(error); return; }
			let done = false;
			const finish = (error, data) => { if (done) { return; } done = true; zip.close(); error ? reject(error) : resolve(data); };
			zip.on('error', error => finish(error)); zip.on('end', () => finish(new Error('Missing archive entry: ' + name)));
			zip.on('entry', entry => {
				if (entry.fileName !== name) { zip.readEntry(); return; }
				if (entry.uncompressedSize > limit) { finish(new Error('Archive entry exceeds the size limit.')); return; }
				zip.openReadStream(entry, (error, stream) => {
					if (error) { finish(error); return; }
					let size = 0; const chunks = [];
					stream.on('error', error => finish(error));
					stream.on('data', chunk => { size += chunk.length; if (size > limit) { stream.destroy(new Error('Archive entry exceeds the size limit.')); } else { chunks.push(chunk); } });
					stream.on('end', () => finish(undefined, Buffer.concat(chunks)));
				});
			}); zip.readEntry();
		});
	});
}
async function verifyWithKey(vsix, signatureArchive, key) {
	if ((await fs.stat(vsix)).size > 1073741824) { throw new Error('Extension exceeds the 1 GiB verification limit.'); }
	const signature = await readEntry(signatureArchive, '.signature.sig', 4096);
	const publicKey = crypto.createPublicKey(key);
	if (publicKey.asymmetricKeyType !== 'ed25519') { throw new Error('Unsupported Open VSX signing key.'); }
	return crypto.verify(null, await fs.readFile(vsix), publicKey, signature);
}
async function registryResponse(url) {
	const parsed = new URL(url);
	if (parsed.origin !== 'https://open-vsx.org') { throw new Error('Public keys must come from the configured Open VSX registry.'); }
	const response = await fetch(parsed, { signal: AbortSignal.timeout(15000), redirect: 'error' });
	if (!response.ok) { throw new Error('Open VSX verification request failed: ' + response.status); }
	return response;
}
async function verify(vsix, signatureArchive) {
	try {
		const manifest = JSON.parse((await readEntry(vsix, 'extension/package.json')).toString('utf8'));
		if (![manifest.publisher, manifest.name].every(value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value)) || typeof manifest.version !== 'string' || !/^[a-z0-9.+-]+$/i.test(manifest.version)) { throw new Error('Invalid extension identity.'); }
		const url = `https://open-vsx.org/api/${encodeURIComponent(manifest.publisher)}/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`;
		const metadata = await (await registryResponse(url)).json();
		if (!metadata.files?.publicKey || metadata.namespace?.toLowerCase() !== manifest.publisher.toLowerCase() || metadata.name?.toLowerCase() !== manifest.name.toLowerCase() || metadata.version !== manifest.version) { throw new Error('Registry metadata does not match the extension.'); }
		const response = await registryResponse(metadata.files.publicKey);
		const key = await response.text();
		if (key.length > 16384) { throw new Error('Invalid public key size.'); }
		const valid = await verifyWithKey(vsix, signatureArchive, key);
		return { code: valid ? 'Success' : 'SignatureIsInvalid', didExecute: true };
	} catch (error) { return { code: 'SignatureIsInvalid', didExecute: true, output: String(error) }; }
}
module.exports = { verify, verifyWithKey };
