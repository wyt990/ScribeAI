import express from 'express';
import { prisma } from '../lib/prisma';
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';

const router = express.Router();

/** 列出当前用户绑定的组织及职务/职责信息 */
router.get('/', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const orgs = await prisma.userOrganization.findMany({
      where: { userId },
      include: {
        organization: {
          select: { id: true, name: true, industry: true, description: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { organization: { name: 'asc' } }],
    });

    res.json(
      orgs.map((uo) => ({
        organizationId: uo.organizationId,
        name: uo.organization.name,
        industry: uo.organization.industry,
        description: uo.organization.description,
        jobTitle: uo.jobTitle,
        responsibilities: uo.responsibilities,
        isDefault: uo.isDefault,
      }))
    );
  } catch (err) {
    console.error('[UserOrgs] list error:', err);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

/** 获取用户默认组织 */
router.get('/default', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const uo = await prisma.userOrganization.findFirst({
      where: { userId, isDefault: true },
      include: {
        organization: {
          select: { id: true, name: true, industry: true, description: true },
        },
      },
    });

    if (!uo) return res.json({ organization: null });

    res.json({
      organization: {
        organizationId: uo.organizationId,
        name: uo.organization.name,
        industry: uo.organization.industry,
        description: uo.organization.description,
        jobTitle: uo.jobTitle,
        responsibilities: uo.responsibilities,
        isDefault: true,
      },
    });
  } catch (err) {
    console.error('[UserOrgs] default error:', err);
    res.status(500).json({ error: 'Failed to get default org' });
  }
});

type CreateOrgBody = {
  name: string;
  industry?: string;
  description?: string;
  jobTitle?: string;
  responsibilities?: string;
  setAsDefault?: boolean;
};

/** 创建组织并绑定到当前用户 */
router.post('/', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { name, industry, description, jobTitle, responsibilities, setAsDefault } =
    req.body as CreateOrgBody;

  if (!name?.trim()) {
    return res.status(400).json({ error: '单位名称不能为空' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 创建组织
      const org = await tx.organization.create({
        data: {
          name: name.trim(),
          industry: industry?.trim() || null,
          description: description?.trim() || null,
        },
      });

      // 如果要设为默认，清除其他默认
      if (setAsDefault) {
        await tx.userOrganization.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // 绑定用户
      const uo = await tx.userOrganization.create({
        data: {
          userId,
          organizationId: org.id,
          jobTitle: jobTitle?.trim() || null,
          responsibilities: responsibilities?.trim() || null,
          isDefault: setAsDefault === true,
        },
        include: {
          organization: {
            select: { id: true, name: true, industry: true, description: true },
          },
        },
      });

      return uo;
    });

    res.status(201).json({
      organizationId: result.organizationId,
      name: result.organization.name,
      industry: result.organization.industry,
      description: result.organization.description,
      jobTitle: result.jobTitle,
      responsibilities: result.responsibilities,
      isDefault: result.isDefault,
    });
  } catch (err) {
    console.error('[UserOrgs] create error:', err);
    res.status(500).json({ error: '创建组织失败' });
  }
});

type UpdateOrgBindingBody = {
  jobTitle?: string;
  responsibilities?: string;
  setAsDefault?: boolean;
};

/** 更新用户在某个组织中的职务/职责信息 */
router.put('/:orgId', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { orgId } = req.params;
  const { jobTitle, responsibilities, setAsDefault } = req.body as UpdateOrgBindingBody;

  try {
    // 检查绑定是否存在
    const existing = await prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!existing) {
      return res.status(404).json({ error: '未绑定该组织' });
    }

    await prisma.$transaction(async (tx) => {
      if (setAsDefault) {
        await tx.userOrganization.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      await tx.userOrganization.update({
        where: { userId_organizationId: { userId, organizationId: orgId } },
        data: {
          ...(jobTitle !== undefined ? { jobTitle: jobTitle?.trim() || null } : {}),
          ...(responsibilities !== undefined ? { responsibilities: responsibilities?.trim() || null } : {}),
          ...(setAsDefault !== undefined ? { isDefault: setAsDefault } : {}),
        },
      });
    });

    // 返回更新后的数据
    const updated = await prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      include: {
        organization: {
          select: { id: true, name: true, industry: true, description: true },
        },
      },
    });

    res.json({
      organizationId: updated!.organizationId,
      name: updated!.organization.name,
      industry: updated!.organization.industry,
      description: updated!.organization.description,
      jobTitle: updated!.jobTitle,
      responsibilities: updated!.responsibilities,
      isDefault: updated!.isDefault,
    });
  } catch (err) {
    console.error('[UserOrgs] update error:', err);
    res.status(500).json({ error: '更新组织信息失败' });
  }
});

/** 解绑组织 */
router.delete('/:orgId', verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { orgId } = req.params;

  try {
    const existing = await prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!existing) {
      return res.status(404).json({ error: '未绑定该组织' });
    }

    await prisma.userOrganization.delete({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });

    // 如果删除了默认组织，将其他绑定设为默认
    if (existing.isDefault) {
      const next = await prisma.userOrganization.findFirst({
        where: { userId },
        orderBy: { organization: { name: 'asc' } },
      });
      if (next) {
        await prisma.userOrganization.update({
          where: { userId_organizationId: { userId, organizationId: next.organizationId } },
          data: { isDefault: true },
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[UserOrgs] delete error:', err);
    res.status(500).json({ error: '解绑组织失败' });
  }
});

export default router;
