/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type Mode = 'normal' | 'plan' | 'debug' | 'multi' | 'ask';
export interface Workflow { mode: Mode; evidence: string[]; hypothesis?: string; log?: string; workers: number; edits?: number; verification?: boolean }
export const modes: Mode[] = ['normal', 'plan', 'debug', 'multi', 'ask'];
export const readTools = ['read_file', 'list_files', 'search_code'];
export function modeOf(value: unknown): Mode { return modes.includes(value as Mode) ? value as Mode : 'normal'; }
/** Enforce the mode independently of the model's instructions or tool schema. */
export function allowTool(workflow: Workflow, name: string, worker = false): boolean {
	if (worker) { return readTools.includes(name); }
	if (workflow.mode === 'ask') { return readTools.includes(name) || name === 'ask_questions'; }
	if (workflow.mode === 'plan') { return [...readTools, 'ask_questions', 'save_plan'].includes(name); }
	if (name === 'save_plan') { return false; }
	if (['collect_debug_evidence', 'record_hypothesis'].includes(name)) { return workflow.mode === 'debug'; }
	if (workflow.mode === 'debug' && name === 'run_command') { return false; }
	if (workflow.mode === 'debug' && ['write_file', 'edit_file'].includes(name)) { return workflow.evidence.length > 0 && !!workflow.hypothesis; }
	return true;
}
export function modeInstruction(mode: Mode): string {
	return {
		normal: 'Implement the request and verify results. You may delegate bounded read-only research to subagents.',
		plan: 'PLAN MODE. Inspect read-only, ask_questions if needed, then save_plan with a detailed Markdown implementation plan: objective, files, steps, tradeoffs, tests, acceptance criteria. Do not implement or run commands. Only an explicit user Build action starts implementation.',
		ask: 'ASK MODE. Clarify requirements with ask_questions and explain using read-only inspection. Never edit files or run commands. Suggest switching to Normal or Plan when ready to implement.',
		debug: 'DEBUG MODE. First inspect and reproduce. Use collect_debug_evidence to record actual diagnostics or command output, then record_hypothesis referencing evidence IDs before editing. Do not invent evidence. After fixing, collect verification output and report whether the original failure was reproduced and resolved. Every tool result is logged locally.',
		multi: 'MULTI-TASK MODE. Break the request into bounded areas and call delegate_task for independent read-only research with separate context. Workers run sequentially on the local GPU. Synthesize their verified reports, implement coordinated changes yourself, then verify. Never claim concurrent execution.'
	}[mode];
}
/** Plan filenames stay within an app-managed folder; metadata is kept outside editable Markdown. */
export function planRelative(id: string): string {
	if (!/^[a-f0-9-]+$/i.test(id)) { throw new Error('Invalid plan identifier.'); }
	return `.aethrix/plans/${id}/plan.md`;
}
