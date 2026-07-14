use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

#[derive(Default)]
pub struct AppCloseState {
    authorized: AtomicBool,
}

impl AppCloseState {
    pub fn authorize(&self) {
        self.authorized.store(true, Ordering::Release);
    }

    pub fn take_authorization(&self) -> bool {
        self.authorized.swap(false, Ordering::AcqRel)
    }

    pub fn revoke(&self) {
        self.authorized.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn app_close_after_flush(app: AppHandle) -> AppResult<()> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Other("main window not found".to_string()))?;
    let state = app.state::<AppCloseState>();
    state.authorize();
    if let Err(error) = window.close() {
        state.revoke();
        return Err(AppError::Other(format!("close window: {error}")));
    }
    Ok(())
}
