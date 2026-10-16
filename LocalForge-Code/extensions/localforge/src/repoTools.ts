/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { spawn } from 'node:child_process';

/** Uses the editor's ripgrep binary without executing a shell or repository code. */
export async function searchRepository(binary: string, root: string, query: string, glob: string | undefined, signal: AbortSignal): Promise<string> {
	if (!query.trim() || query.length > 500) { throw new Error('Enter a search query of 1–500 characters.'); }
	if (glob && (glob.length > 200 || glob.includes('..') || path.isAbsolute(glob))) { throw new Error('Use a project-relative filename pattern.'); }
	return new Promise((resolve, reject) => {
		const args = ['--json', '--fixed-strings', '--ignore-case', '--max-filesize', '1M', '--max-count', '20'];
		if (glob) { args.push('--glob', glob); }
		args.push('--glob', '!**/{node_modules,.git,bin,obj,out,.build,.localforge,.aethrix-build}/**');
		args.push('--', query, '.');
		const child = spawn(binary, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let buffer = ''; let error = ''; let count = 0; let limited = false;
		const matches: string[] = [];
		const consume = (line: string) => {
			if (!line || limited) { return; }
			const entry = JSON.parse(line);
			if (entry.type === 'match' && typeof entry.data.path?.text === 'string') {
				matches.push(`${entry.data.path.text}:${entry.data.line_number}: ${String(entry.data.lines.text).trim().slice(0, 240)}`);
				if (++count >= 80) { limited = true; child.kill(); }
			}
		};
		const stop = () => child.kill();
		const timer = setTimeout(stop, 15000);
		signal.addEventListener('abort', stop, { once: true });
		if (signal.aborted) { stop(); }
		child.stdout.on('data', data => {
			buffer += data.toString();
			let newline: number;
			try { while ((newline = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); } }
			catch (cause) { stop(); reject(cause); }
		});
		child.stderr.on('data', data => { error = (error + data.toString()).slice(-2000); });
		const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
		child.on('error', cause => { cleanup(); reject(cause); });
		child.on('close', code => {
			cleanup();
			if (signal.aborted) { reject(new Error('Search canceled.')); }
			else if (code !== 0 && code !== 1 && !limited) { reject(new Error(error || 'Search timed out. Narrow the filename pattern.')); }
			else { resolve((matches.join('\n') || 'No matches found.') + (limited ? '\nResults limited to 80 matches. Narrow your query or filename pattern.' : '')); }
		});
	});
}

export interface BuildIssue { file: string; line: number; column: number; severity: 'error' | 'warning'; message: string }
/** Recognizes MSVC/MSBuild and GCC/Clang diagnostics without trusting paths outside the project. */
export function parseBuildIssues(output: string, root: string): BuildIssue[] {
	const issues: BuildIssue[] = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^(.*?)\((\d+)(?:,(\d+))?\)\s*:\s*(?:fatal\s+)?(error|warning)\s*(.*)/i.exec(line.trim()) || /^(.*?):(\d+)(?::(\d+))?:\s*(?:fatal\s+)?(error|warning):?\s*(.*)/i.exec(line.trim());
		if (!match) { continue; }
		const file = path.resolve(root, match[1].replace(/^\d+>/, ''));
		const relative = path.relative(root, file);
		if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { continue; }
		issues.push({ file, line: Math.max(0, Number(match[2]) - 1), column: Math.max(0, Number(match[3] || 1) - 1), severity: match[4].toLowerCase() as 'error' | 'warning', message: match[5] });
	}
	return issues.slice(0, 200);
}
