param([string]$OutputDirectory = (Join-Path $env:TEMP 'ai-coach-execution-fixtures'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
$rows = @(
    @('BUY', '2026-09-11T10:00:00-04:00', '100.00', '10'),
    @('SELL', '2026-09-14T10:00:00-04:00', '120.00', '5'),
    @('BUY', '2026-09-15T10:00:00-04:00', '80.00', '10'),
    @('SELL', '2026-09-16T10:00:00-04:00', '110.00', '10')
)
for ($i = 0; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    $bitmap = [System.Drawing.Bitmap]::new(1000, 650)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $font = [System.Drawing.Font]::new('Arial', 23)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $lines = @('SYNTHETIC TEST DATA - NOT A REAL ACCOUNT', 'Execution detail (FILLED)', 'Symbol: AAPL    Market: US    Currency: USD', "Side: $($row[0])", "Execution time: $($row[1])", "Execution price: $($row[2]) USD", "Executed quantity: $($row[3]) shares", "Test execution number: $($i + 1)")
        for ($line = 0; $line -lt $lines.Count; $line++) {
            $graphics.DrawString($lines[$line], $font, [System.Drawing.Brushes]::Black, 25, (25 + $line * 65))
        }
        $target = Join-Path $OutputDirectory "synthetic-execution-$($i + 1).png"
        $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output $target
    } finally {
        $font.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
