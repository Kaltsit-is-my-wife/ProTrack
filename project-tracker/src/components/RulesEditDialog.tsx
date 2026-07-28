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

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// ============================================================
// RulesEditDialog — AI 对话规则编辑弹窗
// ============================================================
export function RulesEditDialog({
  initialRules,
  onSave,
  onClose,
}: {
  initialRules: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialRules);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>AI 对话规则</DialogTitle>
          <DialogDescription>
            针对此项目的 AI 行为约束，将追加在全局提示词之后生效。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="min-h-[180px] font-mono text-xs leading-relaxed"
          placeholder={`例如：\n- 使用 React 18 + TypeScript\n- 不要修改 src/legacy/ 下的文件\n- 数据库使用 PostgreSQL，禁止使用 ORM 的 raw SQL 以外的查询方式`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            className="inline-flex items-center h-7 px-3 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="inline-flex items-center h-7 px-3 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
