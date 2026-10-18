//! Local diagnostic: reports playback booleans only; never reads track metadata.
#[path = "../src/media.rs"] mod media;
fn main() {
    #[cfg(windows)] {
        use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Manager;
        println!("media_init={:?}", unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|e|e.code()));
        println!("audio_sessions={:?}",media::audio_playing().map_err(|e|e.code()));
        match Manager::RequestAsync() {
            Err(e)=>println!("media_request_error={:?}",e.code()),
            Ok(request)=> {
                for _ in 0..100 {
                    if request.Status().map(|x|x.0!=0).unwrap_or(true) { break; }
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                println!("media_request_status={:?}",request.Status().map(|x|x.0).map_err(|e|e.code()));
                println!("media_sessions={:?}",request.GetResults().and_then(|m|m.GetSessions()).and_then(|s|s.Size()).map_err(|e|e.code()));
                if let Ok(sessions)=request.GetResults().and_then(|m|m.GetSessions()) {
                    for index in 0..sessions.Size().unwrap_or(0) {
                        if let Ok(session)=sessions.GetAt(index) {
                            let app=session.SourceAppUserModelId().map(|id|id.to_string().to_ascii_lowercase()).unwrap_or_default();
                            let kind=if app.contains("spotify") {"spotify"} else if ["opera","chrome","edge","firefox"].iter().any(|name|app.contains(name)) {"browser"} else {"other"};
                            let playing=session.GetPlaybackInfo().and_then(|info|info.PlaybackStatus()).map(|status|status==windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);
                            println!("media_source={kind}, playing={:?}",playing.map_err(|e|e.code()));
                        }
                    }
                }
            }
        }
    }
    let probe=media::MediaProbe::spawn();
    for _ in 0..4 {
        std::thread::sleep(std::time::Duration::from_secs(2));
        println!("media_session_available={}, playback_active={}",probe.status().is_some(),probe.playing());
    }
}
