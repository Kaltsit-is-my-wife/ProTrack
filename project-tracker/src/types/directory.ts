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
