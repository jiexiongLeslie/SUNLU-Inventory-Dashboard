# SUNLU 英欧库存数据看板 - 停止服务

$port = 5002
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }

if ($connections) {
    foreach ($conn in $connections) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Write-Host "看板服务已停止 (端口 $port)" -ForegroundColor Green
} else {
    Write-Host "看板服务未在运行" -ForegroundColor Yellow
}
