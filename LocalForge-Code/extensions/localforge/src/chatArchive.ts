/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Message } from './ollama';
import type { Checkpoint } from './checkpoint';

export interface TranscriptEntry { role: 'user' | 'assistant' | 'tool' | 'info' | 'error'; text: string }
export interface ChatSession { id: string; title: string; workspace: string; createdAt: string; updatedAt: string; entries: TranscriptEntry[]; context: Message[]; checkpoint?: Checkpoint; mode?: import('./workflow').Mode; question?: { text: string; prompt: string; includeFile: boolean }; plan?: { path: string; model: string; provider?: import('./cloudProviders').Provider } }

/** Derives a stable, readable title without an additional model request. */
export function titleFromPrompt(prompt: string, fallback = 'New Conversation'): string {
	const title = prompt.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').replace(/^(?:please\s+|can you\s+|could you\s+|i want you to\s+)/i, '').trim();
	return title.length > 58 ? title.slice(0, 55).trimEnd() + '…' : title || fallback;
}

/** Stores each conversation atomically in its own local file. */
export class ChatArchive {
	private queue: Promise<void> = Promise.resolve();
	private readonly directory: string;
	constructor(storage: string, private readonly defaultTitle = 'New Conversation') { this.directory = path.join(storage, 'chats'); }
	create(workspace: string): ChatSession { const now = new Date().toISOString(); return { id: randomUUID(), title: this.defaultTitle, workspace, createdAt: now, updatedAt: now, entries: [], context: [] }; }
	async load(workspace?: string): Promise<ChatSession[]> {
		await fs.mkdir(this.directory, { recursive: true });
		const sessions: ChatSession[] = [];
		for (const file of await fs.readdir(this.directory)) {
			if (!/^[a-f0-9-]+\.json$/i.test(file)) { continue; }
			try {
				const session = JSON.parse(await fs.readFile(path.join(this.directory, file), 'utf8')) as ChatSession;
				if (session.id + '.json' !== file || (workspace !== undefined && session.workspace !== workspace) || typeof session.workspace !== 'string' || typeof session.title !== 'string' || !Array.isArray(session.entries) || !Array.isArray(session.context)) { continue; }
				if (!session.entries.every(entry => typeof entry.text === 'string' && ['user', 'assistant', 'tool', 'info', 'error'].includes(entry.role))) { continue; }
				sessions.push(session);
			} catch { /* Leave unreadable files intact so they can be recovered. */ }
		}
		return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
	async search(query: string, workspace?: string) {
		const needle = query.trim().toLocaleLowerCase();
		if (!needle || needle.length > 200) { return []; }
		return (await this.load(workspace)).filter(session => session.title.toLocaleLowerCase().includes(needle) || session.entries.some(entry => entry.text.toLocaleLowerCase().includes(needle))).slice(0, 50).map(session => {
			const text = session.entries.find(entry => entry.text.toLocaleLowerCase().includes(needle))?.text || session.entries[0]?.text || '';
			const index = Math.max(0, text.toLocaleLowerCase().indexOf(needle));
			return { id: session.id, title: session.title, workspace: session.workspace, updated: session.updatedAt, snippet: text.slice(Math.max(0, index - 40), index + needle.length + 100).replace(/\s+/g, ' ') };
		});
	}
	save(session: ChatSession): Promise<void> {
		if (!session.entries.length) { return Promise.resolve(); }
		if (!/^[a-f0-9-]+$/i.test(session.id)) { return Promise.reject(new Error('Invalid conversation ID.')); }
		const snapshot = JSON.stringify(session);
		const destination = path.join(this.directory, session.id + '.json');
		const write = this.queue.catch(() => { }).then(async () => {
			await fs.mkdir(this.directory, { recursive: true });
			const temporary = destination + '.' + randomUUID() + '.tmp';
			await fs.writeFile(temporary, snapshot, 'utf8');
			await fs.rename(temporary, destination);
		});
		this.queue = write;
		return write;
	}
}
