use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use keyring::{Entry, Error as KeyringError};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

const STORE_FILE_NAME: &str = "store.json";
const SIGNATURE_DIRECTORY: &str = "signatures";
const KEYRING_SERVICE: &str = "com.amywork.ops-pdf-studio";
const KEYRING_ACCOUNT: &str = "signature-master-key";

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppStorePayload {
    #[serde(default)]
    templates: Vec<serde_json::Value>,
    #[serde(default)]
    fill_profiles: Vec<serde_json::Value>,
    #[serde(default)]
    signature_profiles: Vec<serde_json::Value>,
    #[serde(default)]
    export_history: Vec<serde_json::Value>,
    #[serde(default)]
    signature_assets: Option<serde_json::Map<String, serde_json::Value>>,
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn store_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_dir(app)?;
    Ok(directory.join(STORE_FILE_NAME))
}

fn signatures_dir_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_dir(app)?.join(SIGNATURE_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn load_or_create_key() -> Result<[u8; 32], String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())?;

    let encoded = match entry.get_password() {
        Ok(password) => password,
        Err(KeyringError::NoEntry) => {
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            entry
                .set_password(&BASE64.encode(key))
                .map_err(|error| error.to_string())?;
            BASE64.encode(key)
        }
        Err(error) => return Err(error.to_string()),
    };

    let decoded = BASE64.decode(encoded).map_err(|error| error.to_string())?;
    let key: [u8; 32] = decoded
        .try_into()
        .map_err(|_| String::from("Invalid encryption key length"))?;
    Ok(key)
}

fn encrypt_payload(plain_text: &str) -> Result<String, String> {
    let key = load_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce), plain_text.as_bytes())
        .map_err(|error| error.to_string())?;

    Ok(format!("{}:{}", BASE64.encode(nonce), BASE64.encode(encrypted)))
}

fn decrypt_payload(encrypted_payload: &str) -> Result<String, String> {
    let key = load_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let (nonce_part, body_part) = encrypted_payload
        .split_once(':')
        .ok_or_else(|| String::from("Encrypted payload is malformed"))?;

    let nonce = BASE64.decode(nonce_part).map_err(|error| error.to_string())?;
    let body = BASE64.decode(body_part).map_err(|error| error.to_string())?;
    let decrypted = cipher
        .decrypt(Nonce::from_slice(&nonce), body.as_ref())
        .map_err(|error| error.to_string())?;

    String::from_utf8(decrypted).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_app_store(app: tauri::AppHandle) -> Result<Option<AppStorePayload>, String> {
    let path = store_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let payload = serde_json::from_str::<AppStorePayload>(&content).map_err(|error| error.to_string())?;
    Ok(Some(payload))
}

#[tauri::command]
fn save_app_store(app: tauri::AppHandle, store: AppStorePayload) -> Result<(), String> {
    let path = store_file_path(&app)?;
    let sanitized = AppStorePayload {
        signature_assets: None,
        ..store
    };

    let content = serde_json::to_string_pretty(&sanitized).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_signature_asset(app: tauri::AppHandle, asset_id: String, data_url: String) -> Result<String, String> {
    let encrypted = encrypt_payload(&data_url)?;
    let path = signatures_dir_path(&app)?.join(format!("{asset_id}.sig"));
    fs::write(&path, encrypted).map_err(|error| error.to_string())?;
    Ok(asset_id)
}

#[tauri::command]
fn load_signature_asset(app: tauri::AppHandle, asset_ref: String) -> Result<Option<String>, String> {
    let path = signatures_dir_path(&app)?.join(format!("{asset_ref}.sig"));
    if !path.exists() {
        return Ok(None);
    }

    let encrypted = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(Some(decrypt_payload(&encrypted)?))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_app_store,
            save_app_store,
            save_signature_asset,
            load_signature_asset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
