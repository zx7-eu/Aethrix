/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ollamaEndpoint } from './localRuntime';
interface LocalModel { name: string; size: number; details?: { parameter_size?: string; quantization_level?: string } }
interface RunningModel { name: string; size: number; size_vram: number; context_length?: number }
/** Stream a resumable Ollama download, requiring an explicit success event. */
export async function pullModel(name: string, signal: AbortSignal, progress: (value: { status: string; completed: number; total: number }) => void, endpoint = ollamaEndpoint()): Promise<void> {
	const response = await fetch(endpoint + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }), signal });
	if (!response.ok || !response.body) { throw new Error(`Ollama ${response.status}: download could not start.`); }
	const reader = response.body.getReader(); const decoder = new TextDecoder();
	const layers = new Map<string, { total: number; completed: number }>();
	let pending = ''; let success = false;
	const line = (text: string) => {
		if (!text.trim()) { return; }
		const chunk = JSON.parse(text) as { error?: string; status?: string; digest?: string; total?: number; completed?: number };
		if (chunk.error) { throw new Error(chunk.error); }
		if (chunk.digest && Number.isFinite(chunk.total) && Number(chunk.total) >= 0) { layers.set(chunk.digest, { total: Number(chunk.total), completed: Math.min(Number(chunk.total), Math.max(0, Number(chunk.completed) || 0)) }); }
		if (chunk.status === 'success') { success = true; }
		progress({ status: chunk.status || 'Downloading', total: [...layers.values()].reduce((sum, layer) => sum + layer.total, 0), completed: [...layers.values()].reduce((sum, layer) => sum + layer.completed, 0) });
	};
	try {
		while (true) {
			signal.throwIfAborted();
			const chunk = await reader.read();
			if (chunk.done) { pending += decoder.decode(); break; }
			pending += decoder.decode(chunk.value, { stream: true });
			let end: number; while ((end = pending.indexOf('\n')) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
			if (pending.length > 65536) { throw new Error('Invalid download response.'); }
		}
		line(pending); if (!success) { throw new Error('Download ended before Ollama confirmed success. Retry to resume.'); }
	} finally { await reader.cancel().catch(() => {}); }
}
export async function modelInventory(endpoint = ollamaEndpoint()) {
	const responses = await Promise.all(['/api/tags', '/api/ps'].map(route => fetch(endpoint + route, { signal: AbortSignal.timeout(5000) })));
	for (const response of responses) { if (!response.ok) { throw new Error(`Ollama ${response.status}: cannot read model inventory.`); } }
	const installed = await responses[0].json() as { models: LocalModel[] };
	const running = await responses[1].json() as { models: RunningModel[] };
	return (installed.models || []).map(model => {
		const loaded = running.models?.find(item => item.name === model.name);
		return { name: model.name, disk: model.size, parameters: model.details?.parameter_size || '', quantization: model.details?.quantization_level || '', loaded: !!loaded, memory: loaded?.size || 0, vram: loaded?.size_vram || 0, context: loaded?.context_length || 0 };
	});
}
export async function unloadModel(name: string, endpoint = ollamaEndpoint()) {
	const models = await modelInventory(endpoint);
	if (!models.some(model => model.name === name)) { throw new Error('Select an installed model.'); }
	const response = await fetch(endpoint + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, keep_alive: 0, stream: false }), signal: AbortSignal.timeout(15000) });
	if (!response.ok) { throw new Error(`Ollama ${response.status}: unload failed.`); }
}
