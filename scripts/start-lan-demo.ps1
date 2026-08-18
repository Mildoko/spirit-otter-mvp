$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$lanAddress = $null
try {
  $routeProbe = [System.Net.Sockets.UdpClient]::new()
  $routeProbe.Connect("8.8.8.8", 65530)
  $lanAddress = ([System.Net.IPEndPoint]$routeProbe.Client.LocalEndPoint).Address.IPAddressToString
  $routeProbe.Dispose()
} catch {
  $lanAddress = "127.0.0.1"
}

$port = 3001
$env:NODE_ENV = "development"
$env:OTTER_RUNTIME_MODE = "demo"
$env:SERVER_HOST = "0.0.0.0"
$env:SERVER_PORT = "$port"
$env:WEB_ORIGIN = "http://${lanAddress}:${port}"
$env:COOKIE_SECURE = "false"
$env:RESEARCH_CONTACT = "内部测试：请联系当前测试组织者"

if (-not (Test-Path -LiteralPath "server/dist/demo-server.js") -or -not (Test-Path -LiteralPath "web/dist/index.html")) {
  Write-Host "缺少网页版构建产物，正在构建……" -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "网页版构建失败" }
}

Write-Host ""
Write-Host "灵体水獭局域网内部测试版已准备启动" -ForegroundColor Cyan
Write-Host "本机及其他测试成员请打开：$env:WEB_ORIGIN" -ForegroundColor Green
Write-Host "每个浏览器使用独立的临时会话；关闭本窗口会停止服务并清空数据。"
Write-Host "若其他设备打不开，请在 Windows 防火墙中允许 TCP $port。"
Write-Host ""

node server/dist/demo-server.js
