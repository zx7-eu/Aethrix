Unicode true
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!ifndef APPDIR
!define APPDIR "..\VSCode-win32-x64"
!endif
!ifndef OUTFILE
!define OUTFILE "..\Aethrix-Standalone.exe"
!endif

Name "Aethrix"
OutFile "${OUTFILE}"
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID zlib
CRCCheck force
Icon "..\LocalForge-Code\resources\win32\code.ico"
VIProductVersion "1.143.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "Aethrix"
VIAddVersionKey /LANG=1033 "FileDescription" "Aethrix Portable IDE"
VIAddVersionKey /LANG=1033 "FileVersion" "1.143.0"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Code - OSS contributors. MIT license included."

Var UserData
Var Arguments
Var ExitCode
Var AppDir
Var CachedBuild

Function .onInit
    ReadEnvStr $UserData "LOCALFORGE_DATA_DIR"
    ${If} $UserData == ""
        StrCpy $UserData "$APPDATA\Aethrix"
    ${EndIf}
    ReadEnvStr $AppDir "LOCALFORGE_APP_DIR"
    ${If} $AppDir == ""
        StrCpy $AppDir "$LOCALAPPDATA\Aethrix\App"
    ${EndIf}
FunctionEnd

Section
    StrCpy $CachedBuild ""
    FileOpen $0 "$AppDir\build-id.txt" r
    FileRead $0 $CachedBuild
    FileClose $0
    ${If} $CachedBuild != "1.143.0-aethrix-public-0.7.0-20261016"
    Banner::show /NOUNLOAD "Preparing Aethrix. This can take a moment."
    SetOutPath "$AppDir"
    File /r /x "*.map" /x "*.pdb" "${APPDIR}\*"
    Banner::destroy
    FileOpen $0 "$AppDir\build-id.txt" w
    FileWrite $0 "1.143.0-aethrix-public-0.7.0-20261016"
    FileClose $0
    ${EndIf}

    ; Use the production default profile so taskbar launches retain settings.
    SetOverwrite off
    SetOutPath "$UserData\User"
    File /oname=settings.json "seed-settings.json"
    SetOverwrite on

    System::Call 'kernel32::SetEnvironmentVariable(t "VSCODE_DEV", p 0)'
    System::Call 'kernel32::SetEnvironmentVariable(t "VSCODE_SKIP_PRELAUNCH", p 0)'
    System::Call 'kernel32::SetEnvironmentVariable(t "NODE_ENV", t "production")'
    ${GetParameters} $Arguments
    SetOutPath "$AppDir"
    ClearErrors
    ExecWait '"$AppDir\Aethrix.exe" --user-data-dir "$UserData" --extensions-dir "$UserData\Extensions" $Arguments' $ExitCode
    ${If} ${Errors}
        MessageBox MB_OK|MB_ICONSTOP "Aethrix could not start. Try opening the portable app again."
        SetErrorLevel 1
    ${Else}
        SetErrorLevel $ExitCode
    ${EndIf}
SectionEnd






