#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Este asistente utiliza el cifrado de credenciales de Windows.'
}
$dataDirectory = Join-Path $PSScriptRoot '../backend/data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

function Read-EmailAddress([string] $Prompt) {
    while ($true) {
        $value = (Read-Host $Prompt).Trim()
        try {
            $parsed = [System.Net.Mail.MailAddress]::new($value)
            if ($parsed.Address -eq $value -and $value.Contains('@')) { return $value }
        } catch { }
        Write-Host 'Introduce solamente la direccion de correo, sin nombre ni espacios.'
    }
}

$sender = Read-EmailAddress 'Correo del remitente que has verificado en Brevo'
$smtpLogin = Read-EmailAddress 'Login que aparece en la pestana SMTP de Brevo'
do {
    $smtpKey = Read-Host 'Pega la CLAVE SMTP (no se mostrara en pantalla)' -AsSecureString
} while ($smtpKey.Length -eq 0)
try {
    # Export-Clixml encrypts SecureString with Windows DPAPI for the current user.
    $credential = [System.Management.Automation.PSCredential]::new($smtpLogin, $smtpKey)
    $credential | Export-Clixml -LiteralPath (Join-Path $dataDirectory 'brevo.credentials.xml')
    @{ sender = $sender } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDirectory 'brevo.sender.json') -Encoding UTF8
    Write-Host 'Configuracion guardada. La clave esta cifrada para tu usuario de Windows y fuera de Git.'
    Write-Host 'Todavia no se ha enviado ningun correo ni se ha activado el servidor.'
} finally {
    $smtpKey.Dispose()
    $credential = $null
}
