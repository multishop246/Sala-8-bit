# Read only local accessibility controls. Never emit window titles or chat content.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$root = [System.Windows.Automation.AutomationElement]::RootElement
$buttons = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
while ($true) {
  $agents = 0
  $music = $false
  try {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($window in $windows) {
      try {
        $title = $window.Current.Name
        if ($title -match '(?i)spotify|youtube music|deezer|soundcloud|tidal|apple music') { $music = $true }
        if ($title -notmatch '(?i)chatgpt|claude|codex|gemini|copilot|aider') { continue }
        $controls = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttons)
        foreach ($control in $controls) {
          if (-not $control.Current.IsEnabled -or $control.Current.IsOffscreen) { continue }
          # Only explicit execution controls; an open process or CPU activity is not proof.
          if ($control.Current.Name -match '(?i)^(stop generating|stop response|stop streaming|stop generation|parar de gerar|parar resposta|interromper resposta|interromper geracao|interromper geração|cancel task|cancelar tarefa|stop task|parar tarefa)$') {
            $agents++; break
          }
        }
      } catch { }
    }
  } catch { }
  [Console]::WriteLine((@{ agents = $agents; music = $music } | ConvertTo-Json -Compress))
  Start-Sleep -Seconds 5
}
