use crate::app::config::PakeConfig;
use crate::util::{
    check_file_or_append, get_data_dir, get_download_message_with_lang, sanitize_download_filename,
    show_toast, MessageType,
};
#[cfg(target_os = "macos")]
use dispatch::Queue;
#[cfg(target_os = "windows")]
use std::{
    os::windows::ffi::OsStrExt,
    ptr,
    sync::{Once, OnceLock},
};
use std::{
    path::PathBuf,
    str::FromStr,
    sync::atomic::{AtomicU32, Ordering},
};
use tauri::{
    webview::{DownloadEvent, NewWindowFeatures, NewWindowResponse},
    AppHandle, Config, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
#[cfg(target_os = "windows")]
use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Profile7, ICoreWebView2_13};
#[cfg(target_os = "windows")]
use windows::core::{Interface, PCWSTR};

#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::{
    Shell::ExtractIconExW,
    WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
        SendMessageW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, ICON_BIG, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WM_SETICON, WS_EX_APPWINDOW,
        WS_EX_TOOLWINDOW,
    },
};

use tauri::Theme;

#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

#[cfg(any(target_os = "windows", test))]
fn is_youtube_app_navigation(url: &Url) -> bool {
    match url.scheme() {
        "about" => url.as_str() == "about:blank",
        "http" | "https" => url.host_str().is_some_and(|host| {
            host == "youtube.com"
                || host.ends_with(".youtube.com")
                || host == "youtu.be"
                || host.ends_with(".youtu.be")
        }),
        _ => false,
    }
}

#[cfg(target_os = "windows")]
fn bundled_browser_extension_path(app: &AppHandle) -> Option<PathBuf> {
    let extension_dir = app
        .path()
        .resource_dir()
        .ok()?
        .join("extensions/browser-extension");

    extension_dir
        .join("manifest.json")
        .is_file()
        .then_some(extension_dir)
}

#[cfg(any(target_os = "windows", test))]
fn should_defer_youtube_startup(extension_available: bool, url_type: &str) -> bool {
    extension_available && url_type == "web"
}

#[cfg(target_os = "windows")]
fn build_proxy_browser_arg(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    let scheme = url.scheme();
    let port = url.port().or_else(|| match scheme {
        "http" => Some(80),
        "socks5" => Some(1080),
        _ => None,
    })?;

    match scheme {
        "http" | "socks5" => Some(format!("--proxy-server={scheme}://{host}:{port}")),
        _ => None,
    }
}

pub struct MultiWindowState {
    pub pake_config: PakeConfig,
    pub tauri_config: Config,
    next_window_index: AtomicU32,
}

impl MultiWindowState {
    pub fn new(pake_config: PakeConfig, tauri_config: Config) -> Self {
        Self {
            pake_config,
            tauri_config,
            next_window_index: AtomicU32::new(0),
        }
    }

    fn next_window_label(&self) -> String {
        let index = self.next_window_index.fetch_add(1, Ordering::Relaxed) + 1;
        format!("pake-{index}")
    }
}

pub fn set_window(
    app: &AppHandle,
    config: &PakeConfig,
    tauri_config: &Config,
) -> tauri::Result<WebviewWindow> {
    build_window_with_label(app, config, tauri_config, "pake")
}

pub fn open_additional_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let state = app.state::<MultiWindowState>();
    let label = state.next_window_label();
    build_window_with_label(app, &state.pake_config, &state.tauri_config, &label)
}

#[cfg(target_os = "windows")]
fn taskbar_icon_handle() -> Option<isize> {
    static TASKBAR_ICON: OnceLock<Option<isize>> = OnceLock::new();

    *TASKBAR_ICON.get_or_init(|| {
        let executable = match std::env::current_exe() {
            Ok(path) => path,
            Err(error) => {
                eprintln!(
                    "[Pake] Failed to resolve the app executable for its taskbar icon: {error}"
                );
                return None;
            }
        };
        let executable_wide: Vec<u16> = executable
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut large_icon = ptr::null_mut();
        let extracted = unsafe {
            ExtractIconExW(
                executable_wide.as_ptr(),
                0,
                &mut large_icon,
                ptr::null_mut(),
                1,
            )
        };
        if extracted == 0 || large_icon.is_null() {
            eprintln!(
                "[Pake] Failed to extract the taskbar icon from {}.",
                executable.display()
            );
            return None;
        }

        // WM_SETICON keeps this handle rather than copying it. Cache the single
        // extracted icon for the process lifetime so repeated tray restores do
        // not leak a new HICON or leave the window with a dangling handle.
        Some(large_icon as isize)
    })
}

// Apps autostarted at Windows logon can register their icons before Explorer's
// icon cache is ready (#1323). Re-assert both the small/title-bar icon and the
// large taskbar icon whenever a window becomes visible.
#[cfg(target_os = "windows")]
pub fn reapply_window_icon(window: &WebviewWindow) {
    if let Some(icon) = window.app_handle().default_window_icon().cloned() {
        if let Err(error) = window.set_icon(icon) {
            eprintln!("[Pake] Failed to re-apply the window icon: {error}");
        }
    }

    let Some(taskbar_icon) = taskbar_icon_handle() else {
        return;
    };
    match window.hwnd() {
        Ok(hwnd) => unsafe {
            SendMessageW(hwnd.0, WM_SETICON, ICON_BIG as usize, taskbar_icon);
        },
        Err(error) => {
            eprintln!("[Pake] Failed to resolve the window handle for its taskbar icon: {error}");
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn reapply_window_icon(_window: &WebviewWindow) {}

struct WindowBuildOptions<'a> {
    label: &'a str,
    url: WebviewUrl,
    visible: bool,
    new_window_features: Option<NewWindowFeatures>,
}

#[cfg(target_os = "windows")]
fn webview2_indicator_window(hwnd: windows_sys::Win32::Foundation::HWND) -> bool {
    let title_length = unsafe { GetWindowTextLengthW(hwnd) };
    let mut title_buffer = vec![0u16; title_length.max(0) as usize + 1];
    let title_length =
        unsafe { GetWindowTextW(hwnd, title_buffer.as_mut_ptr(), title_buffer.len() as i32) };
    let title = String::from_utf16_lossy(&title_buffer[..title_length.max(0) as usize]);
    let mut class_buffer = vec![0u16; 256];
    let class_length =
        unsafe { GetClassNameW(hwnd, class_buffer.as_mut_ptr(), class_buffer.len() as i32) };
    let class = String::from_utf16_lossy(&class_buffer[..class_length.max(0) as usize]);
    let title = title.to_ascii_lowercase();
    let class = class.to_ascii_lowercase();

    title == "webview2"
        || title.contains("microsoft edge webview2")
        || (class == "chrome_widgetwin_1" && title.contains("screen sharing"))
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn hide_webview2_indicator(
    hwnd: windows_sys::Win32::Foundation::HWND,
    _: isize,
) -> i32 {
    if !webview2_indicator_window(hwnd) {
        return 1;
    }

    let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if style & WS_EX_APPWINDOW as isize == 0 && style & WS_EX_TOOLWINDOW as isize != 0 {
        return 1;
    }

    SetWindowLongPtrW(
        hwnd,
        GWL_EXSTYLE,
        (style & !(WS_EX_APPWINDOW as isize)) | WS_EX_TOOLWINDOW as isize,
    );
    SetWindowPos(
        hwnd,
        std::ptr::null_mut(),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    );
    1
}

#[cfg(target_os = "windows")]
fn start_webview2_taskbar_filter() {
    static STARTED: Once = Once::new();
    STARTED.call_once(|| {
        // ponytail: global 500ms scan; use WinEventHook if this becomes measurable.
        std::thread::spawn(|| loop {
            unsafe {
                EnumWindows(Some(hide_webview2_indicator), 0);
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        });
    });
}

fn open_requested_window(
    app: &AppHandle,
    config: &PakeConfig,
    tauri_config: &Config,
    target_url: Url,
    features: NewWindowFeatures,
) -> tauri::Result<WebviewWindow> {
    let state = app.state::<MultiWindowState>();
    let label = state.next_window_label();
    let window = build_window(
        app,
        config,
        tauri_config,
        WindowBuildOptions {
            label: &label,
            url: WebviewUrl::External(target_url.clone()),
            visible: true,
            new_window_features: Some(features),
        },
    )?;

    let title = target_url.host_str().unwrap_or(target_url.as_str());
    let _ = window.set_title(title);
    reapply_window_icon(&window);
    let _ = window.set_focus();

    Ok(window)
}

/// Open a multi-window clone of the home app. The window is built hidden and
/// revealed on its first real page load (see `lib.rs` on_page_load) so Cmd+N
/// does not flash an empty shell the way the main window used to.
pub fn open_additional_window_safe(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            if let Ok(window) = open_additional_window(&app_handle) {
                // Fallback if PageLoadEvent::Finished never arrives.
                let fallback = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(3_000)).await;
                    reveal_built_window(&fallback);
                });
            }
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(window) = open_additional_window(app) {
            let fallback = window.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(3_000)).await;
                reveal_built_window(&fallback);
            });
        }
    }
}

/// Show a window that was built hidden once content is ready (or the fallback
/// timer fires). No-ops when already visible so page-load and fallback can race.
pub fn reveal_built_window(window: &WebviewWindow) {
    if window.is_visible().unwrap_or(true) {
        return;
    }
    let _ = window.show();
    reapply_window_icon(window);
    let _ = window.set_focus();
}

/// True when any Pake webview window is currently on screen.
///
/// A minimized window does not count. Windows keeps `IsWindowVisible` true while
/// a window is iconic, and `hide_on_close` minimizes before hiding, so treating
/// minimized as visible makes the tray toggle hide an already-invisible window
/// instead of restoring it (#1343).
pub fn any_app_window_visible(app: &AppHandle) -> bool {
    app.webview_windows().values().any(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    })
}

/// Hide every webview window (main + multi-window clones). Used by tray Hide
/// and the activation shortcut so secondary windows are not left on screen.
pub fn hide_all_app_windows(app: &AppHandle) {
    for window in app.webview_windows().values() {
        let _ = window.hide();
    }
}

/// Show every webview window, reassert icons, and focus the main window.
pub fn show_all_app_windows(app: &AppHandle, init_fullscreen: bool) {
    let windows = app.webview_windows();
    for window in windows.values() {
        let _ = window.unminimize();
        let _ = window.show();
        reapply_window_icon(window);
        #[cfg(target_os = "linux")]
        if init_fullscreen && !window.is_fullscreen().unwrap_or(false) {
            let _ = window.set_fullscreen(true);
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = init_fullscreen;

    if let Some(main) = windows.get("pake") {
        let _ = main.set_focus();
    } else if let Some(any) = windows.values().next() {
        let _ = any.set_focus();
    }
}

/// Tray-click / activation-shortcut toggle: hide all if anything is visible,
/// otherwise show all. Cancels startup reveal when the caller has already done
/// so; this helper only touches visibility.
pub fn toggle_all_app_windows(app: &AppHandle, init_fullscreen: bool) {
    if any_app_window_visible(app) {
        hide_all_app_windows(app);
    } else {
        show_all_app_windows(app, init_fullscreen);
    }
}

fn build_window_with_label(
    app: &AppHandle,
    config: &PakeConfig,
    tauri_config: &Config,
    label: &str,
) -> tauri::Result<WebviewWindow> {
    let window_config = config.windows.first().ok_or_else(|| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "pake.json must define at least one window configuration",
        ))
    })?;
    let url = match window_config.url_type.as_str() {
        "web" => {
            let parsed = window_config.url.parse().map_err(|err| {
                tauri::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!(
                        "Invalid 'web' url '{}' in pake.json: {err}",
                        window_config.url
                    ),
                ))
            })?;
            WebviewUrl::App(parsed)
        }
        "local" => WebviewUrl::App(PathBuf::from(&window_config.url)),
        other => {
            return Err(tauri::Error::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("url_type must be 'web' or 'local', got '{other}'"),
            )));
        }
    };

    build_window(
        app,
        config,
        tauri_config,
        WindowBuildOptions {
            label,
            url,
            visible: false,
            new_window_features: None,
        },
    )
}

fn build_window(
    app: &AppHandle,
    config: &PakeConfig,
    tauri_config: &Config,
    opts: WindowBuildOptions,
) -> tauri::Result<WebviewWindow> {
    let WindowBuildOptions {
        label,
        url,
        visible,
        new_window_features,
    } = opts;
    let package_name = tauri_config
        .product_name
        .clone()
        .unwrap_or_else(|| "pake".to_string());
    let _data_dir = get_data_dir(app, package_name).map_err(tauri::Error::Io)?;

    let window_config = config.windows.first().ok_or_else(|| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "pake.json must define at least one window configuration",
        ))
    })?;

    #[cfg(target_os = "macos")]
    let cert_bypass_target = if label == "pake"
        && window_config.ignore_certificate_errors
        && window_config.url_type == "web"
    {
        Url::parse(&window_config.url).ok()
    } else {
        None
    };

    // The delegate must be installed before the first TLS challenge. Start on
    // a neutral page, then navigate from the with_webview callback below.
    #[cfg(target_os = "macos")]
    let url = if cert_bypass_target.is_some() {
        WebviewUrl::CustomProtocol(
            Url::parse("about:blank").expect("about:blank must be a valid URL"),
        )
    } else {
        url
    };

    let user_agent = config.user_agent.get();

    #[cfg(target_os = "windows")]
    let youtube_extension_path = bundled_browser_extension_path(app);

    #[cfg(target_os = "windows")]
    let youtube_target_url =
        should_defer_youtube_startup(youtube_extension_path.is_some(), &window_config.url_type)
            .then(|| match &url {
                WebviewUrl::External(target) => Some(target.clone()),
                _ => Url::parse(&window_config.url).ok(),
            })
            .flatten();

    #[cfg(target_os = "windows")]
    let initial_url = youtube_target_url.as_ref().map_or(url, |_| {
        WebviewUrl::External(Url::parse("about:blank").expect("about:blank must be valid"))
    });

    #[cfg(not(target_os = "windows"))]
    let initial_url = url;

    let config_script = format!(
        "window.pakeConfig = {}",
        serde_json::to_string(&window_config).unwrap_or_else(|_| "{}".to_string())
    );

    // Platform-specific title: macOS prefers empty, others fallback to product name
    let effective_title = window_config.title.as_deref().unwrap_or_else(|| {
        if cfg!(target_os = "macos") {
            ""
        } else {
            tauri_config.product_name.as_deref().unwrap_or("")
        }
    });

    let mut window_builder = WebviewWindowBuilder::new(app, label, initial_url)
        .title(effective_title)
        .visible(visible)
        .user_agent(user_agent)
        .resizable(window_config.resizable)
        .maximized(window_config.maximize);

    #[cfg(target_os = "windows")]
    let youtube_bundle = youtube_extension_path.is_some();
    if youtube_bundle {
        window_builder = window_builder.browser_extensions_enabled(true);
    }

    #[cfg(target_os = "windows")]
    {
        let scale_factor = app
            .primary_monitor()
            .ok()
            .flatten()
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);
        let logical_width = window_config.width / scale_factor;
        let logical_height = window_config.height / scale_factor;
        window_builder = window_builder.inner_size(logical_width, logical_height);
    }

    #[cfg(not(target_os = "windows"))]
    {
        window_builder = window_builder.inner_size(window_config.width, window_config.height);
    }

    window_builder = window_builder
        .always_on_top(window_config.always_on_top)
        .incognito(window_config.incognito);

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        window_builder = window_builder.fullscreen(window_config.fullscreen);
    }

    if window_config.min_width > 0.0 || window_config.min_height > 0.0 {
        let min_w = if window_config.min_width > 0.0 {
            window_config.min_width
        } else {
            window_config.width
        };
        let min_h = if window_config.min_height > 0.0 {
            window_config.min_height
        } else {
            window_config.height
        };
        window_builder = window_builder.min_inner_size(min_w, min_h);
    }

    if !window_config.enable_drag_drop {
        window_builder = window_builder.disable_drag_drop_handler();
    }

    if window_config.new_window {
        let app_handle = app.clone();
        let popup_config = config.clone();
        let popup_tauri_config = tauri_config.clone();
        window_builder = window_builder.on_new_window(move |target_url, features| {
            match open_requested_window(
                &app_handle,
                &popup_config,
                &popup_tauri_config,
                target_url,
                features,
            ) {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    eprintln!("[Pake] Failed to open requested window: {error}");
                    NewWindowResponse::Deny
                }
            }
        });
    }

    // Add initialization scripts. Order matters: pakeConfig must land before
    // any script that reads it (e.g. fullscreen polyfill checks for an opt-out
    // flag), and toast must register `window.pakeToast` before Rust code
    // calls show_toast().
    window_builder = window_builder.initialization_script(&config_script);

    // find.js is opt-in via --enable-find and no-ops at runtime when disabled,
    // so only inject its ~700 lines when the feature is on. Avoids parsing the
    // find UI on every page load in the common (find-off) case. Matches the
    // enable_find gating already applied to the Find menu item.
    if window_config.enable_find {
        window_builder = window_builder.initialization_script(include_str!("../inject/find.js"));
    }

    window_builder = window_builder
        .initialization_script(include_str!("../inject/toast.js"))
        .initialization_script(include_str!("../inject/fullscreen.js"))
        .initialization_script(include_str!("../inject/event.js"))
        .initialization_script(include_str!("../inject/style.js"))
        .initialization_script(include_str!("../inject/theme_refresh.js"))
        .initialization_script(include_str!("../inject/auth.js"))
        .initialization_script(include_str!("../inject/custom.js"));

    #[cfg(target_os = "windows")]
    let mut windows_browser_args = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-blink-features=AutomationControlled");

    #[cfg(target_os = "linux")]
    let mut linux_browser_args = String::from("--disable-blink-features=AutomationControlled");

    if window_config.ignore_certificate_errors {
        #[cfg(target_os = "windows")]
        {
            windows_browser_args.push_str(" --ignore-certificate-errors");
        }

        #[cfg(target_os = "linux")]
        {
            linux_browser_args.push_str(" --ignore-certificate-errors");
        }
    }

    if window_config.enable_wasm {
        #[cfg(target_os = "windows")]
        {
            windows_browser_args.push_str(" --enable-features=SharedArrayBuffer");
            windows_browser_args.push_str(" --enable-unsafe-webgpu");
        }

        #[cfg(target_os = "linux")]
        {
            linux_browser_args.push_str(" --enable-features=SharedArrayBuffer");
            linux_browser_args.push_str(" --enable-unsafe-webgpu");
        }

        #[cfg(target_os = "macos")]
        {
            window_builder = window_builder
                .additional_browser_args("--enable-features=SharedArrayBuffer")
                .additional_browser_args("--enable-unsafe-webgpu");
        }
    }

    let mut parsed_proxy_url: Option<Url> = None;

    // Default to following the system theme (None), only force dark when explicitly set.
    // Computed once; the matching platform block below is the sole consumer.
    let theme = if window_config.dark_mode {
        Some(Theme::Dark)
    } else {
        None // Follow system theme
    };

    // Platform-specific configuration must be set before proxy on Windows/Linux
    #[cfg(target_os = "macos")]
    {
        let title_bar_style = if window_config.hide_title_bar {
            TitleBarStyle::Overlay
        } else {
            TitleBarStyle::Visible
        };
        window_builder = window_builder.title_bar_style(title_bar_style);
        window_builder = window_builder.theme(theme);
    }

    // Windows and Linux: set data_directory before proxy_url
    #[cfg(not(target_os = "macos"))]
    {
        window_builder = window_builder.data_directory(_data_dir).theme(theme);

        if window_config.hide_window_decorations {
            window_builder = window_builder.decorations(false);
        }

        if !config.proxy_url.is_empty() {
            if let Ok(proxy_url) = Url::from_str(&config.proxy_url) {
                parsed_proxy_url = Some(proxy_url.clone());
                #[cfg(target_os = "windows")]
                {
                    if let Some(arg) = build_proxy_browser_arg(&proxy_url) {
                        windows_browser_args.push(' ');
                        windows_browser_args.push_str(&arg);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            window_builder = window_builder.additional_browser_args(&windows_browser_args);
        }

        #[cfg(target_os = "linux")]
        {
            window_builder = window_builder.additional_browser_args(&linux_browser_args);
        }
    }

    // Set proxy after platform-specific configs (required for Windows/Linux)
    if parsed_proxy_url.is_none() && !config.proxy_url.is_empty() {
        if let Ok(proxy_url) = Url::from_str(&config.proxy_url) {
            parsed_proxy_url = Some(proxy_url);
        }
    }

    if let Some(proxy_url) = parsed_proxy_url {
        window_builder = window_builder.proxy_url(proxy_url);
        #[cfg(debug_assertions)]
        println!("Proxy configured: {}", config.proxy_url);
    }

    if let Some(features) = new_window_features {
        // Reuse only opener-provided position/size on macOS; sharing the opener
        // WKWebViewConfiguration triggers duplicate WKScriptMessageHandler
        // registrations on macOS 26+ and crashes the app (issue #1194).
        #[cfg(target_os = "macos")]
        {
            if let Some(position) = features.position() {
                window_builder = window_builder.position(position.x, position.y);
            }

            if let Some(size) = features.size() {
                window_builder = window_builder.inner_size(size.width, size.height);
            }

            window_builder = window_builder.focused(true);
        }

        #[cfg(not(target_os = "macos"))]
        {
            window_builder = window_builder.window_features(features).focused(true);
        }
    }

    // Capture webview-initiated downloads (blob:, data:, Content-Disposition,
    // etc.) and write them to the OS Downloads folder. This is essential for
    // sites with a strict Content-Security-Policy (e.g. Gemini): their
    // `connect-src` blocks Tauri's IPC origin, so downloads cannot be routed
    // through the JS bridge, and downloads triggered from a sandboxed iframe
    // can't reach the IPC either. Letting the browser download natively and
    // catching it here is independent of the page CSP and the IPC channel.
    {
        let download_handle = app.clone();
        window_builder = window_builder.on_download(move |webview, event| match event {
            DownloadEvent::Requested { url, destination } => {
                match download_handle.path().download_dir() {
                    Ok(download_dir) => {
                        let filename = destination
                            .file_name()
                            .map(|name| name.to_string_lossy().to_string())
                            .filter(|name| !name.is_empty())
                            .or_else(|| {
                                url.path_segments()
                                    .and_then(|mut segments| segments.next_back())
                                    .map(|segment| segment.to_string())
                                    .filter(|segment| !segment.is_empty())
                            })
                            .unwrap_or_else(|| "download".to_string());

                        let target = download_dir.join(sanitize_download_filename(&filename));
                        if let Some(path_str) = target.to_str() {
                            *destination = PathBuf::from(check_file_or_append(path_str));
                        }
                    }
                    Err(error) => {
                        eprintln!("[Pake] Failed to resolve download dir: {error}");
                    }
                }
                true
            }
            DownloadEvent::Finished {
                url: _,
                path: _,
                success,
            } => {
                // Toast on the window that started the download (including
                // secondary multi-window labels), not a hard-coded "pake".
                let toast_window = download_handle
                    .get_webview_window(webview.label())
                    .or_else(|| download_handle.get_webview_window("pake"));
                if let Some(window) = toast_window {
                    let message_type = if success {
                        MessageType::Success
                    } else {
                        MessageType::Failure
                    };
                    show_toast(&window, &get_download_message_with_lang(message_type, None));
                }
                true
            }
            _ => true,
        });
    }

    #[cfg(target_os = "windows")]
    {
        window_builder = window_builder
            .on_navigation(move |url| !youtube_bundle || is_youtube_app_navigation(url));
    }

    #[cfg(not(target_os = "windows"))]
    {
        window_builder = window_builder.on_navigation(|_| true);
    }

    let window = window_builder.build()?;

    #[cfg(target_os = "windows")]
    start_webview2_taskbar_filter();

    #[cfg(target_os = "windows")]
    if let (Some(extension_path), Some(target_url)) = (youtube_extension_path, youtube_target_url) {
        configure_youtube_extension(&window, extension_path, target_url);
    }

    // macOS WKWebView ignores the Chromium --ignore-certificate-errors flag, so
    // install a host-scoped delegate on the process-lifetime main window only.
    // Queue setup after construction so wry cannot replace the proxy while it
    // finishes initializing its own navigation delegate.
    #[cfg(target_os = "macos")]
    if let Some(target_url) = cert_bypass_target {
        let allowed_host = target_url
            .host_str()
            .expect("web URLs must have a host")
            .to_owned();
        let cert_window = window.clone();
        Queue::main().exec_async(move || {
            if let Err(error) = cert_window.with_webview(move |webview| {
                if !crate::app::cert::install_cert_bypass_and_navigate(
                    webview.inner(),
                    allowed_host,
                    target_url.to_string(),
                ) {
                    eprintln!("[Pake] Failed to configure macOS certificate bypass.");
                }
            }) {
                eprintln!("[Pake] Failed to access the macOS webview: {error}");
            }
        });
    }

    Ok(window)
}

#[cfg(target_os = "windows")]
fn configure_youtube_extension(window: &WebviewWindow, extension_path: PathBuf, target_url: Url) {
    use webview2_com::ProfileAddBrowserExtensionCompletedHandler;

    let target = target_url.to_string();
    let path = extension_path.to_string_lossy().to_string();
    let callback_window = window.clone();
    let result = window.with_webview(move |webview| {
        let controller = webview.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
            show_youtube_extension_error(&callback_window, "WebView2 core is unavailable.");
            return;
        };
        let Ok(core13) = core.cast::<ICoreWebView2_13>() else {
            show_youtube_extension_error(
                &callback_window,
                "WebView2 Runtime 120 or newer is required.",
            );
            return;
        };
        let Ok(profile) = (unsafe { core13.Profile() }) else {
            show_youtube_extension_error(&callback_window, "WebView2 profile is unavailable.");
            return;
        };
        let Ok(profile7) = profile.cast::<ICoreWebView2Profile7>() else {
            show_youtube_extension_error(
                &callback_window,
                "WebView2 Runtime 120 or newer is required.",
            );
            return;
        };
        let extension_path: Vec<u16> = std::ffi::OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let completion_window = callback_window.clone();
        let target = target.clone();
        let handler = ProfileAddBrowserExtensionCompletedHandler::create(Box::new(
            move |error_code, _extension| {
                if error_code.is_ok() {
                    match Url::parse(&target) {
                        Ok(url) => {
                            if let Err(error) = completion_window.navigate(url) {
                                eprintln!(
                                    "[Pake] Failed to navigate after loading Adblock: {error}"
                                );
                                show_youtube_extension_error(
                                    &completion_window,
                                    "Adblock loaded, but YouTube could not be opened.",
                                );
                            }
                        }
                        Err(error) => {
                            eprintln!("[Pake] Invalid deferred YouTube URL: {error}");
                            show_youtube_extension_error(
                                &completion_window,
                                "Adblock loaded, but the YouTube URL is invalid.",
                            );
                        }
                    }
                } else {
                    show_youtube_extension_error(
                        &completion_window,
                        "Adblock could not be loaded. YouTube was not opened.",
                    );
                }
                Ok(())
            },
        ));
        if let Err(error) =
            unsafe { profile7.AddBrowserExtension(PCWSTR(extension_path.as_ptr()), &handler) }
        {
            show_youtube_extension_error(
                &callback_window,
                &format!("Adblock could not be loaded: {error}"),
            );
        }
    });
    if let Err(error) = result {
        eprintln!("[Pake] Failed to access WebView2 while loading Adblock: {error}");
        show_youtube_extension_error(
            window,
            "Adblock could not be loaded. YouTube was not opened.",
        );
    }
}

#[cfg(target_os = "windows")]
fn show_youtube_extension_error(window: &WebviewWindow, message: &str) {
    let message = serde_json::to_string(message)
        .unwrap_or_else(|_| "\"Adblock could not be loaded. YouTube was not opened.\"".to_string());
    let script = format!(
        "document.body.replaceChildren();const main=document.createElement('main');main.style.cssText='font:16px sans-serif;padding:32px';const heading=document.createElement('h1');heading.textContent='YouTube protection unavailable';const detail=document.createElement('p');detail.textContent={message};main.append(heading,detail);document.body.append(main);"
    );
    if let Err(error) = window.eval(&script) {
        eprintln!("[Pake] Failed to render Adblock error page: {error}");
    }
}

#[cfg(all(test, target_os = "windows"))]
mod proxy_arg_tests {
    use super::*;

    fn parse(url: &str) -> Url {
        Url::from_str(url).unwrap()
    }

    #[test]
    fn http_url_with_explicit_port() {
        let arg = build_proxy_browser_arg(&parse("http://127.0.0.1:7890")).unwrap();
        assert_eq!(arg, "--proxy-server=http://127.0.0.1:7890");
    }

    #[test]
    fn http_url_uses_default_port_when_missing() {
        let arg = build_proxy_browser_arg(&parse("http://proxy.local")).unwrap();
        assert_eq!(arg, "--proxy-server=http://proxy.local:80");
    }

    #[test]
    fn socks5_url_uses_default_port_when_missing() {
        let arg = build_proxy_browser_arg(&parse("socks5://proxy.local")).unwrap();
        assert_eq!(arg, "--proxy-server=socks5://proxy.local:1080");
    }

    #[test]
    fn https_scheme_is_not_supported_yet() {
        // https proxies fall back to platform proxy_url; we only emit a CLI arg
        // for http/socks5 today.
        assert!(build_proxy_browser_arg(&parse("https://proxy.local:8443")).is_none());
    }
}

#[cfg(test)]
mod youtube_navigation_tests {
    use super::*;

    fn parse(url: &str) -> Url {
        Url::from_str(url).unwrap()
    }

    #[test]
    fn allows_youtube_hosts_and_short_links() {
        assert!(is_youtube_app_navigation(&parse(
            "https://www.youtube.com/"
        )));
        assert!(is_youtube_app_navigation(&parse(
            "https://music.youtube.com/watch?v=abc"
        )));
        assert!(is_youtube_app_navigation(&parse("https://youtu.be/abc")));
    }

    #[test]
    fn rejects_lookalikes_and_external_hosts() {
        assert!(!is_youtube_app_navigation(&parse(
            "https://youtube.com.evil.test/"
        )));
        assert!(!is_youtube_app_navigation(&parse(
            "https://accounts.google.com/"
        )));
        assert!(!is_youtube_app_navigation(&parse("https://example.com/")));
    }

    #[test]
    fn only_allows_the_blank_about_page() {
        assert!(is_youtube_app_navigation(&parse("about:blank")));
        assert!(!is_youtube_app_navigation(&parse("about:srcdoc")));
    }

    #[test]
    fn defers_web_navigation_only_when_extension_is_available() {
        assert!(should_defer_youtube_startup(true, "web"));
        assert!(!should_defer_youtube_startup(false, "web"));
        assert!(!should_defer_youtube_startup(true, "local"));
    }
}
