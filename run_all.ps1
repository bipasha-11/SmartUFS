# run_all.ps1
# Automated startup script for the OS Project

Write-Host "🚀 Starting ML-Enhanced File System Simulator..." -ForegroundColor Cyan

# 1. Start Python ML Predictor
Write-Host "📦 Starting ML Service (Port 5000)..." -ForegroundColor Yellow
Start-Process python -ArgumentList "backend/ml_module/predictor.py" -NoNewWindow -PassThru

# 2. Start Backend API
Write-Host "⚙️ Starting Backend API (Port 3001)..." -ForegroundColor Yellow
Set-Location -Path "backend"
Start-Process npx -ArgumentList "ts-node src/index.ts" -NoNewWindow -PassThru
Set-Location -Path ".."

# 3. Start Frontend Dashboard
Write-Host "🌐 Starting Frontend Dashboard (Port 3000)..." -ForegroundColor Yellow
Set-Location -Path "frontend"
Start-Process npm -ArgumentList "run dev" -NoNewWindow -PassThru
Set-Location -Path ".."

Write-Host "✅ All services initialized! Open http://localhost:3000 in your browser." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the script (Note: Background processes may need manual termination)." -ForegroundColor Gray

while($true) { Start-Sleep -Seconds 1 }
