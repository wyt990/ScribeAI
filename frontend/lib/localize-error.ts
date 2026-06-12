/** 将后端英文错误映射为面向用户的中文提示 */
export function localizeError(message: string, code?: string): string {
  if (code === 'SHARE_TOKEN_EXPIRED') {
    return '分享链接已过期，请联系分享者重新生成链接';
  }
  if (code === 'SHARE_TOKEN_INVALID') {
    return '分享链接无效，请检查是否复制完整';
  }
  if (code === 'PDF_FONT_MISSING') {
    return message.includes('字体') ? message : '未找到 PDF 中文字体，请联系管理员配置 PDF_FONT_PATH';
  }

  const table: Array<[RegExp, string]> = [
    [/Summary generation failed/i, '纪要生成失败，请稍后重试'],
    [/Transcript is empty/i, '转录内容为空，无法生成纪要'],
    [/Failed to export summary/i, '导出失败，请稍后重试'],
    [/Invalid or expired share token/i, '分享链接无效或已过期'],
    [/Share token does not match/i, '分享链接与会话不匹配'],
    [/Template not found/i, '未找到纪要模板'],
    [/Unauthorized|Token missing/i, '登录已过期，请重新登录'],
    [/NetworkError|Failed to fetch/i, '网络连接失败，请检查网络后重试'],
  ];

  for (const [pattern, zh] of table) {
    if (pattern.test(message)) return zh;
  }

  if (/[\u4e00-\u9fff]/.test(message)) return message;
  return message || '操作失败，请稍后重试';
}
