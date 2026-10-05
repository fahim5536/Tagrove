// Prints the CHANGELOG.md section for a release tag (e.g. v1.0.0) as
// markdown, for use as the GitHub Release body.
// Usage: node scripts/extract-release-notes.mjs v1.0.0
import { readFileSync } from 'node:fs'

const tag = process.argv[2]
if (!tag) {
  console.error('Usage: node scripts/extract-release-notes.mjs <tag>')
  process.exit(1)
}
const version = tag.startsWith('v') ? tag.slice(1) : tag
const lines = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/)
const heading = lines.findIndex((line) => line.startsWith(`## [${version}]`))
if (heading === -1) {
  console.error(`No CHANGELOG.md entry found for version ${version}`)
  process.exit(1)
}
let end = lines.length
for (let i = heading + 1; i < lines.length; i += 1) {
  if (lines[i].startsWith('## ')) {
    end = i
    break
  }
}
console.log(
  lines
    .slice(heading + 1, end)
    .join('\n')
    .trim(),
)
