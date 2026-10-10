import MarkdownContent from './MarkdownContent'

export default function BoardIntroduction({ title, preface, baseUrl }: { title: string; preface: string; baseUrl: string }) {
  return <div className="board-introduction">
    {title && <h1>{title}</h1>}
    {preface && <div className="introduction-body content-block"><MarkdownContent source={preface} baseUrl={baseUrl} /></div>}
  </div>
}
