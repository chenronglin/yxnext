import { describe, expect, it } from "vitest"

import { buildChapterNavigation, compareChaptersByChapterNo } from "@/lib/chapter-order"

type TestChapter = {
  title: string
  chapterNo: number | null
  sortOrder: number
}

describe("compareChaptersByChapterNo", () => {
  it("全文质检按章节号数值升序排列，而不是按创建顺序排列", () => {
    const chapters: TestChapter[] = [
      { title: "第十一章", chapterNo: 11, sortOrder: 1 },
      { title: "第一章", chapterNo: 1, sortOrder: 2 },
      { title: "第二章", chapterNo: 2, sortOrder: 3 },
    ]

    const orderedTitles = [...chapters].sort(compareChaptersByChapterNo).map((chapter) => chapter.title)

    expect(orderedTitles).toEqual(["第一章", "第二章", "第十一章"])
  })

  it("历史空章节号排在已编号章节之后，并保持原有人工顺序", () => {
    const chapters: TestChapter[] = [
      { title: "未编号后章", chapterNo: null, sortOrder: 8 },
      { title: "第二章", chapterNo: 2, sortOrder: 9 },
      { title: "未编号前章", chapterNo: null, sortOrder: 3 },
      { title: "第一章", chapterNo: 1, sortOrder: 10 },
    ]

    const orderedTitles = [...chapters].sort(compareChaptersByChapterNo).map((chapter) => chapter.title)

    expect(orderedTitles).toEqual(["第一章", "第二章", "未编号前章", "未编号后章"])
  })

  it("异常重复章节号使用 sortOrder 保证结果稳定", () => {
    const chapters: TestChapter[] = [
      { title: "第二章后录入版本", chapterNo: 2, sortOrder: 7 },
      { title: "第二章先录入版本", chapterNo: 2, sortOrder: 4 },
    ]

    const orderedTitles = [...chapters].sort(compareChaptersByChapterNo).map((chapter) => chapter.title)

    expect(orderedTitles).toEqual(["第二章先录入版本", "第二章后录入版本"])
  })
})

describe("buildChapterNavigation", () => {
  const chapters = [
    { docId: "11", chapterNo: 11, sortOrder: 2, title: "第十一章" },
    { docId: "1", chapterNo: 1, sortOrder: 3, title: "第一章" },
    { docId: "2", chapterNo: 2, sortOrder: 1, title: "第二章" },
  ]

  it("按结构化章节号计算当前章和相邻章节", () => {
    const navigation = buildChapterNavigation(chapters, "2")

    expect(navigation.orderedChapters.map((chapter) => chapter.docId)).toEqual(["1", "2", "11"])
    expect(navigation.currentIndex).toBe(1)
    expect(navigation.previousChapter?.docId).toBe("1")
    expect(navigation.nextChapter?.docId).toBe("11")
  })

  it("在首章、末章和未知 Doc 上返回明确的导航边界", () => {
    const first = buildChapterNavigation(chapters, "1")
    const last = buildChapterNavigation(chapters, "11")
    const missing = buildChapterNavigation(chapters, "999")

    expect(first.previousChapter).toBeNull()
    expect(first.nextChapter?.docId).toBe("2")
    expect(last.previousChapter?.docId).toBe("2")
    expect(last.nextChapter).toBeNull()
    expect(missing.currentIndex).toBe(-1)
    expect(missing.previousChapter).toBeNull()
    expect(missing.nextChapter).toBeNull()
  })
})
