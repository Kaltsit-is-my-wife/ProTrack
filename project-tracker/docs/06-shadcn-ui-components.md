# shadcn/ui 组件参考 (v4.13.0 / base-nova)

> **版本**: shadcn v4.13.0, 使用 `@base-ui/react` 底层组件
> **官方文档**: https://ui.shadcn.com/docs/components
> **风格**: `base-nova`（新版风格，基于 Base UI，非 Radix）

---

## 关键差异: shadcn v4 vs v3

| 项目 | v3 | v4 (本项目) |
|------|----|------------|
| 底层组件 | Radix UI | **@base-ui/react** |
| 样式系统 | tailwind.config.js | tailwind.config.js + CSS 变量 |
| 组件生成 | `npx shadcn-ui@latest` | `npx shadcn@latest` |
| 按钮 | `import { Button } from "@radix-ui/react-slot"` | `import { Button as ButtonPrimitive } from "@base-ui/react/button"` |

---

## 已安装的 11 个组件

### 1. Button (`src/components/ui/button.tsx`)
基于 `@base-ui/react/button`，支持变体（variant）和尺寸（size）。

```tsx
import { Button } from '@/components/ui/button';

// 变体
<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="link">Link</Button>

// 尺寸
<Button size="default">Default</Button>
<Button size="xs">Extra Small</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><SettingsIcon /></Button>
```

**Props**: 继承 `ButtonPrimitive.Props`（`@base-ui/react/button` 的 Button 组件 props）+ `VariantProps<typeof buttonVariants>`

---

### 2. Dialog (`src/components/ui/dialog.tsx`)
基于 `@base-ui/react/dialog`。

```tsx
import {
  Dialog, DialogTrigger, DialogContent,
  DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description text</DialogDescription>
    </DialogHeader>
    <div>Body content</div>
    <DialogFooter>
      <DialogClose>Close</DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**导出**: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`

---

### 3. Input (`src/components/ui/input.tsx`)
```tsx
import { Input } from '@/components/ui/input';

<Input
  type="text"
  placeholder="Enter text..."
  onChange={(e) => setValue(e.target.value)}
/>
```
**Props**: `React.ComponentProps<"input">`

---

### 4. Select (`src/components/ui/select.tsx`)
基于 `@base-ui/react/select`。

```tsx
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem, SelectGroup,
  SelectLabel, SelectSeparator
} from '@/components/ui/select';

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Choose..." />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Group 1</SelectLabel>
      <SelectItem value="1">Option 1</SelectItem>
      <SelectItem value="2">Option 2</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

---

### 5. Card (`src/components/ui/card.tsx`)
```tsx
import {
  Card, CardHeader, CardTitle,
  CardDescription, CardContent, CardFooter,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Project Status</CardTitle>
    <CardDescription>Overview of all projects</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

**Props**:
- `Card`: `React.ComponentProps<"div"> & { size?: "default" | "sm" }`
- `CardHeader/CardTitle/CardDescription/CardContent/CardFooter`: `React.ComponentProps<"div">`
- `CardAction`: `React.ComponentProps<"div">`

---

### 6. Label (`src/components/ui/label.tsx`)
```tsx
import { Label } from '@/components/ui/label';

<Label htmlFor="name">Name</Label>
<Input id="name" />
```
**Props**: `React.ComponentProps<"label">`

---

### 7. Textarea (`src/components/ui/textarea.tsx`)
```tsx
import { Textarea } from '@/components/ui/textarea';

<Textarea
  placeholder="Enter notes..."
  rows={4}
/>
```
**Props**: `React.ComponentProps<"textarea">`

---

### 8. Switch (`src/components/ui/switch.tsx`)
基于 `@base-ui/react/switch`。
```tsx
import { Switch } from '@/components/ui/switch';

<Switch checked={enabled} onCheckedChange={setEnabled} />
```

---

### 9. Separator (`src/components/ui/separator.tsx`)
基于 `@base-ui/react/separator`。
```tsx
import { Separator } from '@/components/ui/separator';

<Separator />
<Separator orientation="vertical" />
```

---

### 10. ScrollArea (`src/components/ui/scroll-area.tsx`)
基于 `@base-ui/react/scroll-area`。
```tsx
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

<ScrollArea className="h-[300px]">
  <div>Long content...</div>
</ScrollArea>
```

---

### 11. Badge (`src/components/ui/badge.tsx`)
```tsx
import { Badge } from '@/components/ui/badge';

<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
```

---

## CSS 变量体系

所有颜色通过 CSS 变量定义在 `src/App.css`：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.625rem;
}

.dark {
  --background: 222.2 84% 4.9%;
  /* ... 深色模式变量 */
}
```

---

## 工具函数

```typescript
// src/lib/utils.ts
import { cn } from '@/lib/utils';

// cn() 合并 Tailwind 类名，自动去重
<div className={cn('base-class', isActive && 'active-class', className)} />
```

---

## 添加新组件

```bash
npx shadcn@latest add <component-name>
# 例如: npx shadcn@latest add accordion tabs dropdown-menu tooltip
```

组件会被生成到 `src/components/ui/`，路径别名 `@/components/ui` 解析到该目录。
