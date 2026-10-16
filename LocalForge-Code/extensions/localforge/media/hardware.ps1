$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class AethrixGpu {
 public string name; public ulong memory;
 [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid id, out IntPtr factory);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumAdapter(IntPtr self, uint index, out IntPtr adapter);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetDescription(IntPtr self, out Description description);
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Description {
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Name;
  public uint Vendor, Device, Subsystem, Revision;
  public UIntPtr DedicatedVideo, DedicatedSystem, SharedSystem;
  public uint LuidLow; public int LuidHigh; public uint Flags;
 }
 public static AethrixGpu[] Scan() {
  var result = new List<AethrixGpu>(); IntPtr factory;
  var id = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
  Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref id, out factory));
  try {
   var enumerate = (EnumAdapter)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(factory), 12*IntPtr.Size), typeof(EnumAdapter));
   for (uint index=0; index<16; index++) {
    IntPtr adapter; if (enumerate(factory,index,out adapter)!=0) break;
    try {
     var describe = (GetDescription)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(adapter),10*IntPtr.Size),typeof(GetDescription));
     Description description; Marshal.ThrowExceptionForHR(describe(adapter,out description));
     if ((description.Flags & 2)==0) result.Add(new AethrixGpu {name=description.Name, memory=description.DedicatedVideo.ToUInt64()});
    } finally { Marshal.Release(adapter); }
   }
  } finally { Marshal.Release(factory); }
  return result.ToArray();
 }
}
'@
$gpus = @([AethrixGpu]::Scan())
$modelPath = $env:OLLAMA_MODELS
if (!$modelPath) { $modelPath = [Environment]::GetEnvironmentVariable('OLLAMA_MODELS', 'User') }
if (!$modelPath) { $modelPath = Join-Path $env:USERPROFILE '.ollama\models' }
$modelPath = [Environment]::ExpandEnvironmentVariables($modelPath)
$existing = $modelPath
while (!(Test-Path -LiteralPath $existing)) {
 $parent = Split-Path -Parent $existing
 if (!$parent -or $parent -eq $existing) { break }
 $existing = $parent
}
$volume = Get-Volume -FilePath $existing -ErrorAction SilentlyContinue | Select-Object -First 1
[pscustomobject]@{ gpus=$gpus; modelPath=$modelPath; diskFree=if ($volume) { [double]$volume.SizeRemaining } else { $null } } | ConvertTo-Json -Depth 4 -Compress
