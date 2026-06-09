import { prisma } from './prisma';
import {
  MEETING_NOTES_OUTPUT_TEMPLATE,
  MEETING_NOTES_SYSTEM_RULES,
} from '../prompts/summary-meeting-notes';
import {
  SYSTEM_SKILL_BRIEF_ID,
  SYSTEM_SKILL_MEETING_NOTES_ID,
  SYSTEM_TEMPLATE_BRIEF_ID,
  SYSTEM_TEMPLATE_MEETING_NOTES_ID,
} from './summary-template-constants';

const MEETING_STEPS = `### Step 1: 阅读转录
- 提取时间、地点、出席、主持、记录人（缺失标 TBD）
- 按议题归类
- 识别决策、安排、交办事项与责任部门

### Step 2: 按输出模板生成

### Step 3: 质量规则
- 一条一事，避免长段落
- 责任部门无法确定时写（待定）或省略`;

const BRIEF_RULES =
  '请用中文对会议转录生成简要纪要，包含关键要点、主要决策和待办（如有）。忠实于转录，不要编造。';

const BRIEF_OUTPUT = `## 简要纪要

### 关键要点
- …

### 主要决策
- …

### 待办事项
- …`;

/** 确保系统内置 Skill/Template 存在（迁移未跑或内容需同步时） */
export async function ensureSystemSummaryTemplates(): Promise<void> {
  const now = new Date();

  await prisma.summarySkill.upsert({
    where: { id: SYSTEM_SKILL_MEETING_NOTES_ID },
    create: {
      id: SYSTEM_SKILL_MEETING_NOTES_ID,
      slug: 'transcript-to-meeting-notes',
      name: '行政会议纪要',
      rulesMd: MEETING_NOTES_SYSTEM_RULES,
      stepsMd: MEETING_STEPS,
      outputMd: MEETING_NOTES_OUTPUT_TEMPLATE,
      version: 1,
      reviewStatus: 'approved',
      updatedAt: now,
    },
    update: {
      slug: 'transcript-to-meeting-notes',
      name: '行政会议纪要',
      updatedAt: now,
    },
  });

  await prisma.summarySkill.upsert({
    where: { id: SYSTEM_SKILL_BRIEF_ID },
    create: {
      id: SYSTEM_SKILL_BRIEF_ID,
      slug: 'brief-summary',
      name: '简要纪要',
      rulesMd: BRIEF_RULES,
      outputMd: BRIEF_OUTPUT,
      version: 1,
      reviewStatus: 'approved',
      updatedAt: now,
    },
    update: {
      slug: 'brief-summary',
      name: '简要纪要',
      updatedAt: now,
    },
  });

  await prisma.summaryTemplate.upsert({
    where: { id: SYSTEM_TEMPLATE_MEETING_NOTES_ID },
    create: {
      id: SYSTEM_TEMPLATE_MEETING_NOTES_ID,
      skillId: SYSTEM_SKILL_MEETING_NOTES_ID,
      name: '会议纪要（结构化）',
      description: '学校行政例会风格结构化纪要',
      legacySummaryType: 'meeting-notes',
      reviewStatus: 'approved',
      updatedAt: now,
    },
    update: {
      name: '会议纪要（结构化）',
      legacySummaryType: 'meeting-notes',
      updatedAt: now,
    },
  });

  await prisma.summaryTemplate.upsert({
    where: { id: SYSTEM_TEMPLATE_BRIEF_ID },
    create: {
      id: SYSTEM_TEMPLATE_BRIEF_ID,
      skillId: SYSTEM_SKILL_BRIEF_ID,
      name: '简要纪要',
      description: '关键要点与待办简要摘要',
      legacySummaryType: 'brief',
      reviewStatus: 'approved',
      updatedAt: now,
    },
    update: {
      name: '简要纪要',
      legacySummaryType: 'brief',
      updatedAt: now,
    },
  });
}
