param(
  [int]$Top = 30,
  [string[]]$Extensions = @('*.ts','*.vue','*.tsx','*.js','*.jsx','*.css','*.scss','*.html'),
  [string[]]$ExcludeDirs = @('node_modules','dist','dist-demo','.git','coverage','__pycache__')
)

$re = ($ExcludeDirs | ForEach-Object { [regex]::Escape($_) }) -join '|'
Get-ChildItem -Recurse -File -Include $Extensions |
  Where-Object { $_.DirectoryName -notmatch $re } |
  Select-Object @{N='Lines';E={@(Get-Content $_.FullName).Length}}, FullName |
  Sort-Object Lines -Descending |
  Select-Object -First $Top |
  Format-Table -AutoSize -Wrap
