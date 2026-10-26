param([string]$Installer,[string]$Stage,[string]$Evidence,[string]$ExpectedVersion='0.1.8')
$ErrorActionPreference='Stop'
$dest=Join-Path $Stage 'installed'
Get-AuthenticodeSignature $Installer | Format-List Status,StatusMessage,SignerCertificate | Out-File "$Evidence/authenticode.txt"
# Normal NSIS silent installer; no SmartScreen/policy exclusions or execution bypass.
$p=Start-Process -FilePath $Installer -ArgumentList @('/S',"/D=$dest") -PassThru
if (-not $p.WaitForExit(120000)) { throw 'Normal installer timed out (possible OS/runtime prompt); no prompt bypass attempted' }
"InstallerExit=$($p.ExitCode)" | Out-File "$Evidence/install.txt"
if ($p.ExitCode -ne 0) { throw "Installer denied/failed: $($p.ExitCode)" }
$exe=Get-ChildItem $dest -Recurse -Filter '*.exe' | Where-Object { $_.Name -notmatch 'uninstall|unins|webview' } | Select-Object -First 1
if (!$exe) { throw 'Installed candidate exe not found' }
$exe.VersionInfo | Format-List FileVersion,ProductVersion,ProductName | Out-File "$Evidence/version.txt"
if ($exe.VersionInfo.ProductVersion -ne $ExpectedVersion) { throw 'Installed version mismatch' }
Get-FileHash $exe.FullName -Algorithm SHA256 | Format-List | Out-File "$Evidence/installed-sha256.txt"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try {
  foreach($attempt in @(1,2)) {
    $app=Start-Process -FilePath $exe.FullName -PassThru
    Start-Sleep 12
    $app.Refresh()
    if($app.HasExited -or $app.MainWindowHandle -eq 0) { throw 'Candidate did not expose a native top-level window' }
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($app.MainWindowHandle)
    $nodes=$root.FindAll([System.Windows.Automation.TreeScope]::Subtree,[System.Windows.Automation.Condition]::TrueCondition)
    $texts=@(); foreach($n in $nodes) { $texts += $n.Current.Name }
    $texts | Out-File "$Evidence/window-$attempt.txt"
    "attempt=$attempt pid=$($app.Id) hwnd=$($app.MainWindowHandle) title=$($app.MainWindowTitle)" | Add-Content "$Evidence/restarts.txt"
    $screen=[System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap=New-Object System.Drawing.Bitmap $screen.Width,$screen.Height
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Left,$screen.Top,0,0,$bitmap.Size)
    $bitmap.Save("$Evidence/screen-$attempt.png")
    $graphics.Dispose(); $bitmap.Dispose()
    if (!$app.CloseMainWindow()) { throw 'Normal window-close request failed' }
    if (!$app.WaitForExit(10000)) { throw 'App failed to exit after native window close' }
  }
} finally {
  if($app -and !$app.HasExited) { Stop-Process -Id $app.Id }
  $uninstaller=Join-Path $dest 'uninstall.exe'
  if(Test-Path $uninstaller) { Start-Process $uninstaller -ArgumentList '/S' -Wait }
}
