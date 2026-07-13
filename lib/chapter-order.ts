// 章节排序只依赖数据库中可持久化的两个字段，避免调用方根据标题文字猜测章节序号。
export type ChapterNumberOrderItem = {
  chapterNo: number | null
  sortOrder: number
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
