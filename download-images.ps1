# 라미한의원 홈페이지 이미지 로컬화 (Windows PowerShell)
# ---------------------------------------------------------
# index.html 이 참조하는 cdn.imweb.me 이미지를 images\ 폴더로 내려받고,
# HTML 안의 URL 을 로컬 경로(images/...)로 바꿔줍니다.
#
# 사용법 (이 저장소 폴더 안에서):
#   powershell -ExecutionPolicy Bypass -File download-images.ps1
#
# 실행 후:
#   git add -A
#   git commit -m "이미지 로컬 보관 및 경로 교체"
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
  Write-Host "이미지 URL을 찾지 못했습니다. 이미 로컬화되었을 수 있습니다."
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
    Write-Host "  실패: $url"
    $fail++
  }
}

[System.IO.File]::WriteAllText($htmlPath, $html, $utf8)
Write-Host "----------------------------------------"
Write-Host "완료: $count개 다운로드/교체, 실패 $fail개"
Write-Host "images\ 폴더와 index.html 변경분을 git에 커밋하세요."
