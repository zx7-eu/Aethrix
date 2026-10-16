/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
export const GiB = 1073741824;
export interface Hardware { cpu: string; cores: number; ram: number; availableRam: number; gpus: { name: string; memory: number }[]; modelPath: string; diskFree: number | null; warning?: string; scanned: string }
export const modelCatalog = [
	{ name: 'qwen2.5-coder:1.5b', size: 986000000, rank: 20, purpose: 'Lightweight coding' },
	{ name: 'qwen2.5-coder:3b', size: 1900000000, rank: 35, purpose: 'Lightweight coding' },
	{ name: 'qwen2.5-coder:7b', size: 4700000000, rank: 60, purpose: 'Coding' },
	{ name: 'qwen2.5-coder:14b', size: 9000000000, rank: 80, purpose: 'Coding' },
	{ name: 'qwen2.5-coder:32b', size: 20000000000, rank: 90, purpose: 'Coding' },
	{ name: 'qwen3-coder:30b', size: 19000000000, rank: 100, purpose: 'Agentic coding' },
	{ name: 'qwen3:8b', size: 5200000000, rank: 55, purpose: 'General reasoning and tools' },
	{ name: 'deepseek-r1:70b', size: 43000000000, rank: 45, purpose: 'Reasoning; tool support varies' }
];
/** Read dedicated GPU memory via DXGI rather than the truncated 32-bit WMI AdapterRAM field. */
export async function scanHardware(script: string): Promise<Hardware> {
	const cpu = os.cpus();
	const hardware: Hardware = { cpu: cpu[0]?.model || os.arch(), cores: cpu.length, ram: os.totalmem(), availableRam: os.freemem(), gpus: [], modelPath: process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama/models'), diskFree: null, scanned: new Date().toISOString() };
	if (process.platform === 'win32') {
		try {
			const encoded = Buffer.from(await fs.readFile(script, 'utf8'), 'utf16le').toString('base64');
			const result = await new Promise<string>((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 20000, maxBuffer: 262144 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
			const data = JSON.parse(result.replace(/^\uFEFF/, '').trim());
			hardware.gpus = (Array.isArray(data.gpus) ? data.gpus : []).filter((gpu: { name: unknown; memory: unknown }) => typeof gpu.name === 'string' && Number.isFinite(gpu.memory) && Number(gpu.memory) >= 0);
			if (typeof data.modelPath === 'string') { hardware.modelPath = data.modelPath; }
			if (Number.isFinite(data.diskFree)) { hardware.diskFree = Number(data.diskFree); }
		} catch { hardware.warning = 'GPU or storage detection was unavailable. No GPU capacity is assumed.'; }
	} else { hardware.warning = 'GPU detection currently supports Windows. RAM-only estimates shown.'; }
	return hardware;
}
/** Estimate fit conservatively; model architecture, context and backend support still affect real usage. */
export function assessFit(size: number, hardware: Hardware, context = 8192) {
	if (!Number.isFinite(size) || size <= 0) { throw new Error('Model download size is unknown.'); }
	context = Number.isFinite(context) ? Math.max(2048, Math.min(131072, Math.round(context))) : 8192;
	const needed = size * 1.12 + GiB + context * 131072;
	const vram = Math.max(0, ...hardware.gpus.map(gpu => gpu.memory));
	const gpuBudget = Math.max(0, vram - Math.max(GiB, vram * .1));
	const ramBudget = Math.max(0, hardware.ram - Math.max(4 * GiB, hardware.ram * .15));
	const diskNeeded = size * 1.15 + GiB;
	const diskOkay = hardware.diskFree === null ? null : hardware.diskFree >= diskNeeded;
	const fit = needed <= gpuBudget ? 'gpu' : needed <= ramBudget + gpuBudget ? (gpuBudget ? 'offload' : 'cpu') : 'tooLarge';
	return { fit, needed, diskNeeded, diskOkay, memoryBusy: needed > hardware.availableRam + gpuBudget, context };
}
export function recommend(hardware: Hardware, context = 8192) {
	const candidates = modelCatalog.map(model => ({ ...model, ...assessFit(model.size, hardware, context) }));
	const suitable = candidates.filter(model => model.fit === 'gpu' && model.diskOkay !== false).sort((a, b) => b.rank - a.rank);
	return suitable[0]?.name || candidates.filter(model => ['offload', 'cpu'].includes(model.fit) && model.diskOkay !== false).sort((a, b) => a.size - b.size)[0]?.name;
}
export function parseModelName(input: string) {
	if (input.length > 160 || !/^(?:[a-z0-9][a-z0-9_-]*\/)?[a-z0-9][a-z0-9_.-]*(?::[a-z0-9][a-z0-9_.-]*)?$/i.test(input) || /(?:^|[-:])cloud$/i.test(input)) { throw new Error('Enter a local Ollama model tag, such as qwen2.5-coder:14b. Cloud models and URLs are not supported here.'); }
	const [model, tag = 'latest'] = input.split(':');
	return { name: model + ':' + tag, repository: model.includes('/') ? model : 'library/' + model, tag };
}
/** Query the registry before pulling so custom tags have a real current download size. */
export async function inspectModel(input: string, endpoint = 'https://registry.ollama.ai') {
	const model = parseModelName(input);
	const response = await fetch(`${endpoint}/v2/${model.repository}/manifests/${model.tag}`, { headers: { Accept: 'application/vnd.docker.distribution.manifest.v2+json' }, signal: AbortSignal.timeout(15000) });
	if (!response.ok) { throw new Error(`Cannot inspect this model (registry HTTP ${response.status}). Check its name and internet connection.`); }
	const manifest = await response.json() as { layers?: { size: number }[]; config?: { size: number } };
	if (!Array.isArray(manifest.layers) || !manifest.layers.length || manifest.layers.some(layer => !Number.isSafeInteger(layer.size) || layer.size < 0)) { throw new Error('The registry did not return a local model size.'); }
	const size = manifest.layers.reduce((total, layer) => total + layer.size, 0) + (manifest.config?.size || 0);
	if (!Number.isSafeInteger(size) || size <= 0) { throw new Error('Invalid model download size.'); }
	return { name: model.name, size };
}
