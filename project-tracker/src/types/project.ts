/** 项目进度状态 */
export type ProjectStatus =
  | "not-started"
  | "in-progress"
  | "nearing-completion"
  | "completed";

/** 项目实体 */
export interface Project {
  id: string;
  name: string;
  path: string; // 绝对路径
  status: ProjectStatus;
  nextSteps: string; // 下一步工作
  notes: string; // 备注
  createdAt: number; // ms timestamp
  updatedAt: number;
}

/** 创建项目时的输入（不包含自动生成的字段） */
export type CreateProjectInput = Omit<
  Project,
  "id" | "createdAt" | "updatedAt"
>;

/** 项目状态标签映射 */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  "not-started": "未开始",
  "in-progress": "进行中",
  "nearing-completion": "即将完成",
  completed: "已完成",
};
