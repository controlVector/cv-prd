use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Store the backend process so we can kill it on exit
struct BackendState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState(Mutex::new(None)))
        .setup(|app| {
            // Start the bundled backend sidecar
            let sidecar = app.shell().sidecar("cvprd-backend").unwrap();

            match sidecar.spawn() {
                Ok((_rx, child)) => {
                    println!("Backend sidecar started successfully (PID: {})", child.pid());
                    // Store the child process handle
                    let state = app.state::<BackendState>();
                    *state.0.lock().unwrap() = Some(child);
                }
                Err(e) => {
                    eprintln!("Failed to start backend sidecar: {}", e);
                    eprintln!("The application may not function correctly without the backend.");
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the backend when the window is destroyed
                if let Some(state) = window.try_state::<BackendState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            println!("Killing backend sidecar...");
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
