# Generate the react-native-windows native project (Windows only).
# RNW 0.84 is the latest stable; this app's react-native is 0.86.
if ($env:OS -ne 'Windows_NT') {
  Write-Error 'init-windows must run on Windows.'
  exit 1
}
Set-Location (Join-Path $PSScriptRoot '..')
npx react-native init-windows --overwrite --no-telemetry
exit $LASTEXITCODE
