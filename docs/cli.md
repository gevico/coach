# 使用 coach 命令展示 Markdown

安装需要 Node.js 22.12 或更新版本。首次在项目目录执行：

```bash
npm install
npm run build
npm link
```

安装完成后，可以在任意目录指定 Markdown 文件：

```bash
coach ./lesson.md
coach "./演示资料/演示文稿.md"
```

命令启动本地网页服务并打开浏览器，终端显示实际画布地址。按 `→` 展示下一个内容块，按 `←` 返回上一个内容块。顶部工具栏提供全部显示、缩放、标准跟踪、编辑、导出与禅模式。按 `Ctrl+C` 停止服务。

也可以直接从项目目录运行可执行文件：

```bash
node bin/coach.mjs ./lesson.md
```

## 参数

| 参数 | 用途 |
| --- | --- |
| `<file.md>` | 指定需要展示的 Markdown 文件，路径相对于执行命令时的目录 |
| `--port 4300` | 指定服务端口；指定的端口被占用时显示错误 |
| `--host 0.0.0.0` | 指定监听地址，默认 `127.0.0.1`；容器端口预览使用 `0.0.0.0` |
| `--no-open` | 启动服务后手动打开终端中的网页地址 |
| `--zen` | 直接打开禅模式，只显示画布内容 |
| `--presenter` | 打开演讲模式，显示 16:9 画布和口播注释 |
| `--notes <file.md>` | 指定已有的独立口播文件 |
| `--record-dir <directory>` | 指定 Mac 视频保存目录，默认 `~/Movies/Coach` |
| `--help` | 显示参数和使用示例 |

默认端口为 `4173`。默认端口被占用时，命令从后续端口中选择可用端口，并在终端显示实际地址。服务默认监听本机的 `127.0.0.1`，使用 `--host 0.0.0.0` 时监听全部 IPv4 网卡。

```bash
coach ./lesson.md --port 4300 --no-open
coach ./lesson.md --zen
coach ./lesson.md --host 0.0.0.0 --port 4173 --no-open
```

禅模式保留左右方向键和画布手势。按 `F` 切换模式，按 `Esc` 退出；通过顶部按钮或 `F` 进入时请求浏览器全屏。

`--zen`、`--presenter` 每次选择一个参数。打开页面后可以通过工具栏和快捷键切换模式。

默认先显示板书大标题和前言，按右方向键开始第一项内容。

## 多张画布与换页

工具栏显示当前画布页码，例如 `1 / 2`。左右按钮切换整张画布，首页的左按钮和末页的右按钮禁用。键盘 `→`、`←` 控制内容步骤；演讲模式中，可以在页面边界继续切换到相邻画布。

使用单独一行的 `<!-- pagebreak -->` 创建下一张画布，保留当前课程大标题。换页后的 `speaker:` 和 `preface:` 注释用于新画布的开场。也可以使用新的一级标题开始一张具有独立标题的画布。

```markdown
# 我的课程
<!-- speaker: 开场讲解。 -->

## 第一张画布
<!-- speaker: 介绍第一部分。 -->

第一部分的内容。
<!-- speaker: 讲解当前内容。 -->

<!-- pagebreak -->
<!-- speaker: 介绍第二张画布。 -->

## 第二张画布
<!-- speaker: 介绍第二部分。 -->

第二部分的内容。
<!-- speaker: 讲解当前内容。 -->
```

示例见 [multiple-canvases.md](../samples/multiple-canvases.md)。单张画布中保留一个一级标题，使用二级标题组织多个栏目。

## 构建可执行文件

```bash
make setup
make binary
./build/coach samples/getting-started.md --presenter
make test
make check
```

`make setup` 使用已有 Node.js（≥22.12）和 npm 安装项目依赖。缺少这些命令时，安装脚本使用系统包管理器安装。Linux 下遇到缺少 `libatomic.so.1` 时，自动安装 Debian／Ubuntu 的 `libatomic1` 或对应发行版的 `libatomic`。root 用户直接执行系统安装命令，普通用户使用 sudo；安装后再次确认 Node.js 能运行。

`make build` 编译网页，`make run` 使用已有 Node.js 启动课程。`make binary` 将专用 Node.js 构建环境保存到 `.tools/node`；二进制构建需要 Node.js 25.5 或更新版本，安装脚本默认使用 26.0.0。构建产物 `build/coach` 包含 CLI、网页和字体资源，可以单独复制到相同操作系统与处理器架构的机器运行。课程 Markdown 和课程图片通过文件路径读取。`make run-binary` 构建并运行该可执行文件。

```bash
make setup-media
```

该命令安装 FFmpeg 和 Playwright Chromium，供制作教学动图及浏览器验证使用。macOS 原生录制还需要 Apple Command Line Tools。

## CNB Workspace

在 WebIDE 终端执行：

```bash
make run HOST=0.0.0.0 PORT=4173 FILE=samples/getting-started.md
```

在 WebIDE 的端口面板添加 `4173`，打开该端口生成的预览地址。演讲模式可在预览地址后添加 `?presenter=1`。终端中的 `127.0.0.1` 地址用于工作空间内部访问。明确指定端口可以保证服务使用预览配置中的端口。

已有源码安装也可以直接启动：

```bash
coach samples/getting-started.md --host 0.0.0.0 --port 4173 --presenter --no-open
```

## 演讲模式

在板书内容后添加 `speaker:` 注释：

```markdown
## 栏目标题
<!-- speaker: 这里讲解栏目标题。 -->

一段展示内容。
<!-- speaker: 这里写这段内容对应的口播。 -->
```

直接打开这一份文件即可：

```sh
coach ./lesson.md --presenter
```

左上方为 1920×1080 比例的纯画布；右侧显示当前口播，下方显示下一步。窗口空间不足时画布按 16:9 缩小。按 `→`、`←` 同步浏览板书和口播，按 `P` 切换演讲模式，按 `Esc` 返回正常模式。

开场默认显示一级标题和前言，位于最左侧，后续内容按栏目从左向右排列。一级标题后的 `speaker:` 注释用作开场口播；前言正文优先使用 `preface:` 注释，未填写时显示开场口播。按 `→` 开始第一项内容；“从头展示”返回前言。

```markdown
# 我的画布
<!-- preface:
- **主题**：使用 Markdown 编写板书
- **展示方式**：按方向键逐项展示
- **口播**：使用 speaker 注释保存讲解
-->
<!-- speaker: 在这里填写开场口播。 -->
```

多段口播使用多行注释。列表项的注释放在所属列表项内，按照正文位置缩进。一级标题后面的口播注释用作开场。

使用已有的独立口播文件时，可以明确指定：

```sh
coach ./lesson.md --notes ./notes.md --presenter
```

口播标题使用 `## 01｜标题`、`## 02｜标题` 等编号，与展示步骤对应。没有嵌入口播的板书会使用指定文件中的讲稿；重新加载页面会重新读取文件。

## Mac 录制

```sh
coach lesson.md --presenter --record-dir ./recordings
```

在右侧口播区域点击“Mac 录制”。麦克风默认开启，音轨采用 2× 增益（约 +6 dB），在保存时应用并限制超出范围的峰值。准备五秒后按钮变为“停止录制”，点击该按钮结束并保存视频。保存时自动移除五秒准备期间的画面和音频；倒计时期间点击取消不会生成成片。

系统通过辅助功能读取当前浏览器画布的屏幕位置，支持 Dia。浏览器侧边栏展开或收起后，下次录制会重新计算区域。录制期间保持浏览器窗口与画布尺寸，左右方向键继续切换板书和口播。

视频默认保存至 `~/Movies/Coach`，文件夹会自动创建。录制按钮下方显示当前目录，文件夹图标可以在 Finder 中打开目录。点击“录像保存设置”，输入路径并保存，或点击“选择文件夹”使用系统选择窗口。设置会保留到下一次启动；“默认目录”按钮填入默认路径，点击“保存”即可恢复。

`--record-dir` 优先于已保存的设置，支持绝对路径、`~/` 和相对于执行命令时目录的路径。录制或保存期间无法更改目录。保存后可以点击“打开录像”。

首次使用需要 Apple Command Line Tools，以及运行 Coach 的终端拥有辅助功能、屏幕录制和麦克风权限。

## 图片路径

图片可以使用网络地址，或者相对于 Markdown 文件的本地路径：

```markdown
![网络图片](https://example.com/images/diagram.png)
![本地图示](./images/architecture.svg)
![中文文件名](./课程图片/硬件结构.png)
![空格文件名](<./课程图片/硬件 结构.svg>)
```

本地图片放在 Markdown 文件所在目录或其子目录中。支持 PNG、JPEG、GIF、WebP、AVIF 和 SVG 图片。

重新加载页面会读取磁盘上的 Markdown 内容。网页编辑器中的编辑保存在当前浏览器中，Markdown 原文件保持原样。

## 本地服务接口

`GET /api/document` 返回以下字段：

| 字段 | 内容 |
| --- | --- |
| `source` | 当前文件的 UTF-8 Markdown 内容 |
| `assetBase` | 课程素材目录 `/course-assets/` |
| `fileName` | Markdown 文件名 |
| `documentId` | 文件身份标识，用于隔离浏览器保存内容 |
| `notes` | 使用 `--notes` 时返回口播文件的 `source` 与 `fileName` |

`documentId` 根据文件的绝对路径生成。`/course-assets/` 提供这份 Markdown 所在目录中的受支持素材；隐藏文件、目录以外的路径和未列入支持范围的文件返回 `404`。

## 动态课程素材

课程目录内可引用图片、HTML、JavaScript、CSS、JSON、字体、MP4/WebM、GLTF/GLB 和 WASM 素材。素材路径必须位于课程目录内，隐藏文件和指向目录外部的符号链接不能通过素材接口读取。HTML 以独立来源执行，JavaScript 模块和字体支持场景内跨域加载。具体用法见 [课堂外观与内容插件](presentation.md)。
