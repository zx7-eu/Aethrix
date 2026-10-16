const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InspectionBudget } = require('../out/inspectionBudget.js');
const read = (path, start_line, max_lines) => ({ function: { name: 'read_file', arguments: { path, start_line, max_lines } } });
test('repository overview stops repeated equivalent reads and limits each file to two pages', () => {
	const budget = new InspectionBudget('explain this repo');
	assert.equal(budget.check(read('src/main.cpp')), undefined);
	assert.match(budget.check(read('./SRC\\main.cpp', '1', '160')), /Summarize/);
	assert.equal(budget.check(read('src/main.cpp', '161')), undefined);
	assert.match(budget.check(read('src/main.cpp', '321')), /Do not keep paging/);
	assert.equal(budget.check(read('README.md')), undefined);
});
test('targeted edits and file analysis retain unrestricted paging', () => {
	for (const prompt of ['fix this repo', 'explain this repository and implement a fix', 'explain this function']) {
		const budget = new InspectionBudget(prompt);
		for (let index = 0; index < 8; index++) { assert.equal(budget.check(read('main.cpp')), undefined); }
	}
});
