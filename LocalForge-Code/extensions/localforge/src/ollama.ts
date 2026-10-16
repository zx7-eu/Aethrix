/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { recoverToolCalls, visibleResponseText } from './toolProtocol';

export interface ToolCall { function: { name: string; arguments: Record<string, string> } }
export interface Message { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: ToolCall[]; tool_name?: string }
export interface Tool { type: 'function'; function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, { type: string; description?: string }>; required: string[] } } }
interface Chunk { error?: string; done?: boolean; done_reason?: string; message?: { content?: string; thinking?: string; tool_calls?: ToolCall[] } }

/** Streams a local model response with bounded startup and idle times. */
export async function streamChat(model: string, messages: Message[], tools: Tool[], contextLength: number, signal: AbortSignal, onText: (text: string) => void, onProgress: (seconds: number, received: boolean) => void, endpoint = 'http://127.0.0.1:11434'): Promise<Message> {
	const controller = new AbortController();
	const cancel = () => controller.abort(signal.reason);
	signal.addEventListener('abort', cancel, { once: true });
	if (signal.aborted) { cancel(); }
	const started = Date.now();
	let lastData = started;
	let received = false;
	let timedOut = false;
	const timer = setInterval(() => {
		onProgress(Math.floor((Date.now() - started) / 1000), received);
		if (Date.now() - lastData > (received ? 90000 : 180000) || Date.now() - started > 600000) {
			timedOut = true;
			controller.abort();
		}
	}, 1000);
	try {
		const response = await fetch(`${endpoint}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, tools, stream: true, keep_alive: '15m', options: { num_ctx: contextLength, num_predict: 4096, temperature: 0.25 } }), signal: controller.signal });
		if (!response.ok) { throw new Error(`Ollama ${response.status}: ${(await response.text()).slice(0, 500)}`); }
		if (!response.body) { throw new Error('Ollama returned no response stream.'); }
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let content = '';
		let completed = false;
		let truncated = false;
		const calls: ToolCall[] = [];
		const consume = (line: string) => {
			if (!line.trim()) { return; }
			const chunk = JSON.parse(line) as Chunk;
			if (chunk.error) { throw new Error(chunk.error); }
			if (chunk.message?.content) { content += chunk.message.content; onText(visibleResponseText(content)); }
			if (chunk.message?.tool_calls) { calls.push(...chunk.message.tool_calls); }
			if (chunk.done) { completed = true; truncated = chunk.done_reason === 'length'; }
		};
		try {
			while (true) {
				const result = await reader.read();
				if (result.done) { buffer += decoder.decode(); break; }
				lastData = Date.now(); received = true;
				buffer += decoder.decode(result.value, { stream: true });
				let newline: number;
				while ((newline = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
			}
			consume(buffer);
			if (!completed) { throw new Error('Ollama disconnected before completing its response. Please retry.'); }
			if (truncated) { throw new Error('The response reached its length limit. Ask for a smaller change; incomplete tools were not executed.'); }
			if (!content && calls.length === 0) { throw new Error('The model returned an empty response. Please retry.'); }
			if (calls.length === 0) {
				const recovered = recoverToolCalls(content, tools);
				content = recovered.content; calls.push(...recovered.calls);
			} else { content = visibleResponseText(content); }
			return { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) };
		} finally { await reader.cancel().catch(() => { }); reader.releaseLock(); }
	} catch (error) {
		if (timedOut) { throw new Error('Ollama stopped responding. The request was canceled. Check the model and retry with less context.'); }
		throw error;
	} finally { clearInterval(timer); signal.removeEventListener('abort', cancel); }
}
