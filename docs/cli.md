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
| `--no-open` | 启动服务后手动打开终端中的网页地址 |
| `--zen` | 直接打开禅模式，只显示画布内容 |
| `--help` | 显示参数和使用示例 |

默认端口为 `4173`。默认端口被占用时，命令从后续端口中选择可用端口，并在终端显示实际地址。服务只监听本机的 `127.0.0.1`。

```bash
coach ./lesson.md --port 4300 --no-open
coach ./lesson.md --zen
```

禅模式保留左右方向键和画布手势。按 `F` 切换模式，按 `Esc` 退出；通过顶部按钮或 `F` 进入时请求浏览器全屏。

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
| `assetBase` | 图片资源目录 `/course-assets/` |
| `fileName` | Markdown 文件名 |
| `documentId` | 文件身份标识，用于隔离浏览器保存内容 |

`documentId` 根据文件的绝对路径生成。`/course-assets/` 提供这份 Markdown 所在目录中的图片，其他类型的文件、隐藏文件和目录以外的路径返回 `404`。
