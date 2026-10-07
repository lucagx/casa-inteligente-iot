# Gera o .bin para enviar pelo Blynk.Air (funciona com a placa em qualquer rede com internet)
. "$PSScriptRoot\comum.ps1"
Compilar
$versao  = Ler-Define 'BLYNK_FIRMWARE_VERSION'
$origem  = Join-Path $Build 'casa_inteligente.ino.bin'
$destino = Join-Path $Build "casa-inteligente-v$versao.bin"
Copy-Item $origem $destino -Force
Write-Host "`nArquivo pronto: $destino" -ForegroundColor Green
Write-Host @"

Para enviar:
  1. Blynk.Console → Developer Zone → Blynk.Air → New Shipping
  2. Escolha o template "Mini Casa Inteligente" e arraste o arquivo acima
  3. Start Shipping (a placa precisa estar online)

Lembrete: suba BLYNK_FIRMWARE_VERSION no .ino a cada envio (está em $versao).
"@
Start-Process explorer.exe "/select,`"$destino`""
