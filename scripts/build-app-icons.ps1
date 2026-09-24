$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'assets/app-icon.png'))
try {
    $variants = @(
        @{ Name = 'favicon-16.png'; Size = 16; Opaque = $false },
        @{ Name = 'favicon-32.png'; Size = 32; Opaque = $false },
        @{ Name = 'apple-touch-icon.png'; Size = 180; Opaque = $true },
        @{ Name = 'icon-192.png'; Size = 192; Opaque = $false },
        @{ Name = 'icon-512.png'; Size = 512; Opaque = $false },
        @{ Name = 'icon-maskable-512.png'; Size = 512; Opaque = $true }
    )
    foreach ($variant in $variants) {
        $bitmap = [System.Drawing.Bitmap]::new($variant.Size, $variant.Size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            if ($variant.Opaque) {
                $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#7660bb'))
            } else {
                $graphics.Clear([System.Drawing.Color]::Transparent)
            }
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($source, 0, 0, $variant.Size, $variant.Size)
            $bitmap.Save((Join-Path $projectRoot ('public/icons/' + $variant.Name)), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $source.Dispose()
}
