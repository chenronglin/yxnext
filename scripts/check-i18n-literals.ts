import ts from "typescript"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const STRICT = process.argv.includes("--strict")
const CJK_PATTERN = /[\u4e00-\u9fff]/

const SCAN_DIRS = ["app", "components", "config", "lib", "server", "types"]
const ALLOWED_PATH_PARTS = [
  "lib/i18n/locales/zh-CN.ts",
]

type Finding = {
  file: string
  line: number
  text: string
}

function isAllowedFile(file: string) {
  const normalized = file.replaceAll("\\", "/")

  // 中文字典是允许中文文案出现的唯一代码入口；其它文档、mock 和 seed 数据不参与 UI 文案检查。
  return (
    ALLOWED_PATH_PARTS.some((part) => normalized.endsWith(part)) ||
    normalized.startsWith("docs/") ||
    normalized.startsWith("mocks/") ||
    normalized === "scripts/seed.ts"
  )
}

function collectFiles(dir: string, output: string[] = []) {
  const absoluteDir = join(ROOT, dir)

  if (!existsSync(absoluteDir)) {
    return output
  }

  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry)
    const relativePath = relative(ROOT, absolutePath).replaceAll("\\", "/")
    const stat = statSync(absolutePath)

    if (stat.isDirectory()) {
      collectFiles(relativePath, output)
      continue
    }

    if ((relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) && !isAllowedFile(relativePath)) {
      output.push(relativePath)
    }
  }

  return output
}

function lineForPosition(source: ts.SourceFile, position: number) {
  return source.getLineAndCharacterOfPosition(position).line + 1
}

function addFinding(findings: Finding[], source: ts.SourceFile, node: ts.Node, text: string) {
  if (!CJK_PATTERN.test(text)) {
    return
  }

  findings.push({
    file: source.fileName,
    line: lineForPosition(source, node.getStart(source)),
    text: text.replace(/\s+/g, " ").trim().slice(0, 120),
  })
}

function scanFile(file: string) {
  const sourceText = readFileSync(join(ROOT, file), "utf8")
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const findings: Finding[] = []

  function visit(node: ts.Node) {
    // 只扫描会进入运行时或 JSX 输出的文本节点；普通中文注释不纳入检查。
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addFinding(findings, source, node, node.text)
    } else if (ts.isJsxText(node)) {
      addFinding(findings, source, node, node.getText(source))
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

const findings = SCAN_DIRS.flatMap((dir) => collectFiles(dir)).flatMap(scanFile)

if (findings.length > 0) {
  console.log(`Found ${findings.length} possible hard-coded Chinese UI literals.`)

  for (const finding of findings.slice(0, 200)) {
    console.log(`${finding.file}:${finding.line} ${finding.text}`)
  }

  if (findings.length > 200) {
    console.log(`... ${findings.length - 200} more findings omitted.`)
  }
}

if (STRICT && findings.length > 0) {
  process.exitCode = 1
}
