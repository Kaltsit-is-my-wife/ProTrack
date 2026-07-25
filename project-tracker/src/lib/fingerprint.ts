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

import type { DirNode } from "@/types/directory";

/**
 * 从目录树构建指纹字符串。
 * 遍历所有文件，收集 (相对路径, 修改时间) 并排序后 JSON 序列化。
 * 用于比对两次扫描之间磁盘是否有变更。
 */
export function buildFingerprint(tree: DirNode): string {
  const entries: Array<[string, number]> = [];

  function walk(node: DirNode, _depth: number) {
    for (const child of node.children ?? []) {
      if (!child.isDir && child.modifiedAt != null) {
        entries.push([child.path, child.modifiedAt]);
      }
      if (child.isDir) {
        walk(child, _depth + 1);
      }
    }
  }

  walk(tree, 0);

  // 排序保证一致
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  return JSON.stringify(entries);
}
