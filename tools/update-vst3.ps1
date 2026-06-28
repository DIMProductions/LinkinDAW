param(
  [string]$Configuration = "Release",
  [switch]$InstallToProgramFiles
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cmake = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
$buildDir = Join-Path $repoRoot "build-webrtc5"
$target = "LinkinDAW-vst3"

if (!(Test-Path -LiteralPath $cmake)) {
  throw "CMake not found: $cmake"
}

& $cmake --build $buildDir --config $Configuration --target $target

$buildBinary = Join-Path $repoRoot "build-webrtc5\out\LinkinDAW.vst3\Contents\x86_64-win\LinkinDAW.vst3"
if (!(Test-Path -LiteralPath $buildBinary)) {
  throw "Built VST3 binary not found: $buildBinary"
}

$items = @($buildBinary)

if ($InstallToProgramFiles) {
  $programFilesVst3Root = Join-Path $env:ProgramFiles "Common Files\VST3"
  $programFilesSingleFile = Join-Path $programFilesVst3Root "LinkinDAW.vst3"

  New-Item -ItemType Directory -Force -Path $programFilesVst3Root | Out-Null
  Copy-Item -LiteralPath $buildBinary -Destination $programFilesSingleFile -Force
  $items += $programFilesSingleFile
} else {
  Write-Host "Built repository VST3 only. Program Files was not modified."
  Write-Host "To install manually, copy from: $buildBinary"
  Write-Host "To install with this script, rerun with -InstallToProgramFiles."
}

Get-Item -LiteralPath $items |
  Select-Object FullName, Length, @{Name = "LastWriteTime"; Expression = { $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss") } } |
  Format-Table -AutoSize
