/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Applies one unique exact-text replacement, retaining the document's line endings. */
export function exactPatch(original: string, before: string, after: string) {
	if (typeof before !== 'string' || !before.length || typeof after !== 'string') { throw new Error('Provide nonempty old_text and a replacement new_text.'); }
	const newline = original.includes('\r\n') ? '\r\n' : '\n';
	const oldText = before.replace(/\r?\n/g, newline);
	const newText = after.replace(/\r?\n/g, newline);
	const start = original.indexOf(oldText);
	if (start < 0) { throw new Error('Exact text not found. Read the current file and include its exact whitespace.'); }
	if (original.indexOf(oldText, start + 1) >= 0) { throw new Error('The text matches multiple locations. Include more surrounding lines to make the patch unique.'); }
	return { start, end: start + oldText.length, text: original.slice(0, start) + newText + original.slice(start + oldText.length), replacement: newText };
}
