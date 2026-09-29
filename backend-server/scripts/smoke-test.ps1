param([string]$BaseUrl='http://127.0.0.1:8080',[string]$AiUrl='http://127.0.0.1:8001',[string]$StatePath,[switch]$VerifyExisting)
$ErrorActionPreference='Stop'
function Request-Json($Method,$Path,$Body,$Token,$Key) {
    $headers=@{}
    if($Token){$headers.Authorization='Bearer '+$Token}
    if($Key){$headers['Idempotency-Key']=$Key}
    $parameters=@{Method=$Method;Uri=($BaseUrl+$Path);Headers=$headers}
    if($null -ne $Body){$parameters.ContentType='application/json; charset=utf-8';$parameters.Body=[Text.Encoding]::UTF8.GetBytes(($Body|ConvertTo-Json -Depth 20))}
    Invoke-RestMethod @parameters
}
function Check($Condition,$Message){if(-not $Condition){throw $Message}}
if($VerifyExisting){
    if(-not $StatePath){throw 'StatePath is required for persistence verification'}
    $saved=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    $trade=Request-Json 'GET' ('/api/trades/'+$saved.trade_id) $null $saved.access_token $null
    $report=Request-Json 'GET' ('/api/trades/'+$saved.trade_id+'/report') $null $saved.access_token $null
    Check ($trade.analysis_status -eq 'COMPLETED') 'Trade did not survive restart'
    Check ($report.result.trade_id -eq $saved.trade_id) 'Report did not survive restart'
    Check ($report.result.behavior_summary -eq $saved.behavior_summary) 'Stored report changed after restart'
    [pscustomobject]@{result='PASS';check='read after restart';trade_id=$saved.trade_id;executions=@($trade.request.trade.executions).Count}
    return
}
$health=Invoke-RestMethod ($AiUrl+'/health')
Check ($health.analysis_mode -eq 'mock') 'Smoke test requires Mock AI mode to avoid paid model calls'
$session=Request-Json 'POST' '/api/auth/register' @{username='Young demo';email=([guid]::NewGuid().ToString()+'@example.com');password=('Demo-'+[guid]::NewGuid().ToString())} $null $null
$body=Get-Content (Join-Path $PSScriptRoot '../examples/trade.executions.json') -Raw | ConvertFrom-Json
$key=[guid]::NewGuid().ToString()
$trade=Request-Json 'POST' '/api/trades' $body $session.access_token $key
$repeat=Request-Json 'POST' '/api/trades' $body $session.access_token $key
Check ($trade.trade_id -eq $repeat.trade_id) 'Duplicate submission created another trade'
$report=Request-Json 'POST' ('/api/trades/'+$trade.trade_id+'/analysis') $null $session.access_token $null
$cached=Request-Json 'POST' ('/api/trades/'+$trade.trade_id+'/analysis') $null $session.access_token $null
Check ($report.created_at -eq $cached.created_at) 'Analysis retry did not reuse stored report'
$history=Request-Json 'GET' '/api/reports' $null $session.access_token $null
Check (@($history).Count -eq 1) 'Expected one historical sample'
Check ($report.result.execution_summary.buy_count -eq 2) 'AI did not receive both purchases'
Check ($report.result.execution_summary.sell_count -eq 2) 'AI did not receive both sales'
Check ($report.result.execution_summary.remaining_quantity -eq 5) 'Unexpected remaining position'
if($StatePath){
    @{access_token=$session.access_token;trade_id=$trade.trade_id;behavior_summary=$report.result.behavior_summary} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $StatePath -Encoding utf8
}
[pscustomobject]@{result='PASS';check='MySQL and team Mock AI';trade_id=$trade.trade_id;mode=$report.analysis_mode;executions=4;history_samples=@($history).Count;remaining_quantity=$report.result.execution_summary.remaining_quantity}
