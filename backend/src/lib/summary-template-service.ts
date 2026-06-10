import { prisma } from './prisma';
import {
  DEFAULT_LEGACY_SUMMARY_TYPE,
  isLegacySummaryType,
  legacyTypeToSystemTemplateId,
  SYSTEM_TEMPLATE_MEETING_NOTES_ID,
} from './summary-template-constants';
import { buildPromptFromTemplate, type SummaryPromptMeta } from './summary-prompt-builder';

const MAX_FIELD_LEN = 50_000;

export type TemplateWithSkill = {
  id: string;
  userId: string | null;
  skillId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isPublic: boolean;
  reviewStatus: string;
  legacySummaryType: string | null;
  skill: {
    id: string;
    slug: string;
    name: string;
    rulesMd: string;
    stepsMd: string | null;
    outputMd: string;
    version: number;
    parentId: string | null;
  };
};

export function formatTemplateListItem(t: TemplateWithSkill) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    isDefault: t.isDefault,
    isPublic: t.isPublic,
    reviewStatus: t.reviewStatus,
    isSystem: t.userId === null,
    legacySummaryType: t.legacySummaryType,
    skillVersion: t.skill.version,
  };
}

async function loadTemplateWithSkill(templateId: string): Promise<TemplateWithSkill | null> {
  return prisma.summaryTemplate.findUnique({
    where: { id: templateId },
    include: {
      skill: {
        select: {
          id: true,
          slug: true,
          name: true,
          rulesMd: true,
          stepsMd: true,
          outputMd: true,
          version: true,
          parentId: true,
        },
      },
    },
  }) as Promise<TemplateWithSkill | null>;
}

export function canAccessTemplate(template: TemplateWithSkill, userId: string): boolean {
  if (template.userId === null) return true;
  if (template.userId === userId) return true;
  if (template.isPublic && template.reviewStatus === 'approved') return true;
  return false;
}

export async function listTemplatesForUser(userId: string) {
  const rows = await prisma.summaryTemplate.findMany({
    where: {
      OR: [
        { userId: null },
        { userId },
        { isPublic: true, reviewStatus: 'approved' },
      ],
    },
    include: {
      skill: {
        select: {
          id: true,
          slug: true,
          name: true,
          rulesMd: true,
          stepsMd: true,
          outputMd: true,
          version: true,
          parentId: true,
        },
      },
    },
    orderBy: [{ userId: 'asc' }, { name: 'asc' }],
  });
  return (rows as TemplateWithSkill[]).map(formatTemplateListItem);
}

export async function getTemplateForUser(
  templateId: string,
  userId: string
): Promise<TemplateWithSkill | null> {
  const t = await loadTemplateWithSkill(templateId);
  if (!t || !canAccessTemplate(t, userId)) return null;
  return t;
}

export type ResolveTemplateInput = {
  templateId?: string | null;
  summaryType?: string | null;
};

/** 解析生成纪要所用模板：templateId 优先，其次 legacy summaryType，最后用户默认或系统默认 */
export async function resolveTemplateForUser(
  userId: string,
  input: ResolveTemplateInput
): Promise<TemplateWithSkill> {
  if (input.templateId) {
    const t = await getTemplateForUser(input.templateId, userId);
    if (!t) throw new Error('Template not found');
    return t;
  }

  if (input.summaryType && isLegacySummaryType(input.summaryType)) {
    const systemId = legacyTypeToSystemTemplateId(input.summaryType);
    const t = await loadTemplateWithSkill(systemId);
    if (!t) throw new Error('System template not found');
    return t;
  }

  const userDefault = await prisma.summaryTemplate.findFirst({
    where: { userId, isDefault: true },
    include: {
      skill: {
        select: {
          id: true,
          slug: true,
          name: true,
          rulesMd: true,
          stepsMd: true,
          outputMd: true,
          version: true,
          parentId: true,
        },
      },
    },
  });
  if (userDefault) return userDefault as TemplateWithSkill;

  const fallback = await loadTemplateWithSkill(SYSTEM_TEMPLATE_MEETING_NOTES_ID);
  if (!fallback) throw new Error('Default template not found');
  return fallback;
}

export async function getUserDefaultTemplateId(userId: string): Promise<string> {
  const t = await resolveTemplateForUser(userId, {});
  return t.id;
}

export function buildPromptForTemplate(
  template: TemplateWithSkill,
  fullText: string,
  meta: SummaryPromptMeta
): string {
  return buildPromptFromTemplate(template.skill, fullText, meta);
}

function clampField(value: string, max = MAX_FIELD_LEN): string {
  return value.slice(0, max);
}

export async function forkTemplate(
  sourceTemplateId: string,
  userId: string,
  opts?: { name?: string }
): Promise<TemplateWithSkill> {
  const source = await getTemplateForUser(sourceTemplateId, userId);
  if (!source) throw new Error('Template not found');

  const baseName = opts?.name?.trim() || `${source.name}（我的副本）`;

  const skill = await prisma.summarySkill.create({
    data: {
      userId,
      slug: `${source.skill.slug}-fork-${Date.now()}`,
      name: `${source.skill.name}（副本）`,
      rulesMd: source.skill.rulesMd,
      stepsMd: source.skill.stepsMd,
      outputMd: source.skill.outputMd,
      parentId: source.skill.id,
      version: 1,
      reviewStatus: 'approved',
    },
  });

  const template = await prisma.summaryTemplate.create({
    data: {
      userId,
      skillId: skill.id,
      name: baseName,
      description: source.description,
      reviewStatus: 'approved',
    },
    include: {
      skill: {
        select: {
          id: true,
          slug: true,
          name: true,
          rulesMd: true,
          stepsMd: true,
          outputMd: true,
          version: true,
          parentId: true,
        },
      },
    },
  });

  return template as TemplateWithSkill;
}

export async function updateTemplateSkill(
  templateId: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    rulesMd?: string;
    stepsMd?: string;
    outputMd?: string;
  }
): Promise<TemplateWithSkill> {
  const template = await getTemplateForUser(templateId, userId);
  if (!template) throw new Error('Template not found');
  if (template.userId !== userId) {
    throw new Error('Cannot edit system or shared templates directly; fork first');
  }

  const skillUpdate: Record<string, string | null> = {};
  if (data.rulesMd !== undefined) skillUpdate.rulesMd = clampField(data.rulesMd);
  if (data.stepsMd !== undefined) skillUpdate.stepsMd = clampField(data.stepsMd) || null;
  if (data.outputMd !== undefined) skillUpdate.outputMd = clampField(data.outputMd);

  if (Object.keys(skillUpdate).length > 0) {
    await prisma.summarySkill.update({
      where: { id: template.skillId },
      data: {
        ...skillUpdate,
        version: { increment: 1 },
      },
    });
  }

  const tplUpdate: Record<string, string> = {};
  if (data.name?.trim()) tplUpdate.name = data.name.trim().slice(0, 120);
  if (data.description !== undefined) {
    tplUpdate.description = clampField(data.description, 2000);
  }

  const updated = await prisma.summaryTemplate.update({
    where: { id: templateId },
    data: tplUpdate,
    include: {
      skill: {
        select: {
          id: true,
          slug: true,
          name: true,
          rulesMd: true,
          stepsMd: true,
          outputMd: true,
          version: true,
          parentId: true,
        },
      },
    },
  });

  return updated as TemplateWithSkill;
}

export async function setUserDefaultTemplate(
  templateId: string,
  userId: string
): Promise<void> {
  const template = await getTemplateForUser(templateId, userId);
  if (!template) throw new Error('Template not found');

  await prisma.$transaction([
    prisma.summaryTemplate.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    }),
    ...(template.userId === userId
      ? [
          prisma.summaryTemplate.update({
            where: { id: templateId },
            data: { isDefault: true },
          }),
        ]
      : []),
  ]);

  if (template.userId !== userId) {
    const forked = await forkTemplate(templateId, userId, {
      name: template.name,
    });
    await prisma.$transaction([
      prisma.summaryTemplate.updateMany({
        where: { userId, isDefault: true, id: { not: forked.id } },
        data: { isDefault: false },
      }),
      prisma.summaryTemplate.update({
        where: { id: forked.id },
        data: { isDefault: true },
      }),
    ]);
  }
}

export async function deleteUserTemplate(
  templateId: string,
  userId: string
): Promise<void> {
  const template = await prisma.summaryTemplate.findUnique({
    where: { id: templateId },
    include: { skill: true },
  });
  if (!template || template.userId !== userId) {
    throw new Error('Template not found or not owned by user');
  }

  const used = await prisma.summary.count({ where: { templateId } });
  if (used > 0) {
    throw new Error('Template is in use by existing summaries and cannot be deleted');
  }

  await prisma.$transaction([
    prisma.summaryTemplate.delete({ where: { id: templateId } }),
    prisma.summarySkill.delete({ where: { id: template.skillId } }),
  ]);
}

export function templateLegacyType(template: TemplateWithSkill): string {
  return template.legacySummaryType ?? template.id;
}

export function formatSummaryResponse(
  summary: {
    text: string;
    templateId: string;
    templateVersion: number;
    summaryType: string;
    orgId?: string | null;
  },
  template: Pick<TemplateWithSkill, 'id' | 'name' | 'legacySummaryType'>
) {
  return {
    summary: summary.text,
    templateId: template.id,
    templateName: template.name,
    templateVersion: summary.templateVersion,
    summaryType: template.legacySummaryType ?? summary.summaryType,
    summaryTypeLabel: template.name,
    orgId: summary.orgId ?? null,
  };
}
