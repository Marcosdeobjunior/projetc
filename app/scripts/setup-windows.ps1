# InkFlow: verifica e instala o que falta para desenvolver o app no Windows.
# Rode no PowerShell:  powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
# Usa o winget (já vem no Windows 10/11). Algumas instalações pedem permissão de administrador.

$ErrorActionPreference = "Stop"

function Test-Command($name) {
  [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# Depois de instalar, o PATH novo só vale em terminais novos; isto atualiza o atual.
function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-BuildTools {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) { return $false }
  $path = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  return [bool]$path
}

function Test-WebView2 {
  $keys = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )
  foreach ($k in $keys) {
    $pv = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).pv
    if ($pv -and $pv -ne "0.0.0.0") { return $true }
  }
  return $false
}

if (-not (Test-Command winget)) {
  Write-Host "O winget não foi encontrado. Instale o 'Instalador de Aplicativo' pela Microsoft Store e rode este script de novo." -ForegroundColor Red
  exit 1
}

$items = @(
  @{ Name = "Git";                 Check = { Test-Command git };   Id = "Git.Git" },
  @{ Name = "Node.js LTS";         Check = { Test-Command node };  Id = "OpenJS.NodeJS.LTS" },
  @{ Name = "Rust (rustup)";       Check = { Test-Command rustup }; Id = "Rustlang.Rustup" },
  @{ Name = "Build Tools C++";     Check = { Test-BuildTools };    Id = "Microsoft.VisualStudio.2022.BuildTools";
     Extra = @("--override", "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended") },
  @{ Name = "WebView2";            Check = { Test-WebView2 };      Id = "Microsoft.EdgeWebView2Runtime" }
)

$installed = @()
foreach ($item in $items) {
  if (& $item.Check) {
    Write-Host "[ok]        $($item.Name)" -ForegroundColor Green
    continue
  }
  Write-Host "[instalando] $($item.Name)..." -ForegroundColor Yellow
  $wingetArgs = @("install", "--id", $item.Id, "-e", "--accept-source-agreements", "--accept-package-agreements")
  if ($item.Extra) { $wingetArgs += $item.Extra }
  winget @wingetArgs
  # -1978335189 = já instalado, sem atualização: não é erro.
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
    Write-Host "Não foi possível instalar $($item.Name) (código $LASTEXITCODE). Tente de novo ou instale manualmente." -ForegroundColor Red
    exit 1
  }
  $installed += $item.Name
  Update-Path
}

# Rust: garante a versão estável como padrão.
if (Test-Command rustup) {
  rustup default stable | Out-Null
  Write-Host "[ok]        Rust $(rustc --version)" -ForegroundColor Green
}

# pnpm (gerenciador de pacotes do projeto), pela mesma versão usada no projeto.
if (-not (Test-Command pnpm)) {
  Write-Host "[instalando] pnpm..." -ForegroundColor Yellow
  npm install -g pnpm@10.28.0
  Update-Path
}
Write-Host "[ok]        pnpm $(pnpm --version)" -ForegroundColor Green

Write-Host ""
Write-Host "Tudo pronto." -ForegroundColor Green
if ($installed.Count -gt 0) {
  Write-Host "Instalados agora: $($installed -join ', '). Feche e abra o terminal antes de continuar."
}
Write-Host ""
Write-Host "Próximos passos (no terminal, numa pasta de sua escolha):"
Write-Host "  git clone https://github.com/Marcosdeobjunior/projetc.git"
Write-Host "  cd projetc"
Write-Host "  git checkout claude/lucid-rubin-ssjmgq"
Write-Host "  cd app"
Write-Host "  pnpm install"
Write-Host "  pnpm tauri dev"
