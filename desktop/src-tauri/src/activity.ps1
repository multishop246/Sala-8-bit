# Read only local accessibility controls. Never emit window titles or chat content.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SalaWindowState {
  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool IsIconic(IntPtr handle);
}
'@
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
        $process = Get-Process -Id $window.Current.ProcessId -ErrorAction SilentlyContinue
        $processName = $process.ProcessName
        # The Codex/Work desktop host can be named ChatGPT.exe. Its lifecycle
        # hooks are authoritative, so never count its window a second time.
        if ($process.Path -match '(?i)[\\/]OpenAI\.Codex_[^\\/]+[\\/]') { continue }
        $nativeAI = $processName -match '(?i)^(chatgpt|claude)$'
        # Browser conversations have separate identifiers supplied by the extension.
        if (-not $nativeAI) { continue }
        $minimized = [SalaWindowState]::IsIconic([IntPtr]$window.Current.NativeWindowHandle)
        $controls = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttons)
        foreach ($control in $controls) {
          # A minimized window is offscreen even while a task is running.
          if (-not $control.Current.IsEnabled) { continue }
          # Electron can retain enabled Stop controls from a finished view.
          # In a restored window, hidden/empty controls are not execution proof.
          # A genuinely minimized window remains eligible for background work.
          if (-not $minimized -and ($control.Current.IsOffscreen -or $control.Current.BoundingRectangle.IsEmpty -or $control.Current.BoundingRectangle.Width -le 0 -or $control.Current.BoundingRectangle.Height -le 0)) { continue }
          # Only explicit execution controls; an open process or CPU activity is not proof.
          if ($control.Current.Name -match '(?i)^(stop|parar|stop generating|stop response|stop streaming|stop generation|parar de gerar|parar resposta|interromper resposta|interromper geracao|interromper geração|cancel task|cancelar tarefa|stop task|parar tarefa)$') {
            # Window fallback only. Per-conversation totals require an adapter
            # for the chat application's execution lifecycle.
            $agents++; break
          }
        }
      } catch { }
    }
  } catch { }
  try { [Console]::WriteLine((@{ agents = $agents; music = $music } | ConvertTo-Json -Compress)) } catch { break }
  Start-Sleep -Seconds 5
}
