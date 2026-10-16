/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { Toolchain } from './cppSupport';
const exists = async (file: string) => { try { await fs.access(file); return true; } catch { return false; } };
export interface DriverKit { root: string; version?: string; versions: string[]; windbg?: string; kd?: string; cdb?: string; headers: boolean; libraries: boolean; msbuildToolset: boolean }
export async function detectDriverKit(tools: Toolchain, kitRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits/10')): Promise<DriverKit> {
	const versions = (await fs.readdir(path.join(kitRoot, 'Include')).catch(() => [])).filter(version => /^10\.0\.\d+\.\d+$/.test(version)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
	const installed: string[] = [];
	for (const version of versions) { if (await exists(path.join(kitRoot, 'Include', version, 'km/wdm.h'))) { installed.push(version); } }
	let version = installed[0];
	for (const candidate of installed) { if (await exists(path.join(kitRoot, 'Include', candidate, 'shared/ntdef.h')) && await exists(path.join(kitRoot, 'Lib', candidate, 'km/x64/ntoskrnl.lib'))) { version = candidate; break; } }
	const result: DriverKit = { root: kitRoot, version, versions: installed, headers: !!version, libraries: !!version && await exists(path.join(kitRoot, 'Lib', version, 'km/x64/ntoskrnl.lib')), msbuildToolset: false };
	for (const name of ['windbg', 'kd', 'cdb'] as const) { const executable = path.join(kitRoot, 'Debuggers/x64', name + '.exe'); if (await exists(executable)) { result[name] = executable; } }
	if (tools.visualStudio) {
		for (const version of ['v180', 'v170', 'v160']) {
			if (await exists(path.join(tools.visualStudio, `MSBuild/Microsoft/VC/${version}/Platforms/x64/PlatformToolsets/WindowsKernelModeDriver10.0/Toolset.props`))) { result.msbuildToolset = true; }
		}
	}
	return result;
}
export function microsoftSymbols(cache: string, local?: string): string { return (local ? local + ';' : '') + `srv*${cache}*https://msdl.microsoft.com/download/symbols`; }
export async function dumpKind(file: string): Promise<'kernel' | 'user'> {
	const handle = await fs.open(file, 'r');
	try {
		const header = Buffer.alloc(8); const { bytesRead } = await handle.read(header, 0, 8, 0);
		if (bytesRead < 8) { throw new Error('The dump file is too small.'); }
		if (header.subarray(0, 4).toString('ascii') === 'MDMP') { return 'user'; }
		if (header.subarray(0, 4).toString('ascii') === 'PAGE' && ['DUMP', 'DU64'].includes(header.subarray(4, 8).toString('ascii'))) { return 'kernel'; }
		throw new Error('Unrecognized dump header. Select a Windows .dmp or .mdmp file.');
	} finally { await handle.close(); }
}

/** Analyze only a selected dump; no live target attachment or boot configuration changes. */
export async function analyzeDump(binary: string, file: string, symbols: string, signal: AbortSignal, onOutput: (text: string) => void): Promise<string> {
	if (/\r|\n|\0|"/.test(symbols) || symbols.length > 4096) { throw new Error('Invalid symbol path.'); }
	await dumpKind(file);
	return new Promise((resolve, reject) => {
		const child = spawn(binary, ['-z', file, '-y', symbols, '-c', '!analyze -v; kv; lm; q'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let output = ''; let timedOut = false;
		const append = (data: Buffer) => { const text = data.toString(); output += text; if (output.length > 120000) { output = output.slice(0, 60000) + '\n[...middle of output omitted...]\n' + output.slice(-59000); } onOutput(text); };
		const stop = () => child.kill();
		const timer = setTimeout(() => { timedOut = true; stop(); }, 180000);
		signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) { stop(); }
		child.stdout.on('data', append); child.stderr.on('data', append);
		const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
		child.on('error', error => { cleanup(); reject(error); });
		child.on('close', code => { cleanup(); if (signal.aborted) { reject(new Error('Dump analysis canceled.')); } else if (timedOut) { reject(new Error('Symbol loading or dump analysis timed out. Open the dump in WinDbg to continue.')); } else if (code !== 0) { reject(new Error(`Debugger exited ${code}. ${output.slice(-1500)}`)); } else { resolve(output); } });
	});
}

/** A single-source WDM build using the installed compiler and WDK, without loading the driver. */
export function wdmBuildCommand(tools: Toolchain, kit: DriverKit, source: string, outputDirectory: string, quote: (value: string) => string): string {
	if (!tools.compiler || !kit.version || !kit.headers || !kit.libraries) { throw new Error('Install a C++ compiler and WDK headers/libraries first.'); }
	const compilerDirectory = path.dirname(tools.compiler);
	const include = path.resolve(compilerDirectory, '../../../include');
	const headers = ['km', 'shared', 'ucrt'].map(folder => `/I${quote(path.join(kit.root, 'Include', kit.version!, folder))}`).join(' ');
	const object = path.join(outputDirectory, 'driver.obj'); const driver = path.join(outputDirectory, path.basename(source).replace(/\.(c|cpp)$/i, '.sys'));
	return `$aethrixDriverOutput=${quote(outputDirectory)}; New-Item -ItemType Directory -Force -Path $aethrixDriverOutput | Out-Null; & ${quote(tools.compiler)} /nologo /c /kernel /W3 /Z7 /GS- /GR- /EHs-c- /D_AMD64_ /DAMD64 /D_WIN64 /I${quote(include)} ${headers} /Fo${quote(object)} ${quote(source)}; if ($LASTEXITCODE -eq 0) { & ${quote(path.join(compilerDirectory, 'link.exe'))} /nologo /DRIVER /SUBSYSTEM:NATIVE /ENTRY:DriverEntry /MACHINE:X64 /DEBUG /NODEFAULTLIB /OUT:${quote(driver)} /LIBPATH:${quote(path.join(kit.root, 'Lib', kit.version, 'km/x64'))} ${quote(object)} ntoskrnl.lib hal.lib }`;
}
