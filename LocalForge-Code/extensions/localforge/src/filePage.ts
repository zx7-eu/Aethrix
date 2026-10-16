/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Bounds repository context without requiring the user to select large files manually. */
export function filePage(text: string, start?: string, count?: string) {
	if (start === undefined && count === undefined && text.length <= 18000) { return { content: text, complete: true }; }
	const lines = text.split(/\r?\n/);
	const first = start === undefined ? 1 : Number(start);
	const limit = count === undefined ? 160 : Number(count);
	if (!Number.isInteger(first) || first < 1 || first > lines.length || !Number.isInteger(limit) || limit < 1 || limit > 300) { throw new Error(`Invalid line range. File has ${lines.length} lines; use start_line >= 1 and max_lines from 1 to 300.`); }
	const selected: string[] = [];
	let size = 0;
	let end = first - 1;
	for (let index = first - 1; index < Math.min(lines.length, first - 1 + limit); index++) {
		if (selected.length && size + lines[index].length > 12000) { break; }
		const line = lines[index].slice(0, 12000);
		selected.push(`${index + 1}: ${line}${line.length < lines[index].length ? ' [long line truncated]' : ''}`);
		size += line.length; end = index + 1;
	}
	const next = end < lines.length ? ` Continue with start_line=${end + 1}.` : '';
	return { content: `Lines ${first}-${end} of ${lines.length}. Partial view; do not replace this file from this excerpt.${next}\n${selected.join('\n')}`, complete: false };
}
