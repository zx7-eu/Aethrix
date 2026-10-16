$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$workspace = Split-Path $PSScriptRoot
$downloads = Join-Path $PSScriptRoot 'cpp-downloads'
New-Item -ItemType Directory -Force $downloads | Out-Null
foreach ($package in (Get-Content (Join-Path $PSScriptRoot 'cpp-packages.json') -Raw | ConvertFrom-Json)) {
	$archive = Join-Path $downloads $package.asset
	if (!(Test-Path $archive)) { Invoke-WebRequest $package.url -OutFile $archive }
	if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $package.sha256) { throw "Checksum mismatch: $($package.asset)" }
	$extract = Join-Path $downloads $package.folder
	if (!(Test-Path $extract)) { [IO.Compression.ZipFile]::ExtractToDirectory($archive, $extract) }
	if ($package.kind -eq 'extension') {
		$source = Join-Path $extract 'extension'
		$destination = Join-Path $workspace ('VSCode-win32-x64/resources/app/extensions/' + $package.folder)
	} else {
		$binary = Get-ChildItem $extract -Filter clangd.exe -Recurse | Select-Object -First 1
		if (!$binary) { throw 'clangd executable missing from archive' }
		$source = Split-Path (Split-Path $binary.FullName)
		$destination = Join-Path $workspace 'VSCode-win32-x64/resources/app/tools/clangd'
	}
	New-Item -ItemType Directory -Force $destination | Out-Null
	Copy-Item (Join-Path $source '*') $destination -Recurse -Force
}
