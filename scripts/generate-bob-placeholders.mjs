import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'public', 'bob')
const EXPRESSIONS = [
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
]

const PALETTE = {
  thinking: '#7cc4ff', action: '#ffb86b', celebrate: '#ff8fa3', idea: '#ffd36e',
  reminder: '#9be7c4', success: '#9be7c4', exercise: '#ffb86b', talking: '#c7b8ff',
  planning: '#7cc4ff', building: '#ffb86b', reading: '#f3ecd2', happy: '#ffd36e',
}

function svg(expression) {
  const accent = PALETTE[expression] ?? '#7cc4ff'
  const label = expression[0].toUpperCase() + expression.slice(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#0b0c10"/>
  <circle cx="200" cy="170" r="120" fill="${accent}" opacity="0.28"/>
  <circle cx="150" cy="150" r="16" fill="#ffffff"/>
  <circle cx="250" cy="150" r="16" fill="#ffffff"/>
  <path d="M130 220q70 66 140 0" stroke="#ffffff" stroke-width="18" fill="none" stroke-linecap="round"/>
  <text x="200" y="360" text-anchor="middle" font-family="system-ui,sans-serif" font-size="30" fill="${accent}">${label}</text>
</svg>`
}

const sharp = (await import('sharp')).default
await mkdir(OUT, { recursive: true })
for (const expression of EXPRESSIONS) {
  const buffer = await sharp(Buffer.from(svg(expression))).webp({ quality: 82 }).toBuffer()
  await writeFile(join(OUT, `${expression}.webp`), buffer)
}
await writeFile(
  join(OUT, 'README.md'),
  '# Bob placeholders\n\nThese 12 WebP files are generated placeholders.\nReplace them with real artwork of the same filenames; no code change is required.\n\nRegenerate with `node scripts/generate-bob-placeholders.mjs`.\n',
)
console.log(`Wrote ${EXPRESSIONS.length} placeholder assets to ${OUT}`)
