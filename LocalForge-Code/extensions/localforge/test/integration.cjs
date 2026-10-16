/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
exports.run = async () => {
	const extension = vscode.extensions.getExtension('localforge.localforge');
	assert.ok(extension, 'LocalForge is included in the source build');
	await extension.activate();
	const commands = await vscode.commands.getCommands(true);
	assert.ok(commands.includes('localforge.open'));
	assert.equal(vscode.workspace.getConfiguration('localforge').get('model'), 'qwen3-coder:30b');
	await vscode.commands.executeCommand('localforge.open');
	const document = await vscode.workspace.openTextDocument({ language: 'cpp', content: '#include <iostream>\nint main() { return 0; }\n' });
	await vscode.window.showTextDocument(document);
	assert.equal(document.languageId, 'cpp');
	const terminal = vscode.window.createTerminal({ name: 'LocalForge Integration Check' });
	terminal.show(true);
	terminal.sendText("Write-Output 'LocalForge terminal ready'");
	assert.ok(vscode.window.terminals.includes(terminal));
	terminal.dispose();
	await fs.writeFile(path.join(__dirname, 'integration-result.json'), JSON.stringify({ passed: true, extension: extension.id, commands: ['localforge.open'], editorLanguage: document.languageId }));
};
