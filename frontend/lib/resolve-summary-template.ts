import { fetchSummaryTemplates, type SummaryTemplateItem } from './summary-templates';

export type ResolvedTemplate = {
  /** 最终确定的 templateId */
  templateId: string;
  /** 是否需要用户弹窗选择（2+ 自定义模板时） */
  needsSelection: boolean;
  /** needsSelection=true 时供模态框展示的候选模板列表 */
  templates?: SummaryTemplateItem[];
};

/**
 * 解析生成纪要时使用的模板。
 *
 * 规则：
 * - 无自定义模板 → 返回系统默认模板（无需选择）
 * - 1 个自定义模板 → 自动使用该模板（无需选择）
 * - 2+ 个自定义模板 → 返回 needsSelection=true 及候选列表，由调用方弹窗让用户选择
 */
export async function resolveSummaryTemplate(): Promise<ResolvedTemplate> {
  const { templates, defaultTemplateId } = await fetchSummaryTemplates();

  const customTemplates = templates.filter((t) => !t.isSystem);

  if (customTemplates.length >= 2) {
    return {
      templateId: defaultTemplateId || customTemplates[0].id,
      needsSelection: true,
      templates: customTemplates,
    };
  }

  if (customTemplates.length === 1) {
    return {
      templateId: customTemplates[0].id,
      needsSelection: false,
    };
  }

  // 无自定义模板 → 用系统默认
  return {
    templateId: defaultTemplateId,
    needsSelection: false,
  };
}
