// "Diesen Rechner als Server": the program puts the self-hosting package (selfhost/ in the repository, built into the
// program) into ~/HiveVoice-Server and runs its setup.sh with the published app image, so nobody needs the source code.
// Docker must be installed; the setting page of the site starts it, shows the progress and the address (capabilities/server.json).
// The data stays in ~/HiveVoice-Server/data; removing the program does not touch it.
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const FILES: &[(&str, &str)] = &[
    ("compose.yml", include_str!("../../../selfhost/compose.yml")),
    ("Caddyfile", include_str!("../../../selfhost/Caddyfile")),
    ("setup.sh", include_str!("../../../selfhost/setup.sh")),
    ("backup.sh", include_str!("../../../selfhost/backup.sh")),
    ("db/roles.sql", include_str!("../../../selfhost/db/roles.sql")),
    ("db/jwt.sql", include_str!("../../../selfhost/db/jwt.sql")),
    ("tailscale/funnel.json", include_str!("../../../selfhost/tailscale/funnel.json")),
];
const IMAGE: &str = "ghcr.io/dafiiit/hivevoice:latest";

/// Whether a setup is running right now (one at a time).
#[derive(Default)]
pub struct Busy(Mutex<bool>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    supported: bool,
    docker: bool,
    configured: bool,
    running: bool,
    busy: bool,
    url: Option<String>,
    mode: Option<String>,
    folder: String,
    log: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Setup {
    mode: String,
    admin: String,
    ts_authkey: Option<String>,
    cf_token: Option<String>,
    public_url: Option<String>,
    domain: Option<String>,
}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().home_dir().map_err(|e| e.to_string())?.join("HiveVoice-Server"))
}

/// Programs started from the Dock or Finder do not get the shell's PATH; Docker lives in one of these.
fn path_env() -> String {
    let extra = ["/usr/local/bin", "/opt/homebrew/bin", "/Applications/Docker.app/Contents/Resources/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
    let mut parts: Vec<String> = extra.iter().map(|s| s.to_string()).collect();
    if let Ok(p) = std::env::var("PATH") { parts.push(p); }
    parts.join(":")
}

fn docker_ok() -> bool {
    Command::new("docker").arg("info").env("PATH", path_env()).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false)
}

fn setting(dir: &PathBuf, key: &str) -> Option<String> {
    let text = fs::read_to_string(dir.join(".env")).ok()?;
    text.lines().find_map(|l| l.strip_prefix(&format!("{key}=")).map(|v| v.to_string())).filter(|v| !v.is_empty())
}

/// Puts the package's files in place (again, so an update of the program brings their new version along).
fn unpack(dir: &PathBuf) -> Result<(), String> {
    for (name, text) in FILES {
        let path = dir.join(name);
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        fs::write(&path, text).map_err(|e| e.to_string())?;
    }
    #[cfg(unix)]
    for script in ["setup.sh", "backup.sh"] {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dir.join(script), fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn server_status(app: AppHandle, busy: State<'_, Busy>) -> Result<Status, String> {
    let dir = folder(&app)?;
    let docker = docker_ok();
    let running = docker && dir.join("compose.yml").exists() && Command::new("docker")
        .args(["compose", "ps", "--status", "running", "--services"]).current_dir(&dir).env("PATH", path_env())
        .output().map(|o| String::from_utf8_lossy(&o.stdout).lines().any(|l| l.trim() == "app")).unwrap_or(false);
    let log = fs::read_to_string(dir.join("setup.log")).unwrap_or_default();
    let tail: Vec<&str> = log.lines().rev().take(12).collect();
    Ok(Status {
        supported: cfg!(unix),
        docker,
        configured: setting(&dir, "PUBLIC_URL").is_some(),
        running,
        busy: *busy.0.lock().unwrap(),
        url: setting(&dir, "PUBLIC_URL"),
        mode: setting(&dir, "MODE"),
        folder: dir.display().to_string(),
        log: tail.into_iter().rev().collect::<Vec<_>>().join("\n"),
    })
}

/// Sets up (or updates) and starts the server in the background; the page asks server_status for the progress.
#[tauri::command]
pub async fn server_setup(app: AppHandle, busy: State<'_, Busy>, setup: Setup) -> Result<(), String> {
    if !cfg!(unix) { return Err("windows".into()); }
    if !docker_ok() { return Err("docker".into()); }
    if !["local", "tailscale", "cloudflare", "domain"].contains(&setup.mode.as_str()) || !setup.admin.contains('@') { return Err("invalid".into()); }
    {
        let mut b = busy.0.lock().unwrap();
        if *b { return Err("busy".into()); }
        *b = true;
    }
    let dir = folder(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    unpack(&dir)?;
    let mut args = vec!["setup.sh".to_string(), "--yes".into(), "--image".into(), IMAGE.into(), "--mode".into(), setup.mode, "--admin".into(), setup.admin];
    for (flag, value) in [("--ts-authkey", setup.ts_authkey), ("--cf-token", setup.cf_token), ("--public-url", setup.public_url), ("--domain", setup.domain)] {
        if let Some(v) = value.filter(|v| !v.trim().is_empty()) { args.push(flag.into()); args.push(v.trim().to_string()); }
    }
    let log = fs::File::create(dir.join("setup.log")).map_err(|e| e.to_string())?;
    let err = log.try_clone().map_err(|e| e.to_string())?;
    let handle = app.clone();
    std::thread::spawn(move || {
        let ok = Command::new("bash").args(&args).current_dir(&dir).env("PATH", path_env())
            .stdout(Stdio::from(log)).stderr(Stdio::from(err)).status().map(|s| s.success()).unwrap_or(false);
        if !ok {
            if let Ok(mut f) = fs::OpenOptions::new().append(true).open(dir.join("setup.log")) { let _ = writeln!(f, "\n(Einrichtung abgebrochen)"); }
        }
        *handle.state::<Busy>().0.lock().unwrap() = false;
    });
    Ok(())
}

/// Stops the server (the data stays).
#[tauri::command]
pub async fn server_stop(app: AppHandle) -> Result<(), String> {
    let dir = folder(&app)?;
    let ok = Command::new("bash").args(["setup.sh", "--stop"]).current_dir(&dir).env("PATH", path_env()).status().map(|s| s.success()).unwrap_or(false);
    if ok { Ok(()) } else { Err("stop".into()) }
}
