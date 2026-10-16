/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Tool, ToolCall } from './ollama';

export class ToolProtocolError extends Error { }

/** Locates Qwen tool markup outside Markdown examples. */
function toolStart(text: string): number {
	const match = /<tool_call>|<function=/.exec(text);
	if (!match || (text.slice(0, match.index).match(/```/g)?.length ?? 0) % 2 !== 0) { return -1; }
	return match.index;
}

/** Keeps protocol markup out of the visible answer while streaming. */
export function visibleResponseText(text: string): string {
	const index = toolStart(text);
	if (index >= 0) { return text.slice(0, index).trimEnd(); }
	// A streamed marker may arrive a few characters at a time.
	const lastTag = text.lastIndexOf('<');
	if (lastTag >= 0 && ['<tool_call>', '<function='].some(marker => marker.startsWith(text.slice(lastTag)))) { return text.slice(0, lastTag).trimEnd(); }
	return text;
}

/** Recovers only complete, allowlisted Qwen XML calls; approvals remain in the tool executor. */
export function recoverToolCalls(text: string, tools: Tool[]): { content: string; calls: ToolCall[] } {
	const start = toolStart(text);
	if (start < 0) { return { content: text, calls: [] }; }
	const source = text.slice(start).trim();
	const calls: ToolCall[] = [];
	const blocks = [...source.matchAll(/<function=([a-z_]+)>\s*([\s\S]*?)<\/function>/g)];
	if (!blocks.length && /^(?:\s*<\/?tool_call>\s*)+$/.test(source)) { return { content: text.slice(0, start).trimEnd(), calls: [] }; }
	if (!blocks.length) { throw new ToolProtocolError('The model returned an incomplete tool request.'); }
	let remainder = source;
	for (const block of blocks) {
		const definition = tools.find(tool => tool.function.name === block[1]);
		if (!definition) { throw new ToolProtocolError(`Unsupported model tool: ${block[1]}.`); }
		const parameters: Record<string, string> = {};
		let body = block[2];
		for (const parameter of block[2].matchAll(/<parameter=([a-z_]+)>([\s\S]*?)<\/parameter>/g)) {
			const key = parameter[1];
			if (!(key in definition.function.parameters.properties) || key in parameters) { throw new ToolProtocolError('Invalid or duplicate tool parameter.'); }
			parameters[key] = ['content', 'old_text', 'new_text'].includes(key) ? parameter[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '') : parameter[2].trim();
			body = body.replace(parameter[0], '');
		}
		if (body.trim() || definition.function.parameters.required.some(key => !(key in parameters))) { throw new ToolProtocolError('Incomplete tool parameters.'); }
		calls.push({ function: { name: block[1], arguments: parameters } });
		remainder = remainder.replace(block[0], '');
	}
	if (remainder.replace(/<\/?tool_call>/g, '').trim()) { throw new ToolProtocolError('Invalid tool request envelope.'); }
	return { content: text.slice(0, start).trimEnd(), calls };
}
