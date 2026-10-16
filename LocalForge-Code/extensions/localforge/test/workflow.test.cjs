/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowTool, modeOf, planRelative } = require('../out/workflow');
test('mode policy blocks implementation and commands in Plan and Ask regardless of approval settings', () => {
	for (const mode of ['plan', 'ask']) {
		const flow = { mode, evidence: [], workers: 0 };
		for (const tool of ['write_file', 'edit_file', 'run_command', 'build_project', 'delegate_task']) { assert.equal(allowTool(flow, tool), false, mode + ': ' + tool); }
		assert.equal(allowTool(flow, 'read_file'), true);
		assert.equal(allowTool(flow, 'save_plan'), mode === 'plan');
	}
	assert.equal(modeOf('corrupt'), 'normal');
	assert.throws(() => planRelative('../escape'), /Invalid/);
});
test('Debug edits require both evidence and a hypothesis; workers remain read-only in every mode', () => {
	const flow = { mode: 'debug', evidence: [], workers: 0 };
	assert.equal(allowTool(flow, 'edit_file'), false);
	flow.evidence.push('E1'); assert.equal(allowTool(flow, 'edit_file'), false);
	flow.hypothesis = 'An actual hypothesis'; assert.equal(allowTool(flow, 'edit_file'), true);
	for (const mode of ['normal', 'plan', 'ask', 'debug', 'multi']) {
		flow.mode = mode;
		for (const name of ['write_file', 'run_command', 'delegate_task', 'save_plan']) { assert.equal(allowTool(flow, name, true), false); }
		assert.equal(allowTool(flow, 'read_file', true), true);
	}
});
