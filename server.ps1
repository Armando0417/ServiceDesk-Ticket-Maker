# ============================================================================
#  Ticket Generator — Local Server (v2.0)
#
#  Routes:
#    GET  /              → serves web/index.html
#    GET  /web/*         → serves static files
#    GET  /api/config    → sends ALL config to the frontend (single source of truth)
#    GET  /api/ad        → AD lookup
#    POST /api/clipboard → copies text to clipboard
#    POST /api/save      → writes ticket JSON to current_user.json
#
#  Bound to 127.0.0.1 ONLY. Nothing leaves this machine.
# ============================================================================


# ── Dependencies ───────────────────────────────────────────────────────────
Add-Type -AssemblyName System.Windows.Forms


# ── Paths ──────────────────────────────────────────────────────────────────
$BaseDir = if ($PSScriptRoot) { $PSScriptRoot }
           elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path }
           else { (Get-Location).Path }

$WebDir          = Join-Path $BaseDir 'web'
$ConfigFile      = Join-Path $BaseDir 'config.json'
$TemplateFile    = Join-Path $BaseDir 'block_template.txt'
$TemplateMapFile = Join-Path $BaseDir 'templates.json'
$OutputFile      = Join-Path $BaseDir 'current_user.json'

$Port   = 8080
$Origin = "http://127.0.0.1:$Port"


# ============================================================================
#  DEFAULTS
#  — Used when config.json or templates.json don't exist.
#  — To customize, edit config.json. Don't touch these.
# ============================================================================

$DefaultConfig = @{
    technician   = ''
    quickActions = [ordered]@{
        reset  = 'Password Reset (Elevance)'
        unlock = 'Account Unlock'
        okta   = 'Okta Unpair'
    }
    dropdowns = @{
        ticketType   = @('Incident', 'Request')
        status       = @('Open', 'closed', 'Onhold')
        locationArea = @('Remoto', 'Presencial')
        closureCode  = @('Success', 'Unable to Reproduce')
    }
    fields = @{
        ticket = @(
            @{ id = 'txtName';     label = 'Name';           type = 'text'; placeholder = 'Display name' }
            @{ id = 'txtUser';     label = 'Username';       type = 'text'; placeholder = 'sAMAccountName' }
            @{ id = 'txtDept';     label = 'Department';     type = 'text' }
            @{ id = 'txtLocation'; label = 'Location';       type = 'text' }
            @{ id = 'txtContact';  label = 'Contact Number'; type = 'text'; placeholder = '7871234567' }
            @{ id = 'txtEmail';    label = 'Email';          type = 'text' }
            @{ id = 'txtTopic';    label = 'Topic';          type = 'text' }
            @{ id = 'txtTechnician'; label = 'Technician';   type = 'text' }
        )
        request = @(
            @{ id = 'txtReqName'; label = 'Name';     type = 'text' }
            @{ id = 'txtReqUser'; label = 'Username'; type = 'text' }
            @{ id = 'txtReqOkta'; label = 'Okta ID';  type = 'text' }
        )
    }
    adProperties = @(
        'DisplayName', 'SamAccountName', 'mail', 'Department',
        'Office', 'physicalDeliveryOfficeName',
        'oktaUser', 'Description',
        'homePhone', 'pager', 'mobile',
        'facsimileTelephoneNumber', 'ipPhone',
        'inactivityStatus'
    )
    adMapping = @{
        DisplayName    = 'txtName'
        SamAccountName = 'txtUser'
        mail           = 'txtEmail'
        Department     = 'txtDept'
        Office         = 'txtLocation'
        oktaUser       = 'txtReqOkta'
    }
}

$DefaultBlockTemplate = @"
Detalles:
---
Nombre: {{name}}
username: {{user}}
departamento: {{department}}
localidad: {{location}}
numero de contacto: {{contact}}
correo: {{email}}

---

Situacion:
{{subject}}

---
Proceso:
{{process}}
"@

$DefaultTemplateMap = [ordered]@{
    'Password Reset'  = @{ Category = 'Applications';        Subcategory = 'Password Reset';   Item = '' }
    'Account Unlock'  = @{ Category = 'User Administration'; Subcategory = 'Active Directory'; Item = 'Locked Account' }
    'Orientation Call' = @{ Category = 'User Administration'; Subcategory = 'Orientation Call'; Item = '' }
    'Hardware Issues'  = @{ Category = 'Hardware';            Subcategory = 'Laptop';           Item = '' }
    'Error 58tm1'      = @{ Category = 'Applications';        Subcategory = 'Microsoft Apps';  Item = '' }
}


# ============================================================================
#  LOADERS
# ============================================================================

function Load-Config {
    if (-not (Test-Path $ConfigFile)) { return $DefaultConfig }
    try {
        $raw = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json -ErrorAction Stop

        # Merge with defaults — anything missing in config.json falls back
        $cfg = $DefaultConfig.Clone()
        if ($null -ne $raw.technician)    { $cfg.technician   = [string]$raw.technician }
        if ($null -ne $raw.quickActions)  { $cfg.quickActions  = $raw.quickActions }
        if ($null -ne $raw.dropdowns)     { $cfg.dropdowns     = $raw.dropdowns }
        if ($null -ne $raw.fields)        { $cfg.fields        = $raw.fields }
        if ($null -ne $raw.adProperties)  { $cfg.adProperties  = @($raw.adProperties) }
        if ($null -ne $raw.adMapping)     { $cfg.adMapping     = $raw.adMapping }
        return $cfg
    } catch {
        Write-Host "  [warn] Could not parse config.json, using defaults." -ForegroundColor Yellow
        return $DefaultConfig
    }
}

function Load-BlockTemplate {
    if (Test-Path $TemplateFile) { return (Get-Content $TemplateFile -Raw) }
    return $DefaultBlockTemplate
}

function Load-TemplateMap {
    if (-not (Test-Path $TemplateMapFile)) { return $DefaultTemplateMap }
    try {
        $raw = Get-Content -Path $TemplateMapFile -Raw | ConvertFrom-Json -ErrorAction Stop
        $map = [ordered]@{}
        foreach ($entry in $raw.PSObject.Properties) {
            $v = $entry.Value
            $map[$entry.Name] = @{
                Category    = if ($v.Category)    { [string]$v.Category }    else { '' }
                Subcategory = if ($v.Subcategory) { [string]$v.Subcategory } else { '' }
                Item        = if ($v.Item)        { [string]$v.Item }
                              elseif ($v.item)    { [string]$v.item }
                              else { '' }
            }
        }
        return $map
    } catch {
        return $DefaultTemplateMap
    }
}

# Load once at startup
$Config        = Load-Config
$BlockTemplate = Load-BlockTemplate
$TemplateMap   = Load-TemplateMap

Write-Host ""
Write-Host "  Config loaded." -ForegroundColor DarkGray
Write-Host "    Technician:    $( if ($Config.technician) { $Config.technician } else { '(not set)' } )" -ForegroundColor DarkGray


# ============================================================================
#  UTILITIES
# ============================================================================

function Escape-FilterValue([string]$Value) {
    if ($null -eq $Value) { return '' }
    return $Value.Replace("'", "''")
}


# ============================================================================
#  AD LOOKUP
#  — Properties to fetch come from config.adProperties
#  — Field mapping comes from config.adMapping
# ============================================================================

function Invoke-ADLookup([string]$QueryUser, [string]$QueryName) {
    if (-not $QueryUser -and -not $QueryName) {
        return @{ ok = $false; error = 'Provide a username or name to search.' }
    }

    try { Import-Module ActiveDirectory -ErrorAction Stop }
    catch { return @{ ok = $false; error = 'ActiveDirectory module is not available.' } }

    # Pull the property list from config
    $props = @($Config.adProperties)

    try {
        $user = $null

        if ($QueryUser) {
            try {
                $user = Get-ADUser -Identity $QueryUser -Properties $props -ErrorAction Stop
            } catch {
                $safe = Escape-FilterValue $QueryUser
                $user = Get-ADUser -Filter "SamAccountName -eq '$safe' -or UserPrincipalName -like '$safe*'" `
                        -Properties $props | Select-Object -First 1
            }
        }

        if (-not $user -and $QueryName) {
            $safe = Escape-FilterValue $QueryName
            $user = Get-ADUser -Filter "Name -like '*$safe*' -or DisplayName -like '*$safe*'" `
                    -Properties $props | Select-Object -First 1
        }

        if (-not $user) {
            return @{ ok = $false; error = 'No matching AD user found.' }
        }

        # Build result: return every requested property that has a value
        $result = @{ ok = $true }
        foreach ($prop in $props) {
            $val = $user.$prop
            if ($val) { $result[$prop] = [string]$val }
        }

        # Also return the field mapping so the frontend knows where to put each value
        $result['_mapping'] = $Config.adMapping

        return $result
    } catch {
        return @{ ok = $false; error = "AD lookup failed: $($_.Exception.Message)" }
    }
}


# ============================================================================
#  CLIPBOARD
# ============================================================================

function Set-Clipboard-Text([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @{ ok = $false; error = 'Nothing to copy.' }
    }
    try {
        [System.Windows.Forms.Clipboard]::SetText($Text)
        return @{ ok = $true }
    } catch {
        return @{ ok = $false; error = "Clipboard failed: $($_.Exception.Message)" }
    }
}


# ============================================================================
#  HTTP HELPERS
# ============================================================================

function Send-Json($response, [hashtable]$data, [int]$status = 200) {
    $json   = $data | ConvertTo-Json -Depth 10
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode       = $status
    $response.ContentType      = 'application/json; charset=utf-8'
    $response.Headers.Add('Access-Control-Allow-Origin', $Origin)
    $response.ContentLength64  = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
}

function Send-Text($response, [string]$text, [string]$contentType = 'text/plain', [int]$status = 200) {
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($text)
    $response.StatusCode       = $status
    $response.ContentType      = "$contentType; charset=utf-8"
    $response.ContentLength64  = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
}

function Send-File($response, [string]$filePath) {
    if (-not (Test-Path $filePath)) {
        Send-Text $response '404 Not Found' 'text/plain' 404
        return
    }
    $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
    $mime = @{
        '.html' = 'text/html';       '.css'  = 'text/css'
        '.js'   = 'application/javascript'; '.json' = 'application/json'
        '.png'  = 'image/png';       '.svg'  = 'image/svg+xml'
        '.ico'  = 'image/x-icon'
    }
    $type  = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $response.StatusCode       = 200
    $response.ContentType      = $type
    $response.ContentLength64  = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

function Read-RequestBody($request) {
    $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
    $body   = $reader.ReadToEnd()
    $reader.Close()
    return $body
}


# ============================================================================
#  SECURITY TOKEN
# ============================================================================

$Token = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

function Check-Token($request) {
    $q = $request.QueryString['token']
    $h = $request.Headers['X-Token']
    return (($q -eq $Token) -or ($h -eq $Token))
}


# ============================================================================
#  ROUTE HANDLER
# ============================================================================

function Handle-Request($context) {
    $req    = $context.Request
    $res    = $context.Response
    $path   = $req.Url.AbsolutePath
    $method = $req.HttpMethod

    Write-Host "  $method $path" -ForegroundColor DarkGray

    # ── Root ───────────────────────────────────────────────────────────
    if ($path -eq '/' -or $path -eq '/index.html') {
        Send-File $res (Join-Path $WebDir 'index.html')
        return
    }

    # ── Static files (/web/*) ──────────────────────────────────────────
    if ($path.StartsWith('/web/')) {
        $relative = $path.Substring(5)
        if ($relative.Contains('..')) { Send-Text $res '403' 'text/plain' 403; return }
        Send-File $res (Join-Path $WebDir $relative)
        return
    }

    # ── Token gate — everything below requires auth ────────────────────
    if (-not (Check-Token $req)) {
        Send-Json $res @{ ok = $false; error = 'Invalid or missing token.' } 403
        return
    }

    # ── GET /api/config ────────────────────────────────────────────────
    #    The frontend's single source of truth.
    #    Everything the UI needs to build itself lives here.
    if ($path -eq '/api/config' -and $method -eq 'GET') {
        Send-Json $res @{
            ok            = $true
            technician    = $Config.technician
            quickActions  = $Config.quickActions
            dropdowns     = $Config.dropdowns
            fields        = $Config.fields
            adMapping     = $Config.adMapping
            blockTemplate = $BlockTemplate
            templateMap   = $TemplateMap
        }
        return
    }

    # ── GET /api/ad?user=xxx  or  ?name=xxx ────────────────────────────
    if ($path -eq '/api/ad' -and $method -eq 'GET') {
        $result = Invoke-ADLookup $req.QueryString['user'] $req.QueryString['name']
        Send-Json $res $result ($(if ($result.ok) { 200 } else { 404 }))
        return
    }

    # ── POST /api/clipboard ────────────────────────────────────────────
    if ($path -eq '/api/clipboard' -and $method -eq 'POST') {
        $body = Read-RequestBody $req
        try {
            $data   = $body | ConvertFrom-Json
            $result = Set-Clipboard-Text $data.text
            Send-Json $res $result
        } catch {
            Send-Json $res @{ ok = $false; error = 'Invalid request body.' } 400
        }
        return
    }

    # ── POST /api/save ─────────────────────────────────────────────────
    if ($path -eq '/api/save' -and $method -eq 'POST') {
        $body = Read-RequestBody $req
        try {
            Set-Content -Path $OutputFile -Value $body -Encoding UTF8
            Send-Json $res @{ ok = $true; path = $OutputFile }
        } catch {
            Send-Json $res @{ ok = $false; error = "Save failed: $($_.Exception.Message)" } 500
        }
        return
    }

    # ── 404 ────────────────────────────────────────────────────────────
    Send-Json $res @{ ok = $false; error = "Unknown route: $path" } 404
}


# ============================================================================
#  START
# ============================================================================

$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("$Origin/")
$http.Start()

$StartUrl = "$Origin/?token=$Token"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkYellow
Write-Host "    Ticket Generator Server v3.0"               -ForegroundColor Yellow
Write-Host "  ============================================" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  Listening on:  $Origin"  -ForegroundColor Green
Write-Host "  Token:         $Token"   -ForegroundColor DarkGray
Write-Host "  Config:        $ConfigFile" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Opening browser..." -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

Start-Process $StartUrl

try {
    while ($http.IsListening) {
        Handle-Request $http.GetContext()
    }
} catch {
    Write-Host "`n  Server error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    $http.Stop()
    $http.Close()
    Write-Host "  Server stopped." -ForegroundColor Yellow
}

