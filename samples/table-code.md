# 表格与代码
<!-- preface: **学习目标**：用表格说明对应关系，用代码展示运行命令。 -->
<!-- speaker: 这份示例展示表格和代码的使用方式。 -->

## 命令参数
<!-- speaker: 表格能够清楚地说明参数与用途的关系。 -->

| 参数 | 用途 |
| --- | --- |
| --presenter | 显示画布和口播 |
| --host 0.0.0.0 | 允许容器端口代理访问 |
| --port 4173 | 使用指定端口 |
<!-- speaker: 在 CNB Workspace 中使用 host 和 port 参数。 -->

## 运行示例
<!-- speaker: 多行命令保留缩进，复制时使用整个代码块。 -->

```bash
./build/coach samples/getting-started.md \
    --host 0.0.0.0 \
    --port 4173 \
    --presenter --no-open
```
<!-- speaker: 启动服务后，在 WebIDE 的端口面板打开 4173 的预览地址。 -->
