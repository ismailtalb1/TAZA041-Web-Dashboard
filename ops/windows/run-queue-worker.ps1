$ErrorActionPreference = 'Stop'

$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$phpPath = (Get-Command php -ErrorAction Stop).Source

Set-Location -LiteralPath $projectPath

while ($true) {
    & $phpPath artisan queue:work database `
        --queue=mail,notifications,reports,default `
        --sleep=2 `
        --tries=3 `
        --timeout=180

    Start-Sleep -Seconds 2
}
