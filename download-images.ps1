# Lamihani homepage - localize images (Windows PowerShell)
# ---------------------------------------------------------
# Downloads cdn.imweb.me images referenced in index.html into images\,
# then rewrites the URLs in index.html to local paths (images/...).
#
# Usage (inside the repo folder):
#   powershell -ExecutionPolicy Bypass -File download-images.ps1
#
# After it finishes:
#   git add -A
#   git commit -m "localize images"
#   git push

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path "images" | Out-Null

$htmlPath = Join-Path $PSScriptRoot "index.html"
$utf8 = New-Object System.Text.UTF8Encoding($false)
$html = [System.IO.File]::ReadAllText($htmlPath, $utf8)

$pattern = 'https://cdn\.imweb\.me/[^"\s]+\.(?:png|jpg|jpeg|gif|svg|webp)'
$urls = [regex]::Matches($html, $pattern) | ForEach-Object { $_.Value } | Sort-Object -Unique

if (-not $urls) {
  Write-Host "No image URLs found (already localized?)."
  exit 0
}

$count = 0
$fail = 0
foreach ($url in $urls) {
  $fname = Split-Path $url -Leaf
  $dest = Join-Path "images" $fname
  Write-Host "downloading: $url"
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    $html = $html.Replace($url, "images/$fname")
    $count++
  } catch {
    Write-Host "  FAILED: $url"
    $fail++
  }
}

[System.IO.File]::WriteAllText($htmlPath, $html, $utf8)
Write-Host "----------------------------------------"
Write-Host "Done: $count downloaded/replaced, $fail failed."
Write-Host "Now commit images\ and index.html with git."
