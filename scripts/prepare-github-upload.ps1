# Gera um ZIP pronto para upload manual no GitHub (sem node_modules).
$root = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $root "diaconia-deploy.zip"
$items = @(
  "index.html",
  "package.json",
  "package-lock.json",
  "server.js",
  "railway.toml",
  "README.md",
  "DEPLOY-RAILWAY.md",
  ".gitignore",
  "css",
  "js",
  "scripts"
)

if (Test-Path $dest) { Remove-Item $dest -Force }

Push-Location $root
try {
  Compress-Archive -Path $items -DestinationPath $dest -Force
  Write-Host "OK: $dest"
  Write-Host "Tamanho: $([math]::Round((Get-Item $dest).Length / 1MB, 2)) MB"
  Write-Host ""
  Write-Host "Proximo passo:"
  Write-Host "1. GitHub -> New repository -> diaconia-escala"
  Write-Host "2. Upload file -> arraste diaconia-deploy.zip OU use git push"
  Write-Host "3. Railway -> Connect Repo -> Generate Domain"
} finally {
  Pop-Location
}
