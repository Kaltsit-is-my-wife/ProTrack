// Copyright (C) 2026 Free Kaltsit-is-my-wife
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::prelude::*;
use sha2::{Digest, Sha256};

const ENC_PREFIX: &str = "enc:v1:";
const NONCE_LEN: usize = 12;

// ============================================================
// 密钥派生 — SHA-256(USERNAME@COMPUTERNAME:salt)
// ============================================================

fn derive_key() -> [u8; 32] {
    let host = std::env::var("COMPUTERNAME").unwrap_or_default();
    let user = std::env::var("USERNAME").unwrap_or_default();
    let fingerprint = format!("{}@{}:project-tracker-kdf-v1", user, host);
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

// ============================================================
// encrypt_setting — AES-256-GCM 加密
// ============================================================

#[tauri::command]
pub fn encrypt_setting(plaintext: String) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }

    let key = derive_key();
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("创建加密器失败: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce_bytes).map_err(|e| format!("生成随机数失败: {}", e))?;
    #[allow(deprecated)]
    let nonce = Nonce::clone_from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| format!("加密失败: {}", e))?;

    // 格式: enc:v1:<base64(nonce || ciphertext)>
    let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(format!("{}{}", ENC_PREFIX, BASE64_STANDARD.encode(&combined)))
}

// ============================================================
// decrypt_setting — 解密，兼容旧明文
// ============================================================

#[tauri::command]
pub fn decrypt_setting(stored: String) -> Result<String, String> {
    if stored.is_empty() {
        return Ok(String::new());
    }

    // 兼容无前缀的旧明文
    if !stored.starts_with(ENC_PREFIX) {
        return Ok(stored);
    }

    let encoded = stored.strip_prefix(ENC_PREFIX).unwrap_or("");
    let combined = BASE64_STANDARD
        .decode(encoded)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    if combined.len() < NONCE_LEN {
        return Err("加密数据损坏：长度不足".into());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
    #[allow(deprecated)]
    let nonce = Nonce::clone_from_slice(nonce_bytes);

    let key = derive_key();
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("创建解密器失败: {}", e))?;

    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| "密钥不匹配或数据已损坏，请重新输入 API Key".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 解码失败: {}", e))
}
