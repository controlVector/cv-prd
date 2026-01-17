use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Store the process handles so we can kill them on exit
struct BackendState(Mutex<Option<CommandChild>>);
struct RedisState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState(Mutex::new(None)))
        .manage(RedisState(Mutex::new(None)))
        .setup(|app| {
            // Start Redis with FalkorDB on Linux/macOS (not Windows)
            #[cfg(not(target_os = "windows"))]
            {
                // Get the resource path for the FalkorDB module
                let resource_path = app.path().resource_dir().expect("Failed to get resource dir");
                let falkordb_module = if cfg!(target_os = "macos") {
                    if cfg!(target_arch = "aarch64") {
                        resource_path.join("binaries/falkordb-aarch64-apple-darwin.so")
                    } else {
                        resource_path.join("binaries/falkordb-x86_64-apple-darwin.so")
                    }
                } else {
                    resource_path.join("binaries/falkordb-x86_64-unknown-linux-gnu.so")
                };

                // Get data directory for Redis persistence
                let data_dir = dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("cvprd")
                    .join("redis");
                std::fs::create_dir_all(&data_dir).ok();

                // Start Redis with FalkorDB module
                let redis_sidecar = app.shell().sidecar("redis-server").unwrap();
                let redis_args = vec![
                    "--port".to_string(), "6379".to_string(),
                    "--loadmodule".to_string(), falkordb_module.to_string_lossy().to_string(),
                    "--dir".to_string(), data_dir.to_string_lossy().to_string(),
                    "--daemonize".to_string(), "no".to_string(),
                ];

                match redis_sidecar.args(&redis_args).spawn() {
                    Ok((_rx, child)) => {
                        println!("Redis+FalkorDB sidecar started (PID: {})", child.pid());
                        let state = app.state::<RedisState>();
                        *state.0.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        eprintln!("Failed to start Redis sidecar: {}", e);
                        eprintln!("Graph features will be disabled.");
                    }
                }

                // Wait a moment for Redis to start
                std::thread::sleep(std::time::Duration::from_millis(500));
            }

            // Start the bundled backend sidecar
            let sidecar = app.shell().sidecar("cvprd-backend").unwrap();

            match sidecar.spawn() {
                Ok((_rx, child)) => {
                    println!("Backend sidecar started successfully (PID: {})", child.pid());
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
                // Kill Redis when the window is destroyed
                #[cfg(not(target_os = "windows"))]
                if let Some(state) = window.try_state::<RedisState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            println!("Killing Redis sidecar...");
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
