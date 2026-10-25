# 课堂外观与内容插件

运行完整示例：

```bash
coach samples/classroom-effects.md --presenter
```

工具栏中的调色板可以选择主题。默认板书使用白纸、紫色标题与逐行书写；现代排版使用青色强调、醒目的左侧标题与错位推进；暗色光点使用深色底色、冷暖光线与幕布展开。还可以选择纸色演播室、深色演示和墨绿黑板。

选择主题会同时设置对应的入场效果。入场效果也可以单独选择逐行书写、柔和渐显、错位推进、幕布展开和直接显示。播放速度可调整，暂停按钮同时暂停文字动效、背景光线与内容插件；切换浏览器标签页后也会暂停。

主题作用于画布、标题、引用、表格、公式和原生图示，以及工具栏、口播侧边栏、内容解析、编辑区、录制设置与弹出菜单。按钮、输入框、提示信息和选中状态使用同一套主题颜色，圆角与阴影也跟随主题。图片与视频保留素材本身的颜色。PDF 和 SVG 使用当前板书主题。

## 保存课程展示设置

在 Markdown 开头添加 YAML：

```yaml
---
presentation:
  theme: studio
  motion: cinematic
  speed: 1
  autoplay: true
---
```

主题配置与对应的入场效果如下：

| 主题名称 | `theme` | 默认入场效果 |
| --- | --- | --- |
| 默认板书 | `paper` | `write` 逐行书写 |
| 现代排版 | `editorial` | `slide` 错位推进 |
| 暗色光点 | `particles` | `cinematic` 幕布展开 |
| 纸色演播室 | `studio` | `cinematic` 幕布展开 |
| 深色演示 | `night` | `fade` 柔和渐显 |
| 墨绿黑板 | `chalk` | `write` 逐行书写 |

只填写 `theme` 时使用主题的默认入场效果；同时填写 `motion` 时使用指定效果。`motion` 可选 `write`、`fade`、`slide`、`cinematic`、`none`。`speed` 范围为 0.25–3。课程设置优先生效，工具栏选择保存在当前浏览器；需要随课程分享时，在 YAML 中填写设置。设置错误会显示提示，正文仍可阅读。

每个插件围栏构成一个展示步骤，后面可以照常填写 `speaker:` 或 `explain:`。动态图示和 HTML 场景在显示后自动循环，隐藏时暂停；视频跟随当前步骤播放，`autoplay` 控制视频是否自动开始。返回步骤保留播放位置，“从头展示”重置整个课程。全部显示和解释模式可用于阅读内容。开启系统的减少动态效果设置后，入场效果直接完成、动态图示显示完整状态、HTML 场景显示封面。

图示、场景、图片与公式直接显示在板书中。视频的播放按钮和进度条覆盖在画面底部，放大按钮可以全屏展示视频。录制期间保留当前画布尺寸，放大按钮暂停使用。

## Mermaid 图示

使用 `mermaid` 代码围栏，填写 Mermaid 支持的流程图、时序图、状态图等语法。流程图连接线和节点循环展开，每轮结束后短暂停留，工具栏的暂停按钮可冻结当前画面。导出使用完整图示。

````markdown
```mermaid
flowchart LR
  A[需求] --> B[设计]
  B --> C[实现]
```
<!-- speaker: 沿着连接线介绍这三个阶段。 -->
````

图示通过 Mermaid 严格模式渲染，并对生成的 SVG 进行清理。语法错误显示在所在内容块中。

## 数学公式

使用 `math` 围栏填写 KaTeX 表达式。公式直接排版为文字，支持分数、上下标和编号。

````markdown
```math
E = mc^2 \tag{1}
```
<!-- speaker: 解释公式中的各个变量。 -->
````

## HTML、GSAP 与 WebGL 场景

将场景及其 JavaScript、CSS、字体和图片保存在课程所在目录内，保持相对路径关系。通过 `coach` 命令打开课程。使用 `coach-scene` 围栏配置：

````markdown
```coach-scene
src: ./film/video/index.html
poster: ./film/cover.png
title: 一次调用的过程
width: 1920
height: 1080
start: 76
duration: 24
fps: 60
```
<!-- speaker: 跟随循环动画介绍这一过程的不同阶段。 -->
````

`width` 和 `height` 是场景的设计尺寸，播放器自动缩放。`start` 是片段在原场景中的起始秒数，`duration` 是每次循环的时长，`fps` 用于帧号换算。片段播放完毕后自动回到 `start`，工具栏的暂停按钮可冻结当前画面。`poster` 是必填的静态封面，加载期间、减少动态效果模式及 PDF/SVG 导出使用它。

场景提供以下任一接口：

```js
window.coachScene = {
  render(seconds) {
    timeline.seek(seconds);
  }
};
window.ready = true;
```

或者提供 `window.renderFrame(frame)`。Coach 传入 `Math.round((start + time) * fps)`，兼容 `coach-zephyr-project` 中 Humanize 与 Cosim-GPU 的逐帧入口。异步渲染可以返回 Promise，播放器会串行执行，并保留最新的定位请求。

使用 GSAP 时，创建暂停的 timeline，在 `render` 中定位。使用 Three.js 时，在 `render` 中更新对象和相机并调用 renderer。播放状态应由传入的时间决定，避免另外启动持续运行的自主播放循环。`window.ready = false` 表示仍在初始化，准备好后改为 `true`；初始化失败可以设置 `window.__buildError`。

场景中名为 `stage` 的元素会按设计尺寸缩放。没有 `stage` 时，页面应自行适应 iframe 尺寸。场景在独立的 iframe 中执行，不能读取父页面；素材请求限制在课程目录内。自定义网络请求、外部 CDN、弹窗与嵌套页面不在此接口范围中。提前将运行依赖放入素材目录。

## 视频片段

`coach-video` 支持本地 MP4/WebM 和允许跨域读取的 HTTP(S) 视频。播放器静音，进度跟随当前内容步骤。`start` 与 `duration` 指定播放片段。静态导出保存当前视频画面；视频尚未就绪时使用 `poster`，没有可用画面时报告导出失败。

````markdown
```coach-video
src: ./assets/demo.webm
poster: ./assets/demo-poster.png
title: 外设操作演示
start: 0
duration: 8
```
````

## 增加内容插件

应用启动时调用 `src/components/plugins/registry.tsx` 导出的 `registerBoardPlugin`。每个插件用一个唯一的围栏语言名注册 React 渲染函数，接收 `source` 和 `assetBase`。内置的 Mermaid、KaTeX、HTML 场景和视频也使用此接口。

需要时间控制的插件可使用 `usePlayback`，它处理当前步骤、暂停、速度和减少动态效果设置。传入第三个参数 `{ loop: true }` 后，插件在内容显示期间自动循环播放。需要替换静态导出内容时，使用 `registerPluginExport`，返回当前画面或完整状态的 DOM。插件配置应通过成熟格式库解析，输入错误应抛出带说明的异常，界面会在对应内容块中显示。

## 实现依据与验证

外观和播放方式参考本地 `coach-zephyr-project/humanize-video/video/js/kit.js` 的标题展开、纸色与深色场景，以及 `cosim-gpu-film/video/js/main.js` 的逐帧定位接口。Coach 使用 npm 提供的 GSAP、Mermaid、KaTeX、YAML 和 DOMPurify；自有示例使用 Web Animations API。

运行 `npm test` 和 `npm run build`。在一个终端启动示例课程：

```bash
coach samples/classroom-effects.md --port 4306 --presenter --no-open
```

在另一个终端运行 `node scripts/check-presentation.mjs`，验证主题切换、动画循环、视频进度、暂停、场景隔离、减少动态效果和 SVG 导出。通过 `COACH_TEST_URL` 指定预览地址；通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定 Chromium。

示例封面与视频来自实际 HTML 场景。安装 FFmpeg 与 Playwright Chromium 后，运行 `node scripts/render-classroom-sample.mjs` 可重新生成。
