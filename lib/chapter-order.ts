// 章节排序只依赖数据库中可持久化的两个字段，避免调用方根据标题文字猜测章节序号。
export type ChapterNumberOrderItem = {
  chapterNo: number | null
  sortOrder: number
}

// 章节导航不仅需要排序字段，还必须携带稳定的 Doc ID；标题、状态等展示字段由泛型原样保留，
// 这样目录组件可以直接使用业务对象，不必为了计算前后章再复制一份容易失去同步的数据结构。
export type ChapterNavigationItem = ChapterNumberOrderItem & {
  docId: string
}

export type ChapterNavigationState<T extends ChapterNavigationItem> = {
  orderedChapters: T[]
  currentIndex: number
  previousChapter: T | null
  nextChapter: T | null
}

/**
 * 按章节号对正文进行升序排列。
 *
 * 正常的新数据都应填写 chapterNo，因此第一章、第二章、第十一章会按 1、2、11 的数值顺序排列。
 * 历史数据可能没有章节号：这类章节统一放在已编号章节之后，并继续按原 sortOrder 排列，
 * 既不会让空章节号意外排到第一章前面，也能保证历史章节之间的相对顺序稳定。
 */
export function compareChaptersByChapterNo(left: ChapterNumberOrderItem, right: ChapterNumberOrderItem) {
  if (left.chapterNo !== null && right.chapterNo !== null) {
    // 章节号在同一项目内原则上唯一；仍保留 sortOrder 作为异常旧数据的确定性兜底。
    return left.chapterNo - right.chapterNo || left.sortOrder - right.sortOrder
  }

  if (left.chapterNo !== null) {
    return -1
  }

  if (right.chapterNo !== null) {
    return 1
  }

  // 两章都没有章节号时不能推断业务顺序，只能沿用用户此前维护的人工顺序。
  return left.sortOrder - right.sortOrder
}

/**
 * 根据当前 Doc ID 生成稳定的章节导航状态。
 *
 * 这里先复制数组再排序，避免目录组件意外修改接口响应对象；当前章节不存在时明确返回 -1 和空邻章，
 * 防止错误地把第一章当成“下一章”。同一份结果同时供顶部快捷按钮和左侧目录使用，保证两处顺序一致。
 */
export function buildChapterNavigation<T extends ChapterNavigationItem>(
  chapters: readonly T[],
  currentDocId: string,
): ChapterNavigationState<T> {
  const orderedChapters = [...chapters].sort(compareChaptersByChapterNo)
  const currentIndex = orderedChapters.findIndex((chapter) => chapter.docId === currentDocId)

  if (currentIndex < 0) {
    return {
      orderedChapters,
      currentIndex: -1,
      previousChapter: null,
      nextChapter: null,
    }
  }

  return {
    orderedChapters,
    currentIndex,
    previousChapter: orderedChapters[currentIndex - 1] ?? null,
    nextChapter: orderedChapters[currentIndex + 1] ?? null,
  }
}
