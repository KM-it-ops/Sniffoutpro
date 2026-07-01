param(
  [string]$WebUrl = "",
  [switch]$SkipDeploy,
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$env:Path = "C:\Program Files\nodejs;$env:USERPROFILE\AppData\Roaming\npm;" + $env:Path

$VercelScope = "km-it-ops-projects"
$VercelProject = "sniffoutpro-web"

Write-Host "SniffOutPro production bootstrap"

$TokenFile = Join-Path $Root ".local\sync-token.txt"
$TokenDir = Split-Path $TokenFile -Parent
if (-not (Test-Path $TokenDir)) {
  New-Item -ItemType Directory -Path $TokenDir -Force | Out-Null
}

if (Test-Path $TokenFile) {
  $SyncToken = (Get-Content $TokenFile -Raw).Trim()
} else {
  $SyncToken = (node (Join-Path $Root "scripts\generate-sync-token.mjs")).Trim()
  Set-Content -Path $TokenFile -Value $SyncToken -NoNewline
}

$LocalEnv = Join-Path $Root ".local\prod.env"
Set-Content -Path $LocalEnv -Value ("SNIFFOUT_SYNC_TOKEN=" + $SyncToken + "`nSNIFFOUT_TIER=WORKSTATION`n")

$DesktopEnv = Join-Path $Root "apps\desktop\.env.production.local"
$WebTarget = $WebUrl
if (-not $WebTarget) { $WebTarget = "https://sniffoutpro-web.vercel.app" }
Set-Content -Path $DesktopEnv -Value ("VITE_WEB_URL=" + $WebTarget + "`nVITE_SYNC_TOKEN=" + $SyncToken + "`n")

pnpm turbo run typecheck lint test --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm turbo run build --filter=@sniffoutpro/web --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipMigrate) {
  docker compose -f docker/docker-compose.dev.yml up -d
  Start-Sleep -Seconds 5
  $env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  pnpm --filter @sniffoutpro/db db:migrate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipDeploy) {
  $hasVercel = $null -ne (Get-Command vercel -ErrorAction SilentlyContinue)
  if ($hasVercel) {
    vercel link --yes --project $VercelProject --scope $VercelScope
    if ($env:DATABASE_URL -and $env:DATABASE_URL -notmatch '127\.0\.0\.1|localhost') {
      $env:DATABASE_URL | vercel env add DATABASE_URL production --force --scope $VercelScope
    } else {
      Write-Host "skip DATABASE_URL on Vercel (set hosted Supabase pooler in dashboard)"
    }
    $SyncToken | vercel env add SNIFFOUT_SYNC_TOKEN production --force --scope $VercelScope
    "WORKSTATION" | vercel env add SNIFFOUT_TIER production --force --scope $VercelScope
    vercel deploy --prod --yes --scope $VercelScope
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

Write-Host "bootstrap complete"
