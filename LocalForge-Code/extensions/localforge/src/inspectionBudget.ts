/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ToolCall } from './ollama';

/** Keep broad repository explanations from spending every turn paging one file. */
export class InspectionBudget {
	readonly overview: boolean;
	private readonly pages = new Map<string, Set<string>>();
	constructor(prompt: string) {
		this.overview = /\b(explain|summari[sz]e|describe|overview|understand)\b/i.test(prompt)
			&& /\b(repo(?:sitory)?|project|codebase)\b/i.test(prompt)
			&& !/\b(fix|implement|change|edit|build|refactor|add|create)\b/i.test(prompt);
	}
	check(call: ToolCall): string | undefined {
		if (!this.overview || call.function.name !== 'read_file') { return; }
		const args = call.function.arguments;
		const file = String(args.path || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
		const range = `${Number(args.start_line || 1)}:${Number(args.max_lines || 160)}`;
		const pages = this.pages.get(file) || new Set<string>();
		if (pages.has(range) || pages.size >= 2) {
			return 'Repository overview inspection is complete for this file. Do not keep paging or rereading it. Summarize the verified evidence now, explicitly noting any unknowns; do not infer unread behavior.';
		}
		pages.add(range); this.pages.set(file, pages);
		return undefined;
	}
}
