# Grava pelo Wi-Fi com ArduinoOTA. O PC e a placa precisam estar na MESMA rede.
param([string]$Destino = 'casa-inteligente.local')
. "$PSScriptRoot\comum.ps1"
Compilar

$dados  = Pasta-Arduino
$espota = Get-ChildItem -Path (Join-Path $dados 'packages\esp8266\hardware\esp8266') -Recurse -Filter espota.py -ErrorAction SilentlyContinue | Select-Object -First 1
$python = Get-ChildItem -Path (Join-Path $dados 'packages\esp8266\tools\python3') -Recurse -Filter python3.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $python) { $python = Get-Command python -ErrorAction SilentlyContinue }
if (-not $espota -or -not $python) { throw "Não encontrei espota.py/python do core ESP8266. Rode 'ESP8266: instalar ferramentas'." }

$senha = Ler-Define 'OTA_SENHA'
$bin   = Join-Path $Build 'casa_inteligente.ino.bin'
$py    = if ($python.Source) { $python.Source } else { $python.FullName }

Titulo "Enviando para $Destino pela rede"
& $py $espota.FullName -i $Destino -p 8266 "--auth=$senha" -f $bin -r
if ($LASTEXITCODE -ne 0) {
  throw "Falhou. Confira: placa ligada e na mesma rede do PC, firmware com OTA já gravado uma vez pela USB, firewall liberando o Python."
}
Write-Host "`nEnviado. A placa reinicia com o firmware novo." -ForegroundColor Green
