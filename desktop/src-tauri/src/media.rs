//! System media sessions keep reporting playback when the player is in the tray
//! or its browser tab is not selected. No track titles or artist names are read.
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct MediaProbe(Arc<Mutex<Option<(Instant, bool)>>>);
impl MediaProbe {
    pub fn spawn() -> Self {
        let state = Arc::new(Mutex::new(None));
        #[cfg(windows)]
        {
            let shared = Arc::clone(&state);
            std::thread::spawn(move || {
                use windows::Media::Control::{GlobalSystemMediaTransportControlsSessionManager as Manager, GlobalSystemMediaTransportControlsSessionPlaybackStatus as Playback};
                use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
                if unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_err() { return; }
                let mut last_sound: Option<Instant> = None;
                loop {
                    let read = || -> windows::core::Result<bool> {
                        let request = Manager::RequestAsync()?;
                        let started = Instant::now();
                        while request.Status()?.0 == 0 {
                            if started.elapsed() > Duration::from_secs(2) { return Ok(false); }
                            std::thread::sleep(Duration::from_millis(20));
                        }
                        let sessions = request.GetResults()?.GetSessions()?;
                        for index in 0..sessions.Size()? {
                            if let Ok(info) = sessions.GetAt(index).and_then(|s| s.GetPlaybackInfo()) {
                                if info.PlaybackStatus()? == Playback::Playing { return Ok(true); }
                            }
                        }
                        Ok(false)
                    };
                    let transport=read();
                    let sound=audio_playing();
                    if sound.as_ref().is_ok_and(|v|*v) { last_sound=Some(Instant::now()); }
                    let recent_sound=last_sound.is_some_and(|at|at.elapsed()<Duration::from_secs(8));
                    if transport.is_ok() || sound.is_ok() {
                        let playing=transport.unwrap_or(false) || recent_sound;
                        *shared.lock().unwrap()=Some((Instant::now(),playing));
                    }
                    std::thread::sleep(Duration::from_secs(2));
                }
            });
        }
        Self(state)
    }
    pub fn playing(&self) -> bool {
        self.status().unwrap_or(false)
    }
    pub fn status(&self) -> Option<bool> {
        self.0.lock().unwrap().as_ref().filter(|(at, _)| at.elapsed() < Duration::from_secs(8))
            .map(|(_, playing)| *playing)
    }
}

// WASAPI fallback: reads scalar peaks only, no recording or microphone.
#[cfg(windows)]
pub fn audio_playing() -> windows::core::Result<bool> {
    use windows::core::Interface;
    use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator, IAudioSessionManager2, IAudioSessionControl2, AudioSessionStateActive, DEVICE_STATE_ACTIVE, eRender};
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    let mut system=sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All,true);
    unsafe {
        let enumerator: IMMDeviceEnumerator=CoCreateInstance(&MMDeviceEnumerator,None,CLSCTX_ALL)?;
        let devices=enumerator.EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE)?;
        for index in 0..devices.GetCount()? {
            let Ok(device)=devices.Item(index) else { continue; };
            let Ok(manager)=device.Activate::<IAudioSessionManager2>(CLSCTX_ALL,None) else { continue; };
            let Ok(sessions)=manager.GetSessionEnumerator() else { continue; };
            for index in 0..sessions.GetCount()? {
                let Ok(session)=sessions.GetSession(index) else { continue; };
                if session.GetState()?!=AudioSessionStateActive { continue; }
                let Ok(control)=session.cast::<IAudioSessionControl2>() else { continue; };
                let Some(process)=system.process(sysinfo::Pid::from_u32(control.GetProcessId()?)) else { continue; };
                let name=process.name().to_string_lossy().to_ascii_lowercase();
                if !media_process(&name) { continue; }
                let Ok(meter)=session.cast::<IAudioMeterInformation>() else { continue; };
                if meter.GetPeakValue()?>0.0001 { return Ok(true); }
            }
        }
        Ok(false)
    }
}
fn media_process(name: &str) -> bool {
    let name=name.strip_suffix(".exe").unwrap_or(name);
    ["spotify","spotify music","chrome","msedge","opera","operagx","brave","firefox","vivaldi","deezer","tidal","amazon music","applemusic","music"].contains(&name)
}
#[cfg(test)]
mod tests {
    #[test] fn audio_fallback_only_considers_players_and_browsers() {
        assert!(super::media_process("spotify.exe"));
        assert!(super::media_process("opera.exe"));
        assert!(!super::media_process("notepad.exe"));
    }
}
