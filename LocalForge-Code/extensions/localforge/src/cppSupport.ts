/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const exists = async (file: string) => { try { await fs.access(file); return true; } catch { return false; } };
export const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;
export interface Toolchain { visualStudio?: string; compiler?: string; cmake?: string; ninja?: string; clangd?: string }

export async function detectToolchain(appRoot: string): Promise<Toolchain> {
	const tools: Toolchain = {};
	const clangd = path.join(appRoot, 'tools', 'clangd', 'bin', 'clangd.exe');
	if (await exists(clangd)) { tools.clangd = clangd; }
	try {
		const where = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
		const { stdout } = await execute(where, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { windowsHide: true, timeout: 10000 });
		const root = stdout.trim();
		if (root) {
			tools.visualStudio = root;
			const versions = (await fs.readdir(path.join(root, 'VC/Tools/MSVC'))).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
			const compiler = path.join(root, 'VC/Tools/MSVC', versions[0], 'bin/Hostx64/x64/cl.exe');
			if (await exists(compiler)) { tools.compiler = compiler; }
			const cmake = path.join(root, 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe');
			if (await exists(cmake)) { tools.cmake = cmake; }
			const ninja = path.join(root, 'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe');
			if (await exists(ninja)) { tools.ninja = ninja; }
		}
	} catch { /* The setup view also supports PCs without Visual Studio. */ }
	if (!tools.cmake) { try { tools.cmake = (await execute('where.exe', ['cmake.exe'], { windowsHide: true, timeout: 5000 })).stdout.trim().split(/\r?\n/)[0]; } catch { } }
	return tools;
}

export function developerEnvironment(tools: Toolchain): string {
	if (!tools.visualStudio) { return ''; }
	const command = `call "${path.join(tools.visualStudio, 'Common7/Tools/VsDevCmd.bat')}" -arch=x64 -host_arch=x64 >nul && set`;
	return `$aethrixEnvironment = & cmd.exe /d /s /c ${psQuote(command)}; if ($LASTEXITCODE -ne 0) { throw 'C++ developer environment failed' }; foreach ($aethrixEntry in $aethrixEnvironment) { if ($aethrixEntry -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }; `;
}

export function cmakeBuildCommand(tools: Toolchain): string {
	const cmake = psQuote(tools.cmake || 'cmake');
	const generator = tools.ninja ? ` -G Ninja -DCMAKE_MAKE_PROGRAM=${psQuote(tools.ninja)}` : '';
	return developerEnvironment(tools) + `& ${cmake} -S . -B .aethrix-build${generator} -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=ON; if ($LASTEXITCODE -eq 0) { & ${cmake} --build .aethrix-build --config Debug }`;
}

/** Configure only bundled tool paths; preserve custom compiler and debugger settings. */
export async function configureCppPaths(): Promise<Toolchain> {
	const tools = await detectToolchain(vscode.env.appRoot);
	for (const [section, key, detected, defaultValue] of [['clangd', 'path', tools.clangd, 'clangd'], ['cmake', 'cmakePath', tools.cmake, 'cmake']] as const) {
		const config = vscode.workspace.getConfiguration(section);
		const current = config.get<string>(key);
		if (detected && (!current || current === defaultValue || current.includes(`${path.sep}Aethrix${path.sep}App${path.sep}`))) { await config.update(key, detected, vscode.ConfigurationTarget.Global); }
	}
	return tools;
}

export async function chooseBuildCommand(root: string): Promise<string | undefined> {
	const tools = await detectToolchain(vscode.env.appRoot);
	const names = await fs.readdir(root);
	const options: { label: string; description: string; command?: string }[] = [];
	if (names.includes('CMakeLists.txt')) {
		const presets = path.join(root, 'CMakePresets.json');
		if (await exists(presets)) {
			options.push({ label: vscode.l10n.t('CMake Preset'), description: vscode.l10n.t('Use an existing configure preset'), command: '__preset' });
		}
		options.push({ label: vscode.l10n.t('CMake Debug Build'), description: 'CMakeLists.txt', command: cmakeBuildCommand(tools) });
	}
	for (const name of names.filter(name => /\.(sln|slnx|vcxproj|csproj)$/i.test(name)).slice(0, 12)) {
		const executable = tools.visualStudio ? path.join(tools.visualStudio, 'MSBuild/Current/Bin/MSBuild.exe') : 'MSBuild.exe';
		options.push({ label: vscode.l10n.t('Build {0}', name), description: 'MSBuild · Debug · x64', command: `& ${psQuote(executable)} ${psQuote(name)} /m /p:Configuration=Debug /p:Platform=x64` });
	}
	if (names.includes('package.json')) { options.push({ label: vscode.l10n.t('npm Build'), description: 'npm run build', command: 'npm.cmd run build' }); }
	options.push({ label: vscode.l10n.t('Custom Build Command'), description: vscode.l10n.t('Enter a PowerShell command'), command: '__custom' });
	const choice = await vscode.window.showQuickPick(options, { title: vscode.l10n.t('Build Project') });
	if (choice?.command === '__custom') { return vscode.window.showInputBox({ title: vscode.l10n.t('Build Command'), prompt: vscode.l10n.t('Runs in {0}', root), ignoreFocusOut: true }); }
	if (choice?.command === '__preset') {
		const config = JSON.parse(await fs.readFile(path.join(root, 'CMakePresets.json'), 'utf8'));
		const presets: string[] = (config.configurePresets || []).filter((preset: { hidden?: boolean }) => !preset.hidden).map((preset: { name: string }) => preset.name);
		const preset = await vscode.window.showQuickPick(presets, { title: vscode.l10n.t('Configure Preset') });
		if (preset) {
			const cmake = psQuote(tools.cmake || 'cmake');
			const buildPresets = (config.buildPresets || []).filter((item: { hidden?: boolean; configurePreset?: string }) => !item.hidden && item.configurePreset === preset);
			if (buildPresets.length) { return `& ${cmake} --preset ${psQuote(preset)}; if ($LASTEXITCODE -eq 0) { & ${cmake} --build --preset ${psQuote(buildPresets[0].name)} }`; }
			return `& ${cmake} --preset ${psQuote(preset)}`;
		}
	}
	return choice?.command;
}

export async function showCppSetup(): Promise<void> {
	const tools = await configureCppPaths();
	const lines = [
		`C++ compiler: ${tools.compiler || 'Not detected — install Visual Studio C++ Build Tools'}`,
		`IntelliSense: ${tools.clangd || 'Bundled clangd not found'}`,
		`CMake: ${tools.cmake || 'Not detected — install CMake'}`,
		`CMake Tools: ${vscode.extensions.getExtension('ms-vscode.cmake-tools') ? 'Installed' : 'Missing'}`,
		`C++ debugging: ${vscode.extensions.getExtension('vadimcn.vscode-lldb') ? 'CodeLLDB installed' : 'Missing'}`,
		'', 'For accurate IntelliSense, configure your CMake project and point clangd at compile_commands.json. MSBuild projects may need a .clangd file describing their include paths.',
		'User-mode C++ debugging is included. Windows kernel debugging requires a separate WinDbg/WDK setup.'
	];
	const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: lines.join('\n\n') });
	await vscode.window.showTextDocument(document, { preview: true });
	if (vscode.workspace.isTrusted && vscode.workspace.workspaceFolders?.length) {
		const args = vscode.workspace.getConfiguration('clangd').get<string[]>('arguments', []);
		if (!args.some(value => value.startsWith('--compile-commands-dir'))) {
			const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
			if (await exists(path.join(root, '.aethrix-build/compile_commands.json'))) { await vscode.workspace.getConfiguration('clangd').update('arguments', [...args, '--compile-commands-dir=.aethrix-build'], vscode.ConfigurationTarget.Workspace); }
		}
	}
}
