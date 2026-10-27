$ErrorActionPreference = 'Stop'
$codexCommand = Get-Command codex.ps1 -ErrorAction Stop
$mcpUrl = 'https://mcp.supabase.com/mcp?project_ref=dwagvpxegvixgztmovyx&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching'
& $codexCommand.Source mcp add supabase --url $mcpUrl
if ($LASTEXITCODE -ne 0) { throw 'MCP configuration was not saved' }
& $codexCommand.Source mcp login supabase
if ($LASTEXITCODE -ne 0) { throw 'Supabase login did not complete' }
Write-Output 'Write-enabled MCP configured for BondCheck. Open a new Codex session after OAuth login to expose its database and deployment tools.'
