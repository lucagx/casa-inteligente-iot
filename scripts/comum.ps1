# Funções compartilhadas pelas tarefas do VS Code (ESP8266 / NodeMCU)
$ErrorActionPreference = 'Stop'

$Raiz   = Split-Path -Parent $PSScriptRoot
$Sketch = Join-Path $Raiz 'firmware\casa_inteligente'
$Build  = Join-Path $Raiz 'build'
$Fqbn   = 'esp8266:esp8266:nodemcuv2'
$UrlEsp8266 = 'https://arduino.esp8266.com/stable/package_esp8266com_index.json'

function Titulo($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }

function Exigir-ArduinoCli {
  if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
    throw "arduino-cli não encontrado. Rode a tarefa 'ESP8266: instalar ferramentas' e reabra o VS Code."
  }
}

function Exigir-Secrets {
  if (-not (Test-Path (Join-Path $Sketch 'secrets.h'))) {
    throw "Falta firmware\casa_inteligente\secrets.h. Copie secrets.example.h para secrets.h e preencha token e Wi-Fi."
  }
}

# Lê o valor de um #define "texto" do firmware (ex.: BLYNK_FIRMWARE_VERSION, OTA_SENHA)
function Ler-Define($nome) {
  $arquivos = Get-ChildItem -Path $Sketch -Include *.h, *.ino -File -Recurse
  foreach ($a in $arquivos) {
    $m = Select-String -Path $a.FullName -Pattern "^\s*#define\s+$nome\s+`"([^`"]*)`"" | Select-Object -First 1
    if ($m) { return $m.Matches[0].Groups[1].Value }
  }
  return $null
}

function Compilar {
  Exigir-ArduinoCli
  Exigir-Secrets
  Titulo "Compilando firmware $(Ler-Define 'BLYNK_FIRMWARE_VERSION') para NodeMCU (ESP8266)"
  & arduino-cli compile --fqbn $Fqbn --output-dir $Build $Sketch
  if ($LASTEXITCODE -ne 0) { throw "Falha na compilação (veja os erros acima)." }
}

# Descobre a porta COM do NodeMCU (CH340 = 1A86, CP210x = 10C4, FTDI = 0403)
function Encontrar-Porta {
  $saida = & arduino-cli board list --format json | Out-String
  $dados = $saida | ConvertFrom-Json
  $lista = if ($null -ne $dados.detected_ports) { $dados.detected_ports } else { $dados }
  $seriais = @($lista | Where-Object { $_.port.protocol -eq 'serial' })
  if ($seriais.Count -eq 0) {
    throw "Nenhuma placa encontrada na USB. Use um cabo de DADOS e confira o driver (CH340 ou CP210x)."
  }
  $placa = $seriais | Where-Object { "$($_.port.properties.vid)" -match '1A86|10C4|0403' } | Select-Object -First 1
  if (-not $placa) { $placa = $seriais | Select-Object -First 1 }
  Write-Host "Placa encontrada em $($placa.port.address)" -ForegroundColor Green
  return $placa.port.address
}

# Pasta de dados do Arduino (onde fica o core do ESP8266)
function Pasta-Arduino {
  $p = (& arduino-cli config get directories.data 2>$null | Out-String).Trim()
  if (-not $p -or -not (Test-Path $p)) { $p = Join-Path $env:LOCALAPPDATA 'Arduino15' }
  return $p
}
