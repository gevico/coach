---
name: course-generation
description: 根据用户提供的信息源、目标人群、学习效果和课程时长，生成 Coach 本地课程、逐步板书与同步口播，并制作表格、图示和动图。适用于新课程设计；已有课程逐字导入按原文转换要求处理。
---

# 课程生成

生成可用 Coach 展示和录制的本地课程。交付板书与同步口播 Markdown、独立口播稿、本地素材、来源对应清单和时长估算。先阅读 [课程结构与展示规范](references/board-patterns.md)，设计教学节奏时阅读 [信息源与时长](references/inputs-and-timing.md)。

## 必要输入

从本次请求和已有会话取得以下四项。缺少的项目一次询问，不替用户编造；取得必要输入后直接生成。

| 输入 | 需要明确的内容 |
| --- | --- |
| 信息源 | 文件、网页、文档、代码或原始讲稿；允许使用的范围及版本 |
| 目标人群 | 已有知识、经验、使用场景、需要解释的术语 |
| 学习效果 | 学完后能够完成的具体任务或判断，及其验证方式 |
| 课程时长 | 总分钟数，是否包含操作、思考、问答和停顿 |

可选偏好包括讲述身份、语言、语气、课程用途、展示环境。未指定时采用中文单人讲述、简洁板书和手动逐步展示；讲述身份使用会话中已确认的要求。

## 信息源与教学范围

1. 阅读全部指定材料，再确定本节范围。保存来源和可定位的段落、章节、页码或代码位置。网页、图示和动画分别取得完整内容。
2. 用学习效果确定核心问题。按目标人群组织解释深度、必要术语、案例和练习，保持关键前提、条件和技术名称准确。
3. 新课程可以在来源范围内重组和解释，教学示例明确为示例。事实、命令、数据与资源来自已读材料；不添加未核实的结论，不编造实验或测量结果。
4. 用户要求忠实原讲稿时，保留实质内容、问答、比喻和顺序，只调整身份、语气与单人口播连接语。保存完整原稿；不要按新课程方式扩写或压缩原讲稿。
5. 来源不足以支持学习效果时，说明具体缺口并请求缺失资料。不要用空泛口播填满时长。

## 生成文件

在 `.artifacts/course-generation/<slug>/brief.json` 保存输入。JSON 格式见 [输入示例](references/inputs-and-timing.md)。阶段资料、来源清单和验证结果也放在该目录，确保被 Git 忽略。

最终文件默认保存到 `public/examples/<slug>.md`，素材保存到 `public/examples/assets/<slug>/`。用户课程、来源原件与录像不进入工具的 Git 提交。公开 Skill 示例采用本 Skill 的通用素材，不复制私人课程、账户信息或录制内容。

编写一份 Markdown：

- `#` 是板书大标题；标题不自动添加讲次编号。
- `preface:` 保存前言，使用简短的粗体标签和正文；`speaker:` 保存开场口播。
- `##` 表示从左到右的栏目，`###` 表示栏目内板块；每个实际展示单元附对应的 `speaker:` 注释。
- 板书写概念、步骤、条件和证据；口播解释这些内容，包含自然过渡和必要问答。
- 栏目数量随学习效果和时长确定，不固定复制某门课程的数量。
- 课程停在最后一个实质内容或练习反馈处，不自动添加收尾总结和下一节预告。

参照可实际运行的 [Coach 公开示例](assets/coach-example.md)。示例覆盖文字、嵌套列表、表格、代码、静态示意图和循环动图，内容来自本仓库公开说明。

## 图示与动图

示意图使用 Mermaid，并渲染为本地 SVG 或 PNG，再通过 Markdown 图片语法引用。Coach 中的 Mermaid 代码块只展示源码，不能作为图示交付。

保留来源图片和 GIF。内嵌网页有动画时，捕获实际完整周期，导出循环 GIF；静态图保持静态。新绘制的教学动图用于呈现过程或状态变化，注明示意用途，不充当真实运行或实验结果。

可使用本 Skill 的媒体脚本渲染 Mermaid，并生成按节点依次强调的教学 GIF：

```bash
node .agents/skills/course-generation/scripts/render-media.mjs diagram.mmd --svg diagram.svg --gif diagram.gif
```

脚本依赖项目 npm 依赖中的 Mermaid、Playwright，生成 GIF 需要 FFmpeg。浏览器未安装时安装 Playwright Chromium，或者通过 `COACH_BROWSER_PATH` 指定已安装的兼容浏览器。截图和中间帧保存在输出目录内。

## 口播与时长验证

对每个学习效果安排对应内容或练习，并记录其来源。保存 `source-map.json`，列出开场和各展示步骤的来源标识；原稿模式同时记录排除的界面提示与下一节预告。

用真实 Coach 编译器检查步骤与口播，导出独立口播和时长报告：

```bash
node --import tsx .agents/skills/course-generation/scripts/check-course.ts public/examples/lesson.md --brief .artifacts/course-generation/lesson/brief.json --speech public/examples/lesson-speech.md --report .artifacts/course-generation/lesson/check.json
node bin/coach.mjs public/examples/lesson.md --presenter --no-open
```

时长报告是估算。结合代码讲解、看图、动图完整周期、练习与停顿预算调整内容；实测只有取得录音或计时结果后才能报告。脚本不能证明事实正确、来源忠实或学习效果达成，仍需逐段核对。

在 Coach 验证开场、首项、表格、代码、图片、动画、最后一步与全部显示。检查口播随方向键同步切换，代码参数没有自动折行，公式与图示完整可见，动图确实改变状态并循环。从头展示后，重点标记重新播放。

交付文件链接、本地预览、实际展示步骤数，以及估算的讲述和活动时长；只说明有证据支持的结果。
