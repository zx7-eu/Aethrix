/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let endpoint = 'http://127.0.0.1:11434';
export const ollamaEndpoint = () => endpoint;
export function setOllamaEndpoint(input: string) {
	const url = new URL(input);
	if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') { throw new Error('Use a local Ollama address, such as http://127.0.0.1:11434.'); }
	endpoint = url.origin; return endpoint;
}
