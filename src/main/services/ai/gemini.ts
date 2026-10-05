import { GoogleGenAI, Type } from '@google/genai'
import { z } from 'zod'
import { GEMINI } from '@shared/constants'
import { AiOutputError } from './errors'

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    category: { type: Type.STRING },
  },
  required: ['title', 'keywords', 'category'],
}

export interface CallGeminiInput {
  apiKey: string
  model: string
  imageBase64: string
  prompt: string
  signal?: AbortSignal
}

/** Calls Gemini with the structured-output schema enforced and returns the raw text. */
export async function callGemini(input: CallGeminiInput): Promise<string> {
  const client = new GoogleGenAI({ apiKey: input.apiKey })
  const response = await client.models.generateContent({
    model: input.model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: input.imageBase64 } },
          { text: input.prompt },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: GEMINI.TEMPERATURE,
      abortSignal: input.signal,
    },
  })
  const text = response.text ?? ''
  if (!text.trim()) throw new AiOutputError('The AI returned an empty response.')
  return text
}

/** Minimal text-only round trip used by the Settings "Test connection" button. */
export async function pingGemini(apiKey: string, model: string): Promise<void> {
  const client = new GoogleGenAI({ apiKey })
  const response = await client.models.generateContent({
    model,
    contents: 'Reply with the single word: OK',
  })
  if (!(response.text ?? '').trim()) {
    throw new AiOutputError('The model returned an empty response.')
  }
}

export interface AiRawOutput {
  title: string
  keywords: Array<string>
  category: string
}

const aiOutputSchema = z.object({
  title: z.string().min(1).max(4000),
  keywords: z.array(z.string().min(1).max(300)).min(1).max(200),
  category: z.string().min(1).max(200),
})

/** Parses and validates the model reply; throws AiOutputError so the caller can retry once. */
export function parseAiOutput(text: string): AiRawOutput {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  let json: unknown
  try {
    json = JSON.parse(withoutFence)
  } catch {
    throw new AiOutputError('The AI response was not valid JSON.')
  }
  const parsed = aiOutputSchema.safeParse(json)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
      .join('; ')
    throw new AiOutputError(`The AI response did not match the expected shape (${detail}).`)
  }
  return parsed.data
}
