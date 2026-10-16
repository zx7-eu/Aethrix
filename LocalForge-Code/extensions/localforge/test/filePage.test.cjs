const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filePage } = require('../out/filePage.js');

test('small complete files retain exact contents for safe edit snapshots', () => {
	assert.deepEqual(filePage('int main() {}\n'), { content: 'int main() {}\n', complete: true });
});
test('large files page forward and identify partial contents', () => {
	const text = Array.from({ length: 500 }, (_, i) => `line ${i + 1} ${'x'.repeat(70)}`).join('\n');
	const first = filePage(text);
	assert.equal(first.complete, false);
	assert.match(first.content, /Lines 1-\d+ of 500/);
	const next = first.content.match(/start_line=(\d+)/)[1];
	const second = filePage(text, next, '20');
	assert.match(second.content, new RegExp(`Lines ${next}-`));
	assert.ok(second.content.length < 18000);
	assert.throws(() => filePage(text, '../bad'), /Invalid line range/);
});
test('very long single lines are bounded without granting a complete-file snapshot', () => {
	const result = filePage('x'.repeat(100000));
	assert.equal(result.complete, false);
	assert.ok(result.content.length < 13000);
	assert.match(result.content, /truncated/);
});
