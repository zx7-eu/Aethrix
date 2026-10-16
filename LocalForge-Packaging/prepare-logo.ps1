$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives -TypeDefinition @'
using System.Drawing;
public static class LogoBounds {
 public static Rectangle Find(Bitmap b) {
  int l=b.Width,t=b.Height,r=0,d=0;
  for(int y=0;y<b.Height;y++) for(int x=0;x<b.Width;x++) { var c=b.GetPixel(x,y); if(c.A>10 && c.R>80 && c.G>80 && c.B>80) { l=System.Math.Min(l,x);t=System.Math.Min(t,y);r=System.Math.Max(r,x);d=System.Math.Max(d,y); } }
  return Rectangle.FromLTRB(l,t,r+1,d+1);
 }
}
'@
$logo = [System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot 'assets\Logo.png'))
$bounds = [LogoBounds]::Find($logo)
$cropped = $logo.Clone($bounds,$logo.PixelFormat)
$cropped.MakeTransparent([System.Drawing.Color]::Black)
$writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create((Join-Path $PSScriptRoot 'assets\Aethrix.ico')))
$sizes = @(16,24,32,48,64,128,256)
$frames = @()
foreach ($size in $sizes) {
 $bitmap = [System.Drawing.Bitmap]::new($size,$size)
 $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
 $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 $scale = [Math]::Min(($size)/$cropped.Width,($size)/$cropped.Height)
 $width=[int]($cropped.Width*$scale); $height=[int]($cropped.Height*$scale)
 $graphics.DrawImage($cropped,[int](($size-$width)/2),[int](($size-$height)/2),$width,$height)
 $memory=[System.IO.MemoryStream]::new(); $bitmap.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png)
 $frames += ,($memory.ToArray())
 if ($size -eq 256) { $bitmap.Save((Join-Path $PSScriptRoot 'assets\Aethrix.png'),[System.Drawing.Imaging.ImageFormat]::Png) }
 $memory.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count)
$offset=6+16*$sizes.Count
for($i=0;$i -lt $sizes.Count;$i++) { $dimension=$sizes[$i]%256; $writer.Write([byte]$dimension);$writer.Write([byte]$dimension);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$frames[$i].Length);$writer.Write([uint32]$offset);$offset+=$frames[$i].Length }
foreach($frame in $frames) { $writer.Write([byte[]]$frame) }
$writer.Dispose();$cropped.Dispose();$logo.Dispose()
$encodedLogo=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'assets\Aethrix.png')))
$svgLogo='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,'+$encodedLogo+'"/></svg>'
$root = Split-Path $PSScriptRoot
$svgTargets=@('LocalForge-Code\src\vs\workbench\browser\media\code-icon.svg','VSCode-win32-x64\resources\app\out\media\code-icon.svg','VSCode-win32-x64\resources\app\out\vs\workbench\browser\media\code-icon.svg','LocalForge-Code\extensions\localforge\media\icon.svg','VSCode-win32-x64\resources\app\extensions\localforge\media\icon.svg')
foreach($svgTarget in $svgTargets) { Set-Content (Join-Path $root $svgTarget) $svgLogo -NoNewline }
Copy-Item (Join-Path $PSScriptRoot 'assets\Aethrix.ico') (Join-Path $root 'LocalForge-Code\resources\win32\code.ico') -Force
& (Join-Path $root 'LocalForge-Code\node_modules\rcedit\bin\rcedit.exe') (Join-Path $root 'VSCode-win32-x64\Aethrix.exe') --set-icon (Join-Path $PSScriptRoot 'assets\Aethrix.ico')
if ($LASTEXITCODE -ne 0) { throw 'Executable icon update failed' }
$bounds | Format-List
