# Compila e grava no NodeMCU pela USB (tarefa padrão: Ctrl+Shift+B)
. "$PSScriptRoot\comum.ps1"
Compilar
$porta = Encontrar-Porta
Titulo "Gravando em $porta (feche o Monitor Serial se estiver aberto)"
& arduino-cli upload --fqbn $Fqbn -p $porta --input-dir $Build $Sketch
if ($LASTEXITCODE -ne 0) { throw "Falha ao gravar. Feche o monitor serial, troque o cabo ou segure o botão FLASH ao iniciar." }
Write-Host "`nGravado. A placa reinicia sozinha." -ForegroundColor Green
