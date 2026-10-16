/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export interface FileChange { path: string; before: string | null; afterHash: string }
export interface ChangeRequest { id: string; root: string; title: string; created: string; undone?: boolean; files: FileChange[] }
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

/** Durable per-request snapshots. Undo is refused if any file has subsequent edits. */
export class ChangeStore {
	constructor(private readonly directory: string) { }
	create(root: string, title: string): ChangeRequest { return { id: randomUUID(), root, title: title.slice(0, 80), created: new Date().toISOString(), files: [] }; }
	async save(request: ChangeRequest): Promise<void> {
		await fs.mkdir(this.directory, { recursive: true });
		const target = path.join(this.directory, request.id + '.json');
		const temporary = target + '.' + randomUUID() + '.tmp';
		await fs.writeFile(temporary, JSON.stringify(request)); await fs.rename(temporary, target);
	}
	async record(request: ChangeRequest, relative: string, before: string | null, after: string): Promise<void> {
		const existing = request.files.find(file => file.path === relative);
		if (existing) { existing.afterHash = digest(after); }
		else { request.files.push({ path: relative, before, afterHash: digest(after) }); }
		await this.save(request);
	}
	async list(root: string): Promise<ChangeRequest[]> {
		const result: ChangeRequest[] = [];
		for (const name of await fs.readdir(this.directory).catch(() => [])) {
			if (!/^[\w-]+\.json$/.test(name)) { continue; }
			try { const entry = JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8')) as ChangeRequest; if (entry.root === root && Array.isArray(entry.files) && entry.files.length && /^[\w-]+$/.test(entry.id)) { result.push(entry); } } catch { /* Preserve other readable requests. */ }
		}
		return result.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 30);
	}
	async validateUndo(request: ChangeRequest, resolve: (relative: string) => Promise<string>, dirty: (file: string) => boolean): Promise<void> {
		if (request.undone) { throw new Error('This request has already been undone.'); }
		for (const entry of request.files) {
			const file = await resolve(entry.path);
			if (dirty(file) || digest(await fs.readFile(file, 'utf8')) !== entry.afterHash) { throw new Error(`Cannot undo ${entry.path}: it has changes made after this request. Save or review them first.`); }
		}
	}
}
