/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
exports.run = async () => {
	const extension = vscode.extensions.getExtension('localforge.localforge'); await extension.activate();
	assert.equal(extension.packageJSON.version, '0.8.0');
	const commands = await vscode.commands.getCommands(true); assert.ok(commands.includes('localforge.settings'));
	await vscode.commands.executeCommand('localforge.settings');
	await vscode.workspace.getConfiguration('localforge').update('chatFontSize', 16, vscode.ConfigurationTarget.Global);
	assert.equal(vscode.workspace.getConfiguration('localforge').get('chatFontSize'), 16);
	const git = await vscode.extensions.getExtension('vscode.git').activate(); const api = git.getAPI(1);
	const root = vscode.workspace.workspaceFolders[0].uri; const repository = await api.openRepository(root); assert.ok(repository, 'Native Git finds the workspace');
	await repository.status(); assert.ok(repository.state.workingTreeChanges.some(change => change.uri.fsPath.endsWith('sample.cpp')));
	await repository.add([path.join(root.fsPath, 'sample.cpp')]); await repository.status(); assert.equal(repository.state.indexChanges.length, 1);
	await repository.commit('Verify native source control'); await repository.status(); assert.equal(repository.state.indexChanges.length, 0); assert.equal(repository.state.workingTreeChanges.length, 0);
	await vscode.commands.executeCommand('workbench.view.scm');
	await fs.writeFile(process.env.AETHRIX_SETTINGS_TEST_RESULT, JSON.stringify({ passed: true, settingsCommand: true, preferencePersistence: true, nativeGit: true, gitVersion: api.git.version, commit: repository.state.HEAD.commit }));
};
