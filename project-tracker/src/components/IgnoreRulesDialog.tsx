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

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// ============================================================
// Props
// ============================================================

interface IgnoreRulesDialogProps {
  projectName: string;
  initialRules: string;
  onSave: (rules: string) => void;
  onClose: () => void;
}

// ============================================================
// IgnoreRulesDialog
// ============================================================

const HELP_TEXT = `# 语法类似 .gitignore
# dirname/  排除同名目录
# *.ext     排除指定后缀
# name      精确匹配文件/目录名
# 以 # 开头的行为注释，会被忽略`;

export function IgnoreRulesDialog({
  projectName,
  initialRules,
  onSave,
  onClose,
}: IgnoreRulesDialogProps) {
  const [text, setText] = useState(initialRules);

  useEffect(() => {
    setText(initialRules);
  }, [initialRules]);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑排除规则 — {projectName}</DialogTitle>
          <DialogDescription>
            匹配到的目录和文件将不显示在思维导图中
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="min-h-[200px] font-mono text-xs"
          placeholder={HELP_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{HELP_TEXT.split("\n")[0]}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button size="sm" onClick={handleSave}>保存并刷新</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
