import express from 'express';
import { prisma } from '../lib/prisma';
import { verifyUser, AuthenticatedRequest } from '../middleware/authMiddleware';
import { generateSummary, getSummaryProviderLabel } from '../lib/summary-llm';

const router = express.Router();

// Fetch all transcripts for user
router.get("/", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const transcripts = await prisma.transcript.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        summary: { select: { id: true } },
      },
    });
    res.json(
      transcripts.map(({ summary, ...rest }) => ({
        ...rest,
        hasSummary: Boolean(summary),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transcripts' });
  }
});

// Fetch single transcript with optional summary
// Fetch single transcript with fullText and summary
router.get("/:id", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        fullText: true,
        createdAt: true,
        summary: { select: { text: true } },
        userId: true,
      },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    // Flatten summary text for frontend
    res.json({
      id: transcript.id,
      title: transcript.title,
      fullText: transcript.fullText,
      createdAt: transcript.createdAt,
      summary: transcript.summary?.text || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});


// Generate/fetch summary



// Generate/fetch summary
router.post("/:id/summary", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    // 1️⃣ Fetch transcript including summary
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      include: { summary: true },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    // 2️⃣ If summary already exists → return it
    if (transcript.summary) {
      return res.json({ summary: transcript.summary.text });
    }

    const prompt = `Summarize the following transcript with all important key points:\n\n${transcript.fullText}`;
    const generatedSummary = await generateSummary(prompt);

    // 5️⃣ Validate summary
    if (!generatedSummary || generatedSummary.trim().length < 5) {
      return res.status(500).json({ error: "Summary generation failed" });
    }

    // 6️⃣ Save summary to DB
    const newSummary = await prisma.summary.create({
      data: {
        userId,
        transcriptId: transcript.id,
        text: generatedSummary,
      },
    });

    return res.json({ summary: newSummary.text });

  } catch (err) {
    console.error(`[SummaryLLM:${getSummaryProviderLabel()}]`, err);
    return res.status(500).json({ error: "Failed to generate/fetch summary" });
  }
});

// Delete transcript (and linked summary if any)
router.delete("/:id", verifyUser, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!transcript || transcript.userId !== userId) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.summary.deleteMany({ where: { transcriptId: id } });
      await tx.transcript.delete({ where: { id } });
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete transcript" });
  }
});

export default router;
