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
