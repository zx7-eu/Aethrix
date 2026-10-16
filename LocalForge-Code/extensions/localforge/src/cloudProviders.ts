/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Message, Tool, ToolCall } from './ollama';
export type ApiProvider = 'openai' | 'anthropic';
export type Provider = 'ollama' | ApiProvider;
export const providerEndpoints = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1' };
export function providerOf(value: string): Provider { if (!['ollama', 'openai', 'anthropic'].includes(value)) { throw new Error('Choose Ollama, OpenAI API or Claude API.'); } return value as Provider; }
interface Item { type?: string; id?: string; call_id?: string; name?: string; arguments?: string; text?: string; refusal?: string; thinking?: string; signature?: string; input?: Record<string, string>; content?: Item[] }
interface Event { type: string; item?: Item; delta?: string | { type?: string; text?: string; thinking?: string; signature?: string; partial_json?: string; stop_reason?: string }; index?: number; content_block?: Item; message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }; usage?: { output_tokens?: number }; response?: { status?: string; output?: Item[]; usage?: { input_tokens?: number; output_tokens?: number } } }

/** Reconstruct native tool IDs so every tool result belongs to exactly one call. */
export function encodeConversation(provider: ApiProvider, messages: Message[]) {
	const input: object[] = []; const pending: { id: string; name: string }[] = [];
	const anthropic: { role: 'user' | 'assistant'; content: object[] }[] = [];
	const append = (role: 'user' | 'assistant', blocks: object[]) => { if (!blocks.length) { return; } const last = anthropic.at(-1); if (last?.role === role) { last.content.push(...blocks); } else { anthropic.push({ role, content: blocks }); } };
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index]; if (message.role === 'system') { continue; }
		if (message.role === 'tool') {
			const match = message.tool_call_id ? pending.findIndex(call => call.id === message.tool_call_id) : pending.findIndex(call => !message.tool_name || call.name === message.tool_name);
			if (match < 0) { throw new Error('Tool history is incomplete. Start a new conversation.'); }
			const call = pending.splice(match, 1)[0];
			input.push({ type: 'function_call_output', call_id: call.id, output: message.content });
			append('user', [{ type: 'tool_result', tool_use_id: call.id, content: message.content }]); continue;
		}
		if (message.role === 'user') { input.push({ role: 'user', content: message.content }); append('user', [{ type: 'text', text: message.content }]); continue; }
		const calls = (message.tool_calls || []).map((call, offset) => ({ ...call, id: call.id || `call_aethrix_${index}_${offset}` })); pending.push(...calls.map(call => ({ id: call.id, name: call.function.name })));
		if (message.provider === 'openai' && message.providerItems) { input.push(...message.providerItems); }
		else { if (message.content) { input.push({ role: 'assistant', content: message.content }); } input.push(...calls.map(call => ({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: JSON.stringify(call.function.arguments) }))); }
		append('assistant', message.provider === 'anthropic' && message.providerItems ? message.providerItems : [...(message.content ? [{ type: 'text', text: message.content }] : []), ...calls.map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: call.function.arguments }))]);
	}
	if (pending.length) { throw new Error('A tool request is missing its saved result. Resume or start a new conversation.'); }
	return provider === 'openai' ? input : anthropic;
}
export function providerBody(provider: ApiProvider, model: string, messages: Message[], tools: Tool[]) {
	if (!model.trim() || model.length > 200 || /[\r\n]/.test(model)) { throw new Error('Choose an API model in Aethrix Settings → Providers.'); }
	const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
	if (provider === 'openai') { return { model, instructions: system, input: encodeConversation(provider, messages), stream: true, store: false, max_output_tokens: 4096, include: ['reasoning.encrypted_content'], ...(tools.length ? { tools: tools.map(tool => ({ type: 'function', name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters, strict: false })) } : {}) }; }
	return { model, system, messages: encodeConversation(provider, messages), stream: true, max_tokens: 4096, ...(tools.length ? { tools: tools.map(tool => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })) } : {}) };
}
function headers(provider: ApiProvider, key: string) {
	if (!key.trim() || /[\r\n]/.test(key)) { throw new Error('Add an API key in Aethrix Settings → Providers.'); }
	return provider === 'openai' ? { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` } : { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
}
function apiError(provider: ApiProvider, status: number) { return new Error(`${provider === 'openai' ? 'OpenAI' : 'Claude'} API HTTP ${status}. ${status === 401 || status === 403 ? 'Check the saved API key and account permissions.' : status === 429 ? 'Check API quota, billing and rate limits before retrying.' : 'Check the selected model and provider service status.'}`); }
export async function listApiModels(provider: ApiProvider, key: string, endpoint = providerEndpoints[provider]) {
	const response = await fetch(endpoint + '/models', { headers: headers(provider, key), signal: AbortSignal.timeout(15000), redirect: 'error' }); if (!response.ok) { throw apiError(provider, response.status); }
	const data = await response.json() as { data?: { id?: string }[] };
	return (data.data || []).map(model => model.id).filter((id): id is string => typeof id === 'string').sort();
}
function argumentsOf(input: string | Record<string, string>, name: string, tools: Tool[]) {
	const tool = tools.find(tool => tool.function.name === name); if (!tool) { throw new Error('The API requested an unavailable tool. No action was taken.'); }
	const value = typeof input === 'string' ? JSON.parse(input) : input;
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string')) { throw new Error('The API returned invalid tool arguments. No action was taken.'); }
	if (tool.function.parameters.required.some(key => typeof value[key] !== 'string')) { throw new Error('The API returned incomplete tool arguments. No action was taken.'); }
	return value as Record<string, string>;
}
/** Accept tool calls only after the entire provider stream completes successfully. */
export async function streamApi(provider: ApiProvider, key: string, model: string, messages: Message[], tools: Tool[], signal: AbortSignal, onText: (text: string) => void, onProgress: (seconds: number, received: boolean) => void, endpoint = providerEndpoints[provider]): Promise<Message> {
	const controller = new AbortController(); const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); }
	const started = Date.now(); let last = started, received = false; let content = '', completed = false, truncated = false; let inputTokens = 0, outputTokens = 0;
	const blocks = new Map<number, Item & { json?: string }>(); let items: Item[] = [];
	const completedItems = new Map<string, Item>();
	const timer = setInterval(() => { onProgress(Math.floor((Date.now() - started) / 1000), received); if (Date.now() - last > 90000 || Date.now() - started > 600000) { controller.abort(); } }, 1000);
	try {
		const response = await fetch(endpoint + (provider === 'openai' ? '/responses' : '/messages'), { method: 'POST', headers: headers(provider, key), body: JSON.stringify(providerBody(provider, model, messages, tools)), signal: controller.signal, redirect: 'error' });
		if (!response.ok) { throw apiError(provider, response.status); } if (!response.body) { throw new Error('The API returned no response stream.'); }
		const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '', data: string[] = [];
		const event = () => {
			if (!data.length) { return; } const raw = data.join('\n'); data = []; if (raw === '[DONE]') { return; }
			const value = JSON.parse(raw) as Event;
			if (value.type === 'error' || value.type === 'response.failed' || value.type === 'response.incomplete') { throw new Error('The API response failed or was incomplete. No pending tool was executed.'); }
			if (provider === 'openai') {
				if (['response.output_text.delta', 'response.refusal.delta'].includes(value.type) && typeof value.delta === 'string') { content += value.delta; onText(content); }
				if (value.type === 'response.output_item.done' && value.item?.id) { completedItems.set(value.item.id, value.item); }
				if (value.type === 'response.completed') { if (value.response?.status !== 'completed') { throw new Error('The API did not complete its response.'); } completed = true; items = value.response.output || []; inputTokens = value.response.usage?.input_tokens || 0; outputTokens = value.response.usage?.output_tokens || 0; }
			} else {
				if (value.type === 'message_start') { const usage = value.message?.usage; inputTokens = (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0); }
				if (value.type === 'content_block_start' && value.content_block) { blocks.set(value.index!, { ...value.content_block }); }
				if (value.type === 'content_block_delta' && typeof value.delta === 'object') { const block = blocks.get(value.index!); if (value.delta.type === 'text_delta') { content += value.delta.text || ''; if (block) { block.text = (block.text || '') + (value.delta.text || ''); } onText(content); } if (block && value.delta.type === 'input_json_delta') { block.json = (block.json || '') + (value.delta.partial_json || ''); } }
				if (value.type === 'content_block_delta' && typeof value.delta === 'object') { const block = blocks.get(value.index!); if (block && value.delta.type === 'thinking_delta') { block.thinking = (block.thinking || '') + (value.delta.thinking || ''); } if (block && value.delta.type === 'signature_delta') { block.signature = (block.signature || '') + (value.delta.signature || ''); } }
				if (value.type === 'message_delta') { const delta = value.delta; truncated = typeof delta === 'object' && delta.stop_reason === 'max_tokens'; outputTokens = value.usage?.output_tokens || outputTokens; }
				if (value.type === 'message_stop') { completed = true; }
			}
		};
		const line = (text: string) => { if (!text) { event(); } else if (text.startsWith('data:')) { data.push(text.slice(5).trimStart()); } };
		try { while (true) { const chunk = await reader.read(); if (chunk.done) { buffer += decoder.decode(); break; } last = Date.now(); received = true; buffer += decoder.decode(chunk.value, { stream: true }); let end: number; while ((end = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, end).replace(/\r$/, '')); buffer = buffer.slice(end + 1); } if (buffer.length > 2 * 1024 * 1024) { throw new Error('The API returned an oversized stream frame.'); } } if (buffer) { line(buffer.replace(/\r$/, '')); } event(); }
		finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
		if (!completed || truncated) { throw new Error('The API response ended before completing. No pending tool was executed.'); }
		const calls: ToolCall[] = [];
		items = items.map(item => ({ ...item, ...(item.id ? completedItems.get(item.id) : {}) }));
		if (provider === 'openai') { for (const item of items) { if (item.type === 'function_call') { calls.push({ id: item.call_id, function: { name: item.name!, arguments: argumentsOf(item.arguments || '{}', item.name!, tools) } }); } } if (!content) { content = items.filter(item => item.type === 'message').flatMap(item => item.content || []).map(item => item.text || '').join(''); } }
		else { items = [...blocks.values()].map(({ json, ...item }) => item.type === 'tool_use' ? { ...item, input: argumentsOf(json || item.input || '{}', item.name!, tools) } : item); for (const item of items) { if (item.type === 'tool_use') { calls.push({ id: item.id, function: { name: item.name!, arguments: item.input! } }); } } }
		if (!content && !calls.length) { throw new Error('The API returned an empty response.'); }
		const ids = new Set<string>(); for (const call of calls) { if (!call.id || ids.has(call.id)) { throw new Error('The API returned incomplete or duplicate tool IDs. No action was taken.'); } ids.add(call.id); }
		return { role: 'assistant', content, provider, providerItems: items, ...(calls.length ? { tool_calls: calls } : {}), usage: { inputTokens, outputTokens } };
	} finally { clearInterval(timer); signal.removeEventListener('abort', abort); }
}
