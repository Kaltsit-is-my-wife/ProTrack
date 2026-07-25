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

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// 日志级别
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

impl Level {
    pub fn as_str(&self) -> &'static str {
        match self {
            Level::Debug => "DEBUG",
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }
}

/// 全局日志器
pub struct Logger {
    log_dir: PathBuf,
    current_file: Mutex<Option<PathBuf>>,
}

impl Logger {
    /// 创建日志目录并返回 Logger
    pub fn new(base_dir: PathBuf) -> Self {
        let log_dir = base_dir.join("log");
        fs::create_dir_all(&log_dir).ok();
        Self {
            log_dir,
            current_file: Mutex::new(None),
        }
    }

    /// 写入一条日志
    pub fn write(&self, level: Level, source: &str, message: &str) {
        let now = chrono_now();
        let line = format!(
            "[{}] [{}] [{}] {}\n",
            now,
            level.as_str(),
            source,
            message
        );

        // 同时输出到 stdout（开发时可在终端看到）
        print!("{}", line);

        // 写入文件
        let file_path = self.ensure_file();
        if let Some(path) = file_path {
            if let Ok(mut f) = OpenOptions::new().append(true).create(true).open(&path) {
                let _ = f.write_all(line.as_bytes());
                let _ = f.flush();
            }
        }
    }

    /// 获取当前日志文件路径（按日期轮转）
    fn ensure_file(&self) -> Option<PathBuf> {
        let today = chrono_date();
        let filename = format!("app_{}.log", today);
        let path = self.log_dir.join(&filename);

        let mut current = self.current_file.lock().ok()?;
        if current.as_ref() != Some(&path) {
            *current = Some(path.clone());
        }
        Some(path)
    }
}

/// 北京时间偏移（秒）
const CST_OFFSET: u64 = 8 * 3600;

/// 生成时间戳 HH:MM:SS（北京时间 UTC+8）
fn chrono_now() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    // 加上 8 小时偏移得到北京时间
    let secs = now.as_secs() + CST_OFFSET;
    let h = (secs / 3600) % 24;
    let m = (secs / 60) % 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// 生成日期 YYYY-MM-DD（北京时间 UTC+8）
fn chrono_date() -> String {
    use std::time::SystemTime;
    let secs = (SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        + std::time::Duration::from_secs(CST_OFFSET))
    .as_secs() as i64;
    let days = secs / 86400;
    let (y, m, d) = days_since_epoch_to_date(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Unix 天数 → (year, month, day)
/// 算法来源: Howard Hinnant's `civil_from_days`
fn days_since_epoch_to_date(days: i64) -> (i64, u32, u32) {
    // 偏移到 0000-03-01 纪元（Hinnant 算法要求）
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
