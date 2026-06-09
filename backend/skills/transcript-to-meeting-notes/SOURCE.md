# 来源说明

- **Skill 名称**: transcript-to-meeting-notes
- **原作者**: rushikeshpol02
- **原始仓库**（文档引用）:
  - https://github.com/rushikeshpol02/ai-skills/tree/main/cursor/skills/transcript-to-meeting-notes
  - https://github.com/rushikeshpol02/pm-ai-skills（历史路径）
- **本地保存日期**: 2026-06-09
- **项目内路径**: `backend/skills/transcript-to-meeting-notes/`

实施时 GitHub 仓库无法直接访问（404 / Repository not found），本地 `SKILL.md` 与 `templates.md` 根据公开索引页与 skill 描述页摘录整理，并由 `backend/src/prompts/summary-meeting-notes.ts` 引用其结构生成 prompt。

若后续可访问上游仓库，可用以下命令同步：

```bash
export http_proxy=http://10.100.0.109:8081
export https_proxy=http://10.100.0.109:8081
git clone https://github.com/rushikeshpol02/ai-skills.git /tmp/ai-skills
cp /tmp/ai-skills/cursor/skills/transcript-to-meeting-notes/* backend/skills/transcript-to-meeting-notes/
```
