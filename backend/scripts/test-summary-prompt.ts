/**
 * 本地测试：prompt 构建 +（可选）真实 LLM 调用
 *
 * 用法:
 *   npx ts-node scripts/test-summary-prompt.ts
 *   npx ts-node scripts/test-summary-prompt.ts --llm
 */
import dotenv from "dotenv";
dotenv.config();

import { buildSummaryPrompt } from "../src/prompts/build-summary-prompt";
import { generateSummary } from "../src/lib/summary-llm";

const SAMPLE_TRANSCRIPT = `
今天我们讨论了下个季度的产品路线图。张三说用户反馈登录太慢，建议优先做性能优化。
李四认为应该先上线草稿箱功能，因为销售团队已经在演示中承诺了。王五提醒数据库迁移风险较高，需要两周评估。
最后大家同意：第一优先做登录性能优化，本周五前由张三提交方案；草稿箱功能排到四月迭代；数据库迁移方案由王五下周三分享。
开放问题：性能优化的目标指标是 P95 还是 P99 还没定。客服负责人谁能参加评审会也还没确认。
`.trim();

async function main() {
  const runLlm = process.argv.includes("--llm");

  console.log("=== buildSummaryPrompt (meeting-notes) ===\n");
  const { summaryType, prompt } = buildSummaryPrompt("meeting-notes", SAMPLE_TRANSCRIPT, {
    title: "产品路线图同步会",
    createdAt: new Date("2026-06-09T10:00:00Z"),
  });

  console.log("summaryType:", summaryType);
  console.log("prompt length:", prompt.length);
  console.log("prompt preview (first 500 chars):\n");
  console.log(prompt.slice(0, 500));
  console.log("\n...\n");

  const requiredSections = [
    "Decisions Made",
    "Topics",
    "What We Know",
    "Open Questions",
    "Agreed Next Steps",
  ];
  for (const section of requiredSections) {
    const ok = prompt.includes(section);
    console.log(`${ok ? "✓" : "✗"} prompt contains: ${section}`);
  }

  if (!runLlm) {
    console.log("\n跳过 LLM 调用。加 --llm 参数可测试真实生成。");
    return;
  }

  console.log("\n=== generateSummary (LLM) ===\n");
  const result = await generateSummary(prompt);
  console.log("result length:", result.length);
  console.log("\n--- output preview ---\n");
  console.log(result.slice(0, 2000));
  if (result.length > 2000) console.log("\n... (truncated)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
