/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { randomUUID } from 'node:crypto';
export interface QueuedRequest { id: string; prompt: string; chatId: string; files: string[]; state: 'queued' | 'running' | 'done' | 'interrupted' | 'failed'; created: string; error?: string; mode?: import('./workflow').Mode }
export interface QueueState { paused: boolean; items: QueuedRequest[] }
/** Restore queue contents without resuming execution after a crash or editor restart. */
export function restoreQueue(saved: unknown): QueueState {
	const state: QueueState = { paused: true, items: [] };
	if (!saved || typeof saved !== 'object' || !Array.isArray((saved as QueueState).items)) { return state; }
	state.items = (saved as QueueState).items.filter(item => typeof item.id === 'string' && typeof item.prompt === 'string' && item.prompt.length <= 16000 && typeof item.chatId === 'string' && Array.isArray(item.files) && item.files.every(file => typeof file === 'string') && ['queued', 'running', 'done', 'interrupted', 'failed'].includes(item.state)).slice(0, 40).map(item => ({ ...item, files: item.files.slice(0, 20), state: item.state === 'running' ? 'interrupted' : item.state }));
	return state;
}
export function enqueueRequest(queue: QueueState, prompt: string, chatId: string, files: string[]): QueuedRequest {
	if (!prompt.trim() || prompt.length > 16000) { throw new Error('Queued requests must contain 1–16,000 characters.'); }
	if (queue.items.filter(item => item.state === 'queued' || item.state === 'running').length >= 20) { throw new Error('The queue already contains 20 pending requests.'); }
	const item: QueuedRequest = { id: randomUUID(), prompt: prompt.trim(), chatId, files: [...new Set(files)].slice(0, 20), state: 'queued', created: new Date().toISOString() };
	queue.items.push(item);
	while (queue.items.length > 40) { const index = queue.items.findIndex(entry => ['done', 'failed'].includes(entry.state)); if (index < 0) { break; } queue.items.splice(index, 1); }
	return item;
}
