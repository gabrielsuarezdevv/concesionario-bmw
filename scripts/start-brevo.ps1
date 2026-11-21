#Requires -Version 5.1
param([string] $CheckoutPublicUrl = '', [ValidateRange(1,65535)][int] $Port = 8080)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Este lanzador utiliza las credenciales cifradas de tu usuario de Windows.'
}
$backendDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../backend'))
$credentialPath = Join-Path $backendDirectory 'data/brevo.credentials.xml'
$senderPath = Join-Path $backendDirectory 'data/brevo.sender.json'
if (!(Test-Path -LiteralPath $credentialPath) -or !(Test-Path -LiteralPath $senderPath)) {
    throw 'Ejecuta primero scripts/configure-brevo.ps1 para guardar tus datos de Brevo.'
}
$jarPath = Join-Path $backendDirectory 'target/bmw-atelier-1.0.0.jar'
if (!(Test-Path -LiteralPath $jarPath)) { throw 'Compila primero el backend con .\mvnw.cmd verify desde backend.' }
if ($env:JAVA_HOME) { $javaExecutable = Join-Path $env:JAVA_HOME 'bin/java.exe' }
else { $javaExecutable = (Get-Command java -ErrorAction Stop).Source }

$connection = [Net.Sockets.TcpClient]::new()
try {
    $attempt = $connection.ConnectAsync('127.0.0.1', $Port)
    try { $alreadyRunning = $attempt.Wait(500) -and $connection.Connected } catch { $alreadyRunning = $false }
    if ($alreadyRunning) { throw "El puerto $Port ya esta ocupado. Deten el backend actual antes de activar Brevo." }
} finally { $connection.Dispose() }

$credential = Import-Clixml -LiteralPath $credentialPath
$sender = Get-Content -LiteralPath $senderPath -Raw | ConvertFrom-Json
$previous = @{}
foreach ($name in @('ORDER_MAIL_FROM','SMTP_USERNAME','SMTP_PASSWORD','CHECKOUT_PUBLIC_URL')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    # Pass the key only in the child process environment, never command-line arguments.
    $env:ORDER_MAIL_FROM = $sender.sender
    $env:SMTP_USERNAME = $credential.UserName
    $env:SMTP_PASSWORD = $credential.GetNetworkCredential().Password
    $env:CHECKOUT_PUBLIC_URL = $CheckoutPublicUrl
    Push-Location $backendDirectory
    try {
        Write-Host 'Iniciando el servidor con Brevo. Los nuevos pedidos enviaran correos reales.'
        & $javaExecutable -jar $jarPath --server.address=127.0.0.1 "--server.port=$Port" --spring.profiles.active=brevo
        if ($LASTEXITCODE -ne 0) { throw 'El servidor no ha podido arrancar con Brevo.' }
    } finally { Pop-Location }
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $credential = $null
}
