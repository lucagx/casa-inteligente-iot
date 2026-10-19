# Cria etiquetas, marcos e issues no GitHub a partir de docs/issues.json.
# Requisitos: GitHub CLI (winget install GitHub.cli) e "gh auth login" feito uma vez.
# Uso (na raiz do repositório, depois de publicar no GitHub):  .\scripts\criar-issues.ps1
# Pode rodar de novo: o que já existe é pulado.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "GitHub CLI não encontrado. Instale com:  winget install GitHub.cli  e rode  gh auth login" -ForegroundColor Yellow
  exit 1
}
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Faça login primeiro:  gh auth login" -ForegroundColor Yellow; exit 1 }

$raiz = Split-Path -Parent $PSScriptRoot
$dados = Get-Content (Join-Path $raiz 'docs/issues.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$repo = gh repo view --json nameWithOwner -q .nameWithOwner
if (-not $repo) { Write-Host "Repositório ainda não está no GitHub (publique pelo VS Code: Publish Branch)." -ForegroundColor Yellow; exit 1 }
Write-Host "Repositório: $repo" -ForegroundColor Cyan

# etiquetas
foreach ($p in $dados.labels.PSObject.Properties) {
  gh label create $p.Name --color $p.Value --force --repo $repo *> $null
  Write-Host "  etiqueta  $($p.Name)"
}

# marcos
$existentes = @(gh api "repos/$repo/milestones?state=all&per_page=100" | ConvertFrom-Json | ForEach-Object { $_.title })
foreach ($m in $dados.milestones) {
  if ($existentes -contains $m.title) { Write-Host "  marco ok  $($m.title)"; continue }
  gh api "repos/$repo/milestones" -f "title=$($m.title)" -f "description=$($m.desc)" -f "due_on=$($m.due)T23:59:59Z" *> $null
  Write-Host "  marco     $($m.title)"
}
$tituloMarco = @{}; foreach ($m in $dados.milestones) { $tituloMarco[$m.key] = $m.title }

# issues
$jaCriadas = @(gh issue list --repo $repo --state all --limit 300 --json title | ConvertFrom-Json | ForEach-Object { $_.title })
$tmp = New-TemporaryFile
foreach ($i in $dados.issues) {
  if ($jaCriadas -contains $i.title) { Write-Host "  já existe $($i.title)"; continue }
  [System.IO.File]::WriteAllText($tmp.FullName, $i.body + "`n`n_Detalhes e contexto: docs/ROADMAP.md · CLAUDE.md_", (New-Object System.Text.UTF8Encoding $false))
  gh issue create --repo $repo --title $i.title --body-file $tmp.FullName --label ($i.labels -join ',') --milestone $tituloMarco[$i.milestone] *> $null
  Write-Host "  criada    $($i.title)" -ForegroundColor Green
}
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Host "`nPronto. Veja em: https://github.com/$repo/issues" -ForegroundColor Cyan
