/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ollamaEndpoint } from './localRuntime';
/** Opt-in local completions. Agent requests take priority over background generation. */
export function registerLocalCompletion(context: vscode.ExtensionContext, busy: () => boolean, usage?: (value: { inputTokens: number; outputTokens: number }) => Promise<void>) {
	if (!vscode.languages.registerInlineCompletionItemProvider) { return; }
	let active: AbortController | undefined;
	context.subscriptions.push({ dispose() { active?.abort(); } });
	context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, {
		async provideInlineCompletionItems(document, position, _context, token) {
			const config = vscode.workspace.getConfiguration('localforge');
			if (!config.get('inlineCompletion', false) || busy() || !vscode.workspace.isTrusted || token.isCancellationRequested) { return []; }
			const line = document.lineAt(position.line).text.trimStart();
			if (!config.get('suggestInComments', false) && /^(\/\/|\/\*|\*|#)/.test(line)) { return []; }
			active?.abort(); const controller = active = new AbortController(); const cancel = token.onCancellationRequested(() => controller.abort());
			try {
				await new Promise<void>(resolve => setTimeout(resolve, 400)); if (controller.signal.aborted || busy()) { return []; }
				const text = document.getText(); const offset = document.offsetAt(position); const version = document.version;
				const response = await fetch(ollamaEndpoint() + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), body: JSON.stringify({ model: config.get('model', 'qwen3-coder:30b'), stream: false, prompt: `Complete the ${document.languageId} source at <CURSOR>. Return only the missing code, no Markdown or explanation. Do not repeat surrounding code.\n${text.slice(Math.max(0, offset - 2500), offset)}<CURSOR>${text.slice(offset, offset + 1000)}`, options: { temperature: 0, num_predict: 128, num_ctx: 4096 } }) });
				if (!response.ok || document.version !== version || busy()) { return []; }
				const data = await response.json() as { response?: string; prompt_eval_count?: number; eval_count?: number };
				if (Number.isFinite(data.prompt_eval_count) && Number.isFinite(data.eval_count)) { await usage?.({ inputTokens: data.prompt_eval_count!, outputTokens: data.eval_count! }); }
				const suggestion = (data.response || '').replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '').slice(0, 2000);
				if (controller.signal.aborted || (!suggestion.trim() && !config.get('whitespaceSuggestions', false))) { return []; }
				return [new vscode.InlineCompletionItem(suggestion, new vscode.Range(position, position))];
			} catch { return []; } finally { cancel.dispose(); if (active === controller) { active = undefined; } }
		}
	}));
}
