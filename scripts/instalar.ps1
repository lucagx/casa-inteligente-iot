# Instala arduino-cli, o core do ESP8266 e as bibliotecas do projeto (rodar uma vez por PC)
. "$PSScriptRoot\comum.ps1"

if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  Titulo "Instalando arduino-cli"
  winget install --id ArduinoSA.CLI -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
    throw "Não consegui instalar pelo winget. Baixe em https://arduino.github.io/arduino-cli/latest/installation/ e reabra o VS Code."
  }
}

Titulo "Core ESP8266"
& arduino-cli core update-index --additional-urls $UrlEsp8266
& arduino-cli core install esp8266:esp8266 --additional-urls $UrlEsp8266
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar o core do ESP8266." }

Titulo "Bibliotecas"
& arduino-cli lib update-index
& arduino-cli lib install "Blynk" "DHT sensor library" "Adafruit Unified Sensor"
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as bibliotecas." }

$secrets = Join-Path $Sketch 'secrets.h'
if (-not (Test-Path $secrets)) {
  Copy-Item (Join-Path $Sketch 'secrets.example.h') $secrets
  Write-Host "`nCriei firmware\casa_inteligente\secrets.h a partir do exemplo. Preencha token, Wi-Fi e senha do OTA." -ForegroundColor Yellow
}
Write-Host "`nPronto. Use Ctrl+Shift+B para gravar pela USB." -ForegroundColor Green
