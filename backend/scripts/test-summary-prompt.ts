/**
 * 本地测试：模板 prompt 构建 +（可选）真实 LLM 调用
 */
import dotenv from "dotenv";
dotenv.config();

import { ensureSystemSummaryTemplates } from "../src/lib/summary-template-seed";
import {
  buildPromptForTemplate,
  resolveTemplateForUser,
} from "../src/lib/summary-template-service";
import { generateSummary } from "../src/lib/summary-llm";
import { SYSTEM_TEMPLATE_MEETING_NOTES_ID } from "../src/lib/summary-template-constants";

const SAMPLE_TRANSCRIPT = `
今天我们讨论了下个季度的产品路线图。张三说用户反馈登录太慢，建议优先做性能优化。
李四认为应该先上线草稿箱功能，因为销售团队已经在演示中承诺了。王五提醒数据库迁移风险较高，需要两周评估。
最后大家同意：第一优先做登录性能优化，本周五前由张三提交方案；草稿箱功能排到四月迭代；数据库迁移方案由王五下周三分享。
`.trim();

async function main() {
  const runLlm = process.argv.includes("--llm");

  await ensureSystemSummaryTemplates();

  console.log("=== buildPromptForTemplate (meeting-notes) ===\n");
  const template = await resolveTemplateForUser("test-user", {
    templateId: SYSTEM_TEMPLATE_MEETING_NOTES_ID,
  });
  const prompt = buildPromptForTemplate(template, SAMPLE_TRANSCRIPT, {
    title: "产品路线图同步会",
    createdAt: new Date("2026-06-09T10:00:00Z"),
    recorderName: "测试记录人",
  });

  console.log("template:", template.name);
  console.log("prompt length:", prompt.length);
  console.log("prompt preview (first 500 chars):\n");
  console.log(prompt.slice(0, 500));
  console.log("\n...\n");

  if (!runLlm) {
    console.log("Add --llm to call the real LLM.");
    return;
  }

  console.log("\n=== generateSummary (LLM) ===\n");
  const result = await generateSummary(prompt);
  console.log(result.slice(0, 800));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
