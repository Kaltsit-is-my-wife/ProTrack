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

/** scan_directory 命令返回的树形节点 */
export interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  /** 文件最后修改时间（毫秒时间戳），目录为 undefined */
  modifiedAt?: number;
  /** Rust `skip_serializing_if="Vec::is_empty"` — 空数组时不出现 */
  children?: DirNode[];
}

/** 提取目录名（用于项目默认名称） */
export function getDirName(dirPath: string): string {
  // 去掉末尾的 \ 或 /
  const cleaned = dirPath.replace(/[\\/]+$/, "");
  const segments = cleaned.split(/[\\/]/);
  return segments[segments.length - 1] || cleaned;
}
