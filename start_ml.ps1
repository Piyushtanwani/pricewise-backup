# PriceWise ML service launcher from workspace root
param(
    [switch]$Pipeline
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $RootDir "ml-service")

if ($Pipeline) {
    & .\start_ml.ps1 -Pipeline
} else {
    & .\start_ml.ps1
}
