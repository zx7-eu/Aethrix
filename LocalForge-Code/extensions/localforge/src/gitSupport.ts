/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execFile } from 'node:child_process';
import * as path from 'node:path';
export function gitRun(binary: string, root: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => execFile(binary, ['-c', 'core.fsmonitor=false', ...args], { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)));
}
export async function findGit(configured?: string): Promise<string | undefined> {
	const candidates = [configured, 'git', path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/cmd/git.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs/Git/cmd/git.exe')].filter((value): value is string => !!value);
	for (const binary of candidates) { try { await gitRun(binary, process.cwd(), ['--version']); return binary; } catch { /* Try the next installed Git. */ } }
	return undefined;
}
export function parseGitStatus(text: string) {
	const records = text.split('\0'); const files: { path: string; index: string; worktree: string }[] = [];
	for (let index = 0; index < records.length; index++) {
		const record = records[index]; if (record.length < 4) { continue; }
		files.push({ path: record.slice(3), index: record[0], worktree: record[1] });
		if (/[RC]/.test(record.slice(0, 2))) { index++; }
	}
	return files;
}
export async function gitStatus(binary: string, root: string) {
	const repository = (await gitRun(binary, root, ['rev-parse', '--show-toplevel'])).trim();
	const branch = await gitRun(binary, root, ['branch', '--show-current']);
	const changes = await gitRun(binary, root, ['status', '--porcelain=v1', '-z']);
	return { root: repository, branch: branch.trim() || 'Detached HEAD', files: parseGitStatus(changes) };
}
/** Stage only a selected working-tree path, never a shell expression. */
export async function stagePath(binary: string, root: string, relative: string) {
	if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || relative.includes('\0')) { throw new Error('Choose a file inside the repository.'); }
	await gitRun(binary, root, ['add', '--', relative]);
}
