import { GoogleGenAI, Type } from "@google/genai"

import type { PreparedVideoDetails } from "./transcode.ts"

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"

export interface VideoSummaryResult {
  summary: string | null
  tags: string[]
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const cleaned = item.trim().toLowerCase().replace(/^#+/, "")
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    tags.push(cleaned)
    if (tags.length >= 5) break
  }
  return tags
}

export async function summarizeVideo(
  originalName: string,
  details: PreparedVideoDetails,
  signal?: AbortSignal
): Promise<VideoSummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY
  const project = process.env.GEMINI_PROJECT
  if (!apiKey && !project) {
    return { summary: null, tags: [] }
  }

  try {
    const ai = project
      ? new GoogleGenAI({
          vertexai: true,
          project,
          location: process.env.GEMINI_LOCATION || "us-central1",
        })
      : new GoogleGenAI({ apiKey: apiKey! })

    const prompt = [
      "Write a concise one-sentence summary of this video and suggest up to 5 short lowercase topic tags.",
      `Original filename: ${originalName}`,
      `Duration: ${details.durationSeconds.toFixed(1)}s, Resolution: ${details.width}x${details.height}, Audio: ${details.audioCodec || "none"}`,
    ].join("\n")

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      contents: [
        ...details.frames.map((frame) => ({
          inlineData: {
            mimeType: "image/jpeg",
            data: frame.toString("base64"),
          },
        })),
        { text: prompt },
      ],
      config: {
        abortSignal: signal,
        maxOutputTokens: 256,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["summary", "tags"],
        },
      },
    })

    const text = response.text?.trim()
    if (!text) return { summary: null, tags: [] }
    const parsed = JSON.parse(text) as { summary?: unknown; tags?: unknown }
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : null
    return {
      summary,
      tags: normalizeTags(parsed.tags),
    }
  } catch (error) {
    console.error("Video summary generation failed:", error)
    return { summary: null, tags: [] }
  }
}
