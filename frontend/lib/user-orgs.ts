export type UserOrg = {
  organizationId: string;
  name: string;
  industry: string | null;
  description: string | null;
  jobTitle: string | null;
  responsibilities: string | null;
  isDefault: boolean;
};

export type CreateOrgInput = {
  name: string;
  industry?: string;
  description?: string;
  jobTitle?: string;
  responsibilities?: string;
  setAsDefault?: boolean;
};

export type UpdateOrgInput = {
  jobTitle?: string;
  responsibilities?: string;
  setAsDefault?: boolean;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('未登录');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** 获取用户所有绑定的组织 */
export async function fetchUserOrgs(): Promise<UserOrg[]> {
  const res = await fetch('/api/user-orgs', { headers: authHeaders() });
  if (!res.ok) throw new Error('加载组织列表失败');
  return res.json();
}

/** 获取用户默认组织 */
export async function fetchDefaultOrg(): Promise<{ organization: UserOrg | null }> {
  const res = await fetch('/api/user-orgs/default', { headers: authHeaders() });
  if (!res.ok) return { organization: null };
  return res.json();
}

/** 创建组织并绑定到当前用户 */
export async function createUserOrg(input: CreateOrgInput): Promise<UserOrg> {
  const res = await fetch('/api/user-orgs', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '创建组织失败');
  }
  return res.json();
}

/** 更新用户在某个组织中的信息 */
export async function updateUserOrg(
  orgId: string,
  input: UpdateOrgInput
): Promise<UserOrg> {
  const res = await fetch(`/api/user-orgs/${orgId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '更新组织信息失败');
  }
  return res.json();
}

/** 解绑组织 */
export async function deleteUserOrg(orgId: string): Promise<void> {
  const res = await fetch(`/api/user-orgs/${orgId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || '解绑组织失败');
  }
}
