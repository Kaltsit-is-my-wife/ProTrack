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

import { X, Eye } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

interface Props {
  parentPath: string;
  onClose: () => void;
}

/** 弹出被隐藏文件列表，可选择恢复到思维导图 */
export function HiddenFilesDialog({ parentPath, onClose }: Props) {
  const hiddenFiles = useAppStore((s) => s.hiddenFiles);
  const setHiddenFiles = useAppStore((s) => s.setHiddenFiles);

  const files = hiddenFiles[parentPath] ?? [];

  const restore = (fileName: string) => {
    const updated = files.filter((f) => f !== fileName);
    setHiddenFiles({
      ...hiddenFiles,
      [parentPath]: updated.length > 0 ? updated : [],
    });
    // 清理空条目
    if (updated.length === 0) {
      const copy = { ...hiddenFiles };
      delete copy[parentPath];
      setHiddenFiles(copy);
    }
  };

  const restoreAll = () => {
    const copy = { ...hiddenFiles };
    delete copy[parentPath];
    setHiddenFiles(copy);
  };

  return (
    <div className="hidden-dialog-overlay" onClick={onClose}>
      <div className="hidden-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="hidden-dialog-header">
          <span className="hidden-dialog-title">已隐藏的文件</span>
          <button
            type="button"
            className="hidden-dialog-close"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="hidden-dialog-body">
          {files.length === 0 ? (
            <p className="hidden-dialog-empty">所有文件已恢复</p>
          ) : (
            <div className="hidden-dialog-list">
              {files.map((f) => (
                <div key={f} className="hidden-dialog-row">
                  <span className="hidden-dialog-name">{f}</span>
                  <button
                    type="button"
                    className="hidden-dialog-restore"
                    onClick={() => restore(f)}
                    title="恢复显示"
                  >
                    <Eye className="size-3.5" />
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {files.length > 1 && (
          <div className="hidden-dialog-footer">
            <button
              type="button"
              className="hidden-dialog-restore-all"
              onClick={restoreAll}
            >
              全部恢复
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
