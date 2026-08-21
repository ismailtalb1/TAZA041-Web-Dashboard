[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$phpPath = (Get-Command php -ErrorAction Stop).Source
$workerScript = (Resolve-Path (Join-Path $PSScriptRoot 'run-queue-worker.ps1')).Path
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath (Join-Path $projectPath 'artisan'))) {
    throw 'Laravel artisan was not found in the project directory.'
}

$principal = New-ScheduledTaskPrincipal `
    -UserId $taskUser `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

$queueAction = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$workerScript`"" `
    -WorkingDirectory $projectPath
$queueTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser

Register-ScheduledTask `
    -TaskName 'TAZA041 Queue Worker' `
    -Action $queueAction `
    -Trigger $queueTrigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Processes TAZA041 mail, notification, report, and default queues.' `
    -Force | Out-Null

$schedulerAction = New-ScheduledTaskAction `
    -Execute $phpPath `
    -Argument 'artisan schedule:run' `
    -WorkingDirectory $projectPath
$schedulerTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName 'TAZA041 Laravel Scheduler' `
    -Action $schedulerAction `
    -Trigger $schedulerTrigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Runs the TAZA041 Laravel scheduler every minute.' `
    -Force | Out-Null

Start-ScheduledTask -TaskName 'TAZA041 Queue Worker'
Start-ScheduledTask -TaskName 'TAZA041 Laravel Scheduler'

Write-Output 'TAZA041 queue worker and Laravel scheduler are installed and running.'
