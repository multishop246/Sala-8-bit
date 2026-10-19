param([ValidateSet('codex','claude-code')][string]$Source)
# Lifecycle input may contain a prompt. It is never saved, printed or transmitted.
# This hook writes ONLY a hash, execution flag and process identity locally.
$ErrorActionPreference = 'Stop'
try {
  $inputEvent = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $session = [string]$inputEvent.session_id
  if (-not $session -or $session.Length -gt 256) { exit 0 }
  $eventName = [string]$inputEvent.hook_event_name
  $running = $eventName -in @('UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure')
  if ($eventName -eq 'PostToolUseFailure' -and $inputEvent.is_interrupt) { $running = $false }
  if (-not $running -and $eventName -notin @('Stop','StopFailure','Interrupt','SessionEnd','PermissionRequest','SessionStart','Notification','PostToolUseFailure')) { exit 0 }
  if ($eventName -eq 'Notification' -and [string]$inputEvent.notification_type -notin @('idle_prompt','agent_needs_input','agent_completed','permission_prompt','elicitation_dialog')) { exit 0 }
  # Asking the user a question is not execution. Read tool identity only.
  if ($eventName -eq 'PreToolUse' -and [string]$inputEvent.tool_name -match '(?i)(AskUserQuestion|request_user_input)$') { $running = $false }
  $inputEvent = $null
  $cursor = $PID
  $owner = $null
  for ($i = 0; $i -lt 12; $i++) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $cursor"
    if (-not $current -or -not $current.ParentProcessId) { break }
    $cursor = [int]$current.ParentProcessId
    $parent = Get-Process -Id $cursor -ErrorAction SilentlyContinue
    if (-not $parent) { break }
    # Never guess that a terminal or an arbitrary node.exe is an AI.
    if (($Source -eq 'codex' -and $parent.ProcessName -match '(?i)^codex$') -or
        ($Source -eq 'claude-code' -and $parent.ProcessName -match '(?i)^claude$')) { $owner = $parent; break }
    if ($parent.ProcessName -eq 'node') {
      $nodeProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $cursor"
      $package = if ($Source -eq 'codex') { '@openai[\\/]codex' } else { '@anthropic-ai[\\/]claude-code' }
      if ($nodeProcess.CommandLine -match "node_modules[\\/]$package[\\/]") { $owner = $parent; break }
      $nodeProcess = $null
    }
  }
  if (-not $owner) { exit 0 }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $digest = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes("$Source`:$session")))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
  $epoch = [DateTime]::SpecifyKind([DateTime]'1970-01-01', [DateTimeKind]::Utc)
  $state = @{source=$Source; conversation=$digest; running=$running; pid=$owner.Id; started=[long][Math]::Floor(($owner.StartTime.ToUniversalTime()-$epoch).TotalSeconds); at=[long][Math]::Floor(([DateTime]::UtcNow-$epoch).TotalSeconds)}
  $folder = Join-Path $env:LOCALAPPDATA 'Sala8bit\activity'
  [IO.Directory]::CreateDirectory($folder) | Out-Null
  $target = Join-Path $folder "$Source-$digest.json"
  $temp = "$target.$PID.tmp"
  [IO.File]::WriteAllText($temp, ($state | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temp -Destination $target -Force
} catch { }
# Never block the AI, even when Sala 8-bit is closed or an adapter is unsupported.
exit 0
