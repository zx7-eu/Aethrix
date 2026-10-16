/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { Message, ToolCall } from './ollama';
export interface Checkpoint { provider?: import('./cloudProviders').Provider; prompt: string; workflow?: import('./workflow').Workflow; model: string; messages: Message[]; requestId?: string; completed: number; pending?: ToolCall; updated: string; inline?: { path: string; start: number; end: number; hash: string } }

/** Restore context without automatically replaying an unfinished or uncertain tool call. */
export function recoveryMessages(checkpoint: Checkpoint): Message[] {
	const messages: Message[] = JSON.parse(JSON.stringify(checkpoint.messages));
	let lastAssistant = -1;
	for (let index = messages.length - 1; index >= 0; index--) { if (messages[index].role === 'assistant') { lastAssistant = index; break; } }
	if (lastAssistant >= 0) {
		const calls = messages[lastAssistant].tool_calls || [];
		const finished = messages.slice(lastAssistant + 1).filter(message => message.role === 'tool').length;
		for (const call of calls.slice(finished)) {
			messages.push({ role: 'tool', tool_name: call.function.name, content: 'Interrupted before a durable result was saved. The action may or may not have completed. Inspect current state before taking another action. Do not assume it failed and do not blindly repeat it.' });
		}
	}
	messages.push({ role: 'system', content: `Resume the interrupted request using the verified tool results above. ${checkpoint.completed} completed tool results were saved. Do not repeat completed actions. Inspect current files to resolve uncertainty before editing. Commands require renewed approval during recovery. Finish with a clear summary of what actually succeeded.` });
	return messages;
}
