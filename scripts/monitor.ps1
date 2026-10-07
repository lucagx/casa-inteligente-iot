# Abre o Monitor Serial do NodeMCU (115200)
. "$PSScriptRoot\comum.ps1"
Exigir-ArduinoCli
$porta = Encontrar-Porta
Titulo "Monitor serial em $porta (Ctrl+C para sair)"
& arduino-cli monitor -p $porta --config baudrate=115200
