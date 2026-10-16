/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
export interface Usage { requests: number; completed: number; canceled: number; failed: number; tools: number; inputTokens: number; outputTokens: number; seconds: number; filesEdited: number; linesAdded: number; linesRemoved: number }
const empty = (): Usage => ({ requests: 0, completed: 0, canceled: 0, failed: 0, tools: 0, inputTokens: 0, outputTokens: 0, seconds: 0, filesEdited: 0, linesAdded: 0, linesRemoved: 0 });
/** Count the changed middle of an edit, excluding its unchanged prefix and suffix. */
export function changedLines(before: string, after: string) {
	const diff = require('diff') as { diffLines(a: string, b: string): { added?: boolean; removed?: boolean; count: number }[] };
	const changes = diff.diffLines(before.replace(/\r\n/g, '\n'), after.replace(/\r\n/g, '\n'));
	return { linesAdded: changes.reduce((sum, part) => sum + (part.added ? part.count : 0), 0), linesRemoved: changes.reduce((sum, part) => sum + (part.removed ? part.count : 0), 0) };
}
/** Local daily counters; no prompts, paths or file contents are stored here. */
export class UsageStore {
	private pending: Promise<void> = Promise.resolve();
	constructor(private readonly file: string) { }
	async read(): Promise<{ since: string; days: Record<string, Usage> }> {
		try { const data = JSON.parse(await fs.readFile(this.file, 'utf8')); if (data && typeof data.since === 'string' && data.days && typeof data.days === 'object') { return data; } } catch { /* First run. */ }
		return { since: new Date().toISOString(), days: {} };
	}
	add(delta: Partial<Usage>) {
		const write = this.pending.catch(() => {}).then(async () => {
			const data = await this.read(); const day = new Date().toISOString().slice(0, 10); const value = { ...empty(), ...data.days[day] };
			for (const key of Object.keys(empty()) as (keyof Usage)[]) { const amount = delta[key]; if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) { value[key] += amount; } }
			data.days[day] = value;
			await fs.mkdir(path.dirname(this.file), { recursive: true }); const temporary = this.file + '.tmp'; await fs.writeFile(temporary, JSON.stringify(data)); await fs.rename(temporary, this.file);
		}); this.pending = write; return write;
	}
	async summary() {
		await this.pending.catch(() => {}); const data = await this.read(); const total = empty();
		for (const day of Object.values(data.days)) { for (const key of Object.keys(total) as (keyof Usage)[]) { total[key] += Number(day[key]) || 0; } }
		return { ...data, total, today: { ...empty(), ...data.days[new Date().toISOString().slice(0, 10)] } };
	}
}
