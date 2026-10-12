import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Command } from 'commander'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'
import { compileMarkdown } from '../../../../src/lib/markdown.ts'
import { narrationFromBoard } from '../../../../src/lib/narration.ts'

interface Brief {
  sources: { id: string; location: string; scope?: string }[]
  audience: string
  outcomes: string[]
  duration_minutes: number
  language?: 'zh' | 'en'
  speaking_rate_min?: number
  speaking_rate_max?: number
  practice_seconds?: number
  pause_seconds?: number
}

const cli = new Command().argument('<course.md>')
  .requiredOption('--brief <file>', 'Course inputs JSON')
  .option('--speech <file>', 'Export standalone speaker Markdown')
  .option('--report <file>', 'Export verification and timing JSON').parse()
const file = path.resolve(cli.args[0])
const options = cli.opts<{ brief: string; speech?: string; report?: string }>()
const brief = JSON.parse(await readFile(options.brief, 'utf8')) as Brief
if (!Array.isArray(brief.sources) || !brief.sources.length || !brief.sources.every((item) => item.id?.trim() && item.location?.trim())) throw new Error('Provide information sources with id and location.')
if (typeof brief.audience !== 'string' || !brief.audience.trim()) throw new Error('Provide the target audience.')
if (!Array.isArray(brief.outcomes) || !brief.outcomes.length || !brief.outcomes.every((item) => typeof item === 'string' && item.trim())) throw new Error('Provide observable learning outcomes.')
if (!Number.isFinite(brief.duration_minutes) || brief.duration_minutes <= 0) throw new Error('Provide a positive course duration in minutes.')
if (brief.language !== undefined && !['zh', 'en'].includes(brief.language)) throw new Error('Language must be zh or en.')
const language = brief.language ?? 'zh'
const minimumRate = brief.speaking_rate_min ?? (language === 'zh' ? 180 : 120)
const maximumRate = brief.speaking_rate_max ?? (language === 'zh' ? 240 : 160)
const practice = brief.practice_seconds ?? 0
const pauses = brief.pause_seconds ?? 0
if (![minimumRate, maximumRate].every((value) => Number.isFinite(value) && value > 0) || minimumRate > maximumRate) throw new Error('Invalid speaking-rate range.')
if (![practice, pauses].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Invalid practice or pause budget.')

const source = await readFile(file, 'utf8')
const board = compileMarkdown(source)
const narration = narrationFromBoard(board)
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkStringify)
const speechDocument = parser.parse('')
const sequence: { number: number; kind: string; title: string; speech: string }[] = []
const plain: string[] = []
const images: string[] = []
const problems: string[] = []
function appendSpeech(markdown: string) {
  const tree = parser.parse(markdown)
  speechDocument.children.push(...tree.children)
  visit(tree, (node) => {
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') plain.push(node.value)
  })
}
const commandPattern = /^(?:west\s+(?:build|flash|init|update)|git\s|cmake\s|ninja(?:\s|$))/
for (const page of board.pages) {
  if (!page.title.trim()) problems.push('A course page needs a title.')
  if (!page.notes?.trim()) problems.push(`Opening speaker notes missing: ${page.title}`)
  speechDocument.children.push(...parser.parse(`# ${page.title}`).children)
  if (page.notes) appendSpeech(page.notes)
  for (const column of page.columns) {
    const units = [...(column.title ? [{ kind: 'column', markdown: '', notes: column.notes }] : []), ...column.blocks]
    for (const unit of units) {
      const number = sequence.length + 1
      if (!unit.notes?.trim()) problems.push(`Speaker notes missing at step ${number}.`)
      if (unit.notes) appendSpeech(unit.notes)
      const tree = parser.parse(unit.markdown)
      visit(tree, 'image', (node) => images.push(node.url))
      visit(tree, 'code', (node) => {
        if (node.lang === 'mermaid') problems.push(`Render the Mermaid image at step ${number}.`)
        if (node.lang !== 'bash' && node.value.split('\n').some((line) => commandPattern.test(line.trim()))) problems.push(`Use bash for commands at step ${number}.`)
      })
      sequence.push({ number, kind: unit.kind, title: narration.steps[number - 1]?.title || '', speech: unit.notes || '' })
    }
  }
}
if (!sequence.length) problems.push('The course has no content steps.')
if (sequence.length !== narration.steps.length) problems.push('Speaker numbering does not match reveal units.')
for (const image of images) {
  const url = new URL(image, pathToFileURL(path.dirname(file) + path.sep))
  if (url.protocol === 'file:') await access(fileURLToPath(url))
}
if (problems.length) throw new Error(problems.join('\n'))
const content = plain.join(' ')
const hanCharacters = Array.from(content.matchAll(/\p{Script=Han}/gu)).length
const englishWords = Array.from(new Intl.Segmenter('en', { granularity: 'word' }).segment(content))
  .filter((segment) => segment.isWordLike && /[A-Za-z0-9]/.test(segment.segment)).length
const extraMinutes = (practice + pauses) / 60
const low = hanCharacters / (language === 'zh' ? maximumRate : 240) + englishWords / (language === 'en' ? maximumRate : 160) + extraMinutes
const high = hanCharacters / (language === 'zh' ? minimumRate : 180) + englishWords / (language === 'en' ? minimumRate : 120) + extraMinutes
const report = {
  file, sources: brief.sources, audience: brief.audience, outcomes: brief.outcomes,
  pages: board.pages.length, steps: sequence.length, images: images.length,
  timing: { targetMinutes: brief.duration_minutes, estimatedMinutes: [low, high], hanCharacters, englishWords, minimumRate, maximumRate, practiceSeconds: practice, pauseSeconds: pauses, measured: false },
  warnings: brief.duration_minutes < low || brief.duration_minutes > high ? ['Estimated duration does not include the target; review narration and activity budget.'] : [],
  sequence,
}
async function save(output: string, value: string) {
  await mkdir(path.dirname(path.resolve(output)), { recursive: true })
  await writeFile(output, value)
}
if (options.speech) await save(options.speech, parser.stringify(speechDocument))
if (options.report) await save(options.report, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ steps: report.steps, estimatedMinutes: report.timing.estimatedMinutes, warnings: report.warnings }))
