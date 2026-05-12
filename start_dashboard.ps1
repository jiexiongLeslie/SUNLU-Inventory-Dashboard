# SUNLU 英欧库存数据看板 - 启动服务
# 端口: 5002
# 本机访问: http://localhost:5002
# 局域网访问: http://<本机IP>:5002

$port = 5002
$workDir = "C:\Users\Administrator\Documents\trae"

# 检查是否已在运行
$existing = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($existing) {
    Write-Host "看板服务已在运行中 (端口 $port)" -ForegroundColor Yellow
    Write-Host "本机访问: http://localhost:$port"
    # 获取本机IP
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
    if ($ip) {
        Write-Host "局域网访问: http://${ip}:$port"
    }
    exit 0
}

# 后台启动 Node.js 服务 (从 backend 目录启动)
Start-Process -FilePath 'node' -ArgumentList "backend/server.js" -WorkingDirectory $workDir -WindowStyle Hidden

Start-Sleep -Seconds 2

# 验证启动
$check = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($check) {
    Write-Host "看板服务启动成功!" -ForegroundColor Green
    Write-Host "本机访问: http://localhost:$port" -ForegroundColor Cyan
    # 获取本机IP
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
    if ($ip) {
        Write-Host "局域网访问: http://${ip}:$port" -ForegroundColor Cyan
    }
} else {
    Write-Host "启动失败，请检查 node 是否可用" -ForegroundColor Red
}
