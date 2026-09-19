$dir = "C:\Users\user\.claude\coilcenter\art"
$out = "C:\Users\user\.claude\coilcenter\assets.js"
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("/* 그림 27장을 data URI로 심어둔다. 이게 있으면 index.html 하나만으로 돈다.")
[void]$sb.AppendLine("   build.sh가 art/ 폴더를 읽어 다시 만든다. 손으로 고치지 말 것. */")
[void]$sb.AppendLine("const ART_DATA = {")
foreach ($f in (Get-ChildItem $dir -Filter *.png | Sort-Object Name)) {
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
  [void]$sb.AppendLine("'$($f.Name)':'data:image/png;base64,$b64',")
}
[void]$sb.AppendLine("};")
[IO.File]::WriteAllText($out, $sb.ToString())
"assets.js: {0} KB" -f [int]((Get-Item $out).Length/1KB)
