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
