'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { SummaryTemplateItem } from '@/lib/summary-templates';

type TemplateSelectModalProps = {
  open: boolean;
  templates: SummaryTemplateItem[];
  defaultTemplateId: string;
  onConfirm: (templateId: string) => void;
  onCancel: () => void;
};

export function TemplateSelectModal({
  open,
  templates,
  defaultTemplateId,
  onConfirm,
  onCancel,
}: TemplateSelectModalProps) {
  const [selectedId, setSelectedId] = useState(defaultTemplateId);

  useEffect(() => {
    if (open) {
      setSelectedId(defaultTemplateId);
    }
  }, [open, defaultTemplateId]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择纪要模板</DialogTitle>
          <DialogDescription>
            你有多个自定义模板，请选择要使用的模板生成会议纪要。
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selectedId}
          onValueChange={setSelectedId}
          className="space-y-2"
        >
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary"
            >
              <RadioGroupItem value={t.id} id={t.id} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <Label htmlFor={t.id} className="font-medium cursor-pointer">
                  {t.name}
                  {t.id === defaultTemplateId && (
                    <span className="ml-2 text-xs text-muted-foreground">（默认）</span>
                  )}
                </Label>
                {t.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {t.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={() => onConfirm(selectedId)}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
