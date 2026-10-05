import type { Category, Preset } from '@shared/types'

/**
 * Builds the metadata prompt. The optional preset injects extra instructions,
 * a tone hint, and a keyword count range; category ids come from the editable
 * list in src/shared/categories.json.
 */
export function buildMetadataPrompt(categories: Array<Category>, preset?: Preset | null): string {
  const categoryLines = categories
    .map((category) => `- ${category.id}: ${category.name}`)
    .join('\n')
  const keywordMin = preset?.keywordMin ?? 30
  const keywordMax = preset?.keywordMax ?? 49
  const presetLines: Array<string> = []
  if (preset?.extraInstructions.trim()) {
    presetLines.push(
      `Additional instructions for this batch (preset "${preset.name}"):\n${preset.extraInstructions.trim()}`,
    )
  }
  if (preset?.tone.trim()) {
    presetLines.push(`Write the title with a ${preset.tone.trim()} tone.`)
  }
  const presetSection = presetLines.length > 0 ? `\n${presetLines.join('\n\n')}\n` : ''

  return `You are an expert stock photography metadata editor working for Adobe Stock contributors.
Analyze the attached image and write its metadata in English.

Rules for "title":
- Descriptive and natural; aim for 70-150 characters, never more than 200.
- Describe the main subject, setting, mood, and photographic style.
- Plain text only: no surrounding quotes.
- Never include brand names, trademarks, artist names, or camera/lens/model names.

Rules for "keywords":
- ${keywordMin} to ${keywordMax} keywords, ordered from most to least relevant.
- Single words or short phrases of at most 4 words and 64 characters each.
- No duplicates, not even case-only duplicates.
- No brand names, artist names, or camera model names.
- No irrelevant or spammy terms and no single letters.

Rules for "category":
- Choose exactly one category id from this list:
${categoryLines}
${presetSection}
Respond with a single JSON object of the shape:
{"title": string, "keywords": string[], "category": "<category id>"}`
}
