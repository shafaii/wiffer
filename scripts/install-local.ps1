param([string]$Source = $(if (Test-Path (Join-Path $PSScriptRoot 'Wiffer.exe')) { $PSScriptRoot } else { Join-Path $PSScriptRoot '../artifacts/wiffer-win-x64' }))
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
if (!(Test-Path -LiteralPath (Join-Path $sourcePath 'Wiffer.exe'))) { throw 'Build or extract the Wiffer release first.' }
$destination = Join-Path $env:LOCALAPPDATA 'Programs/Wiffer'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item -Path (Join-Path $sourcePath '*') -Destination $destination -Recurse -Force
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $destination 'Wiffer.lnk'))
$shortcut.TargetPath = Join-Path $destination 'Wiffer.exe'
$shortcut.WorkingDirectory = $destination
$shortcut.IconLocation = (Join-Path $destination 'Wiffer.exe') + ',0'
$shortcut.Description = 'Wiffer — Sniff out your network problems.'
$shortcut.Save()
Write-Output "Installed: $destination"
Write-Output 'To copy the shortcut to your actual Windows desktop:'
Write-Output 'Copy-Item "$env:LOCALAPPDATA\Programs\Wiffer\Wiffer.lnk" ([Environment]::GetFolderPath("Desktop")) -Force'
