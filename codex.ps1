# Launcher script cho Codex CLI dành riêng cho Project Carver-AI
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$env:CODEX_HOME = "$scriptDir\.codex"

# Nạp tự động API Key từ file .env.local trong dự án nếu có
$envLocalPath = Join-Path $scriptDir ".env.local"
if (Test-Path $envLocalPath) {
    Get-Content $envLocalPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                $varName = $parts[0].Trim()
                $varVal = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($varName, $varVal, "Process")
            }
        }
    }
}

# Gọi Codex CLI truyền tiếp toàn bộ tham số
codex @args
