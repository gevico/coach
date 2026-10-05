import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import type { BoardDocument } from './markdown'
import { narrationFromBoard } from './narration'

export interface ExplanationStep {
  number: number
  title: string
  body: string
  pageIndex: number
  localStep: number
  source: 'explain' | 'speaker' | 'none'
}

export interface ExplanationDocument {
  introduction: string
  steps: ExplanationStep[]
}

export function explanationsFromBoard(document: BoardDocument): ExplanationDocument {
  const narration = narrationFromBoard(document)
  const steps: ExplanationStep[] = []
  for (const [pageIndex, page] of document.pages.entries()) {
    let localStep = 0
    for (const column of page.columns) {
      const units = [...(column.title ? [column] : []), ...column.blocks]
      for (const unit of units) {
        const number = steps.length + 1
        steps.push({ number, title: narration.steps[number - 1].title, body: unit.explanation || unit.notes || '', pageIndex, localStep: ++localStep, source: unit.explanation ? 'explain' : unit.notes ? 'speaker' : 'none' })
      }
    }
  }
  const first = document.pages[0]
  return { introduction: first?.explanation || first?.notes || '', steps }
}

export function buildExplanationPrompt(source: string): string {
  const quotedSource = unified().use(remarkStringify, { fences: true }).stringify({ type: 'root', children: [{ type: 'code', lang: 'markdown', value: source }] })
  return `请为下面的 Coach 板书补充帮助阅读和理解的解析，适用于问题解释、技术设计和方案说明。

输出要求：
1. 只输出完整 Markdown，输出正文直接从一级标题开始。
2. 保留现有标题、段落、列表、代码、表格、图片及 speaker: 注释。# 表示文档标题，## 表示栏目，### 表示栏目内的板块。
3. 在每个栏目标题、板块标题、段落、顶层列表项、代码块、图片、表格之后，添加对应的 <!-- explain: ... --> 注释。一级标题后添加总体解析，介绍问题、假设和各部分之间的关系。已有的 explain: 注释按内容完善或替换，避免重复。
4. 解析说明该部分的含义、推理过程、适用条件和与其他部分的关系。需要时补充例子、代码或表格，使用自然的书面语言。
5. 列表项的解析注释放在该项内部，按照列表正文位置缩进。解析可以有多个段落，注释中使用 Markdown。注释内部避免嵌套 HTML 注释和字面的关闭标记。
6. 执行命令使用 bash 代码块，其他代码标记实际语言。重点标记使用 :highlight[高亮]、:circle[圈线] 和 :shade[底部阴影]。
7. 区分已知事实、假设与待确认的问题。对技术结论注明必要的依据或引用。阅读进度由用户手动控制。

现有板书：

${quotedSource}`
}
