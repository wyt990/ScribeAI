'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ManagerSettingsForm } from '@/components/manager-settings-form';
import { managerApi } from '@/lib/manager-api';

export default function ManagerLlmSettingsPage() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const testLlm = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const r = await managerApi.settings.testLlm();
      setTestResult(r.ok ? `成功：${r.preview}` : `失败：${r.error}`);
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : '测试失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">纪要 LLM</h1>
      <ManagerSettingsForm
        group="llm"
        extraActions={
          <Button variant="outline" onClick={() => void testLlm()} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </Button>
        }
      />
      {testResult && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{testResult}</p>}
    </div>
  );
}
