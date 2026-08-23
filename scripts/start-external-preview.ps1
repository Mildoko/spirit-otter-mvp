$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$port = 3001
$previewRoot = Join-Path $projectRoot ".local\external-preview"
$toolRoot = Join-Path $projectRoot ".local\tools"
$cloudflaredPath = Join-Path $toolRoot "cloudflared.exe"
$cloudflaredDownload = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

New-Item -ItemType Directory -Force -Path $previewRoot, $toolRoot | Out-Null

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $port is already in use. Stop the previous preview service first."
}

if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
  Write-Host "First launch: downloading the official Cloudflare tunnel client..." -ForegroundColor Yellow
  $downloadTarget = Join-Path $toolRoot "cloudflared.download.exe"
  Invoke-WebRequest -Uri $cloudflaredDownload -OutFile $downloadTarget
  Move-Item -LiteralPath $downloadTarget -Destination $cloudflaredPath -Force
}

Write-Host "Building the external preview..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "The web build failed." }

$randomBytes = [byte[]]::new(6)
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($randomBytes)
$randomGenerator.Dispose()
$previewCode = "OTTER-" + ([BitConverter]::ToString($randomBytes) -replace "-", "")

$env:NODE_ENV = "development"
$env:OTTER_RUNTIME_MODE = "demo"
$env:SERVER_HOST = "127.0.0.1"
$env:SERVER_PORT = "$port"
$env:WEB_ORIGIN = "http://127.0.0.1:$port"
$env:COOKIE_SECURE = "false"
$env:LOCAL_TEST_MODE = "false"
$env:EXTERNAL_PREVIEW_ENABLED = "true"
$env:EXTERNAL_PREVIEW_CODE = $previewCode
$env:EXTERNAL_PREVIEW_MAX_SESSIONS = "20"
$env:APP_TIME_ZONE = "Asia/Shanghai"
$env:EXPRESSION_STYLE_V2 = "true"
$env:EMOTION_INFERENCE_V2 = "true"
$env:SCENE_WORLD_V1 = "true"
$env:AUDIO_V1 = "true"
$env:MEMORY_V2 = "true"
$env:ASTROLOGY_SKILL_V1 = "true"
$contactBase64 = "5aaC6ZyA546w5a6e5biu5Yqp77yM6K+356uL5Y2z6IGU57O76YKA6K+35L2g5Y+C5Yqg5L2T6aqM55qE5Lq65oiW5b2T5Zyw57Sn5oCl5pyN5Yqh"
$env:RESEARCH_CONTACT = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($contactBase64))

$stdoutLog = Join-Path $previewRoot "server.stdout.log"
$stderrLog = Join-Path $previewRoot "server.stderr.log"
$nodePath = (Get-Command node).Source
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList "server/dist/demo-server.js" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($serverProcess.HasExited) { throw "The preview server failed to start. See $stderrLog" }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 1
      if ($health.status -eq "ok") { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "The preview server was not ready within 10 seconds." }

  Write-Host ""
  Write-Host "Spirit Otter controlled external preview is starting." -ForegroundColor Cyan
  Write-Host "Preview code: $previewCode" -ForegroundColor Green
  Write-Host "Up to 20 browser sessions; isolated in-memory data; closing this window clears all data."
  Write-Host "Share the https://*.trycloudflare.com URL shown below." -ForegroundColor Yellow
  Write-Host "Only share the URL and code with invited friends. Do not publish them publicly."
  Write-Host ""

  & $cloudflaredPath tunnel --url "http://127.0.0.1:$port" --no-autoupdate --protocol http2
  if ($LASTEXITCODE -ne 0) { throw "The Cloudflare temporary tunnel exited." }
} finally {
  if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force }
  Write-Host "The external preview stopped. Its in-memory data has been cleared." -ForegroundColor Cyan
}
