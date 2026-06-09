"use client"

import { useState, useRef, useEffect } from "react"
import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ROLE_LABELS } from "@/types/domain"
import { cn } from "@/lib/utils"
import {
  Sparkles,
  Send,
  Bot,
  User,
  Zap,
  BookOpen,
  FileEdit,
  FileCheck2,
  Trash2,
  Copy,
  Check,
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}

const PRESETS = [
  {
    icon: FileEdit,
    title: "润色正文",
    desc: "提升语言画面感与情节张力",
    prompt: "帮我润色小说第一章的描写，让它更有画面感和节奏感。",
    response: `好的，为您针对《都市修真》第一章外卖骑手深夜送餐的场景进行了文字润色，以下是修改前后的对比：

**【原版描写】**
\`\`\`text
他骑着电动车走在深夜的马路上，风很大，肚子有点饿。前面是一个偏僻的小巷子，连个路灯都没有。他觉得有点害怕，但还是骑进去了。
\`\`\`

**【AI润色版】**
\`\`\`text
深夜两点，狂风扯着残存的树叶，在空旷的柏油路上打转。陈默紧了紧领口，右手死死拧着电动车的油门，破旧的电机发出疲惫的喘息。前方的黑暗如同巨兽张开的深渊大口，那是城中村最偏僻的无名窄巷。没有路灯，唯有惨白的车灯撕开一角浓雾，投射出斑驳诡异的阴影。直觉告诉他，里面有些不对劲。
\`\`\`

**【改动分析】**
1. **视觉与环境增强**：将抽象的“深夜”具体为“深夜两点”，用“残叶打转”、“深渊大口”、“惨白车灯”等词汇烘托悬疑和压抑的氛围。
2. **动作与生理细节**：加入“紧领口”、“拧油门”和电机的“疲惫喘息”，使读者的感官代入主角的窘迫与紧张。
3. **节奏感调优**：缩短长句，以紧凑短促的意象叠加营造迫近感，为后文功德系统突发觉醒做强烈的感官铺垫。`,
  },
  {
    icon: Zap,
    title: "选题 Trope 推演",
    desc: "分析套路新意与爆款要素",
    prompt: "分析当前流行选题的 Trope：马甲爽文+扮猪吃虎 应该怎么做新意？",
    response: `结合阅享平台选题策划库（如对标书目《我的微信连三界》）以及近期爆款趋势，针对**「马甲爽文 + 扮猪吃虎」**的设定，为您推演以下三个具有新意的切入方向：

1. **职业设定的极致反差与金手指的深度锚定**
   - *传统套路*：豪门隐藏弃少、百亿神医隐居。
   - *创新方向*：让主角扮演极度接地气且具有生活流动感的职业（如外卖骑手、废品回收员、小餐馆帮工）。主角的“猪皮”要真切，而他的金手指（如功德商城、神仙回收系统）直接与他世俗的职业行为深度耦合。例如，主角送餐到特殊诡异地点，能获得仙界功德值；捡到被遗弃的古董法器残卷，可以提纯重铸。这让世俗生活与修仙主线产生了直接、持续的化学反应。
   
2. **“自我防卫式”的主动扮猪**
   - *传统套路*：主角故意装弱，等反派挑衅再打脸。
   - *创新方向*：主角并非故意装弱，而是受限于某种天道规则或系统惩罚，甚至主角自己都误以为在这个高魔世界里自己是个“废柴”。主角极其谨慎，每次出手都以为是在拼死求生，实则在旁人看来是毁天灭地的降维打击。这种由于信息差带来的“无形装逼”比传统装弱更具高级幽默感。
   
3. **“马甲”的动态分裂与左右互搏**
   - *传统套路*：主角只有一个隐藏身份。
   - *创新方向*：主角在世俗、仙界、反派阵营同时拥有数个互相对立的马甲。例如，他白天是唯唯诺诺的外卖骑手，晚上是仙盟的幕后军师，同时还是魔道的神秘刺客。剧情的高潮在于主角必须精分操纵不同马甲进行信息互博、自导自演，甚至自己悬赏自己，极具戏剧张力和喜剧色彩。`,
  },
  {
    icon: BookOpen,
    title: "丰富故事大纲",
    desc: "设计合理冲突与波峰波谷",
    prompt: "请帮我丰富《锦衣探案录》的细纲设计，加入前期的冲突高潮。",
    response: `针对《锦衣探案录》这一悬疑权谋选题，为了在前期（第5-10章）迅速抓住读者，建议设计一个**“局中局、自证清白”**的小高潮。以下是为您细化的冲突细纲：

- **第5章：蛛丝马迹（冲突起因）**
  主角（锦衣卫百户）在暗查京城户部银库失窃案时，追踪线索到城南的次辅别苑。别苑守备森严，主角意外发现负责别苑安防的竟是他失踪多年的师兄，身世悬念初现。

- **第7章：致命恐吓（危机升级）**
  上峰以“结案期限将至”为由，强行施压主角签字结案，企图用替罪羊结案。同时主角深夜回房收到匿名飞镖传书，留下一枚当年的血斑腰牌，并暗示银库的十万两雪花银正在源源不断流向宫内。

- **第9章：夜半惊魂（冲突爆发高潮）**
  主角抗命夜探次辅私宅。刚入书房，却发现次辅早已气绝身亡，伤口正是主角师兄擅长的独门剑法。突然，门外火光大盛，主角被闻讯赶来的羽林卫和锦衣卫死敌包围，而一名身穿锦衣卫服饰的神秘黑衣人正从窗外逃出。

- **第10章：背水一战（危机转折）**
  主角拼死突出重围，但在搏斗中其身份腰牌不慎遗落在现场。次日，主角成为刺杀朝廷重臣的钦犯，遭到黑白两道的联合通缉，师兄的线索彻底断绝。主角必须潜伏于京城贫民窟，开始自证清白的逃亡反击战。`,
  },
  {
    icon: FileCheck2,
    title: "文本校对与病句修改",
    desc: "快速发现笔误并规范标点",
    prompt: "请帮我校对一下这段文本的错别字和语病：『听到这个好消息，使他再接再励，最终彻底的征服了困难。』",
    response: `已为您校对并重构该段文本，共发现 **3** 处规范问题，并提供了润色方案：

### 🔍 问题诊断与修正

1. **语法语病（主语残缺）**
   - *原句*：『听到这个好消息，使他……』
   - *分析*：“听到……”和“使”同时使用导致句子缺少主语。
   - *修改*：去掉“使”，改为「听到这个好消息，他……」；或者改为「这个好消息使他……」。

2. **错别字修正（经典笔误）**
   - *原句*：『再接再励』
   - *修正*：修正为**「再接再厉」**。
   - *分析*：“厉”在古汉语中通“砺”，意为磨砺、磨刀。形容公鸡相斗前磨利喙子。因此必须写作“厉”，非鼓励的“励”。

3. **结构助词混用**
   - *原句*：『彻底的征服』
   - *修正*：修正为**「彻底地征服」**。
   - *分析*：“征服”是动词，修饰动词应当使用地字旁（状语标记）。

---

### ✨ 推荐重构方案

* **规范修改版**（仅纠错）：
  > 听到这个好消息，他再接再厉，最终彻底地战胜了困难。
* **文学润色版**（强化表现力）：
  > 捷报传来，他精神大振，当即再接再厉，一鼓作气将眼前的难关悉数攻克。`,
}
]

export default function AiPage() {
  const { user } = useRole()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Initialize with greeting
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `您好，**${user.name}**！我是您的 阅享 AI 写作与审稿助手。

我拥有对平台选题策划库、梗概及细纲的理解能力，您可以让我为您：
- **润色成稿正文**，加强情节张力和细节描写。
- **推演流行 Trope 设定**，挖掘大纲反转和爆款创新点。
- **梳理大纲细纲**，设计故事的高潮节奏和波峰冲突。
- **纠错文本字句**，校对错别字与语病。

您也可以点击下方的**快捷任务卡片**快速体验！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ])
  }, [user.name])

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = (textToSend?: string) => {
    const finalInput = textToSend || input
    if (!finalInput.trim() || loading) return

    const userMsg: Message = {
      id: Math.random().toString(36).slice(2, 9),
      role: "user",
      content: finalInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInput("")
    setLoading(true)

    // Simulate AI response with typewriter delay
    setTimeout(() => {
      // Find preset response or construct a dynamic one
      const matchedPreset = PRESETS.find(p => p.prompt === finalInput || finalInput.includes(p.title))
      const aiReply = matchedPreset 
        ? matchedPreset.response
        : `收到您的要求：**“${finalInput}”**。

作为一个前端演示版本的 AI 助理，我已理解您的意图。关于这个写作建议，我推荐以下思路：
1. **突出核心冲突**：无论是大纲还是正文，首先要提炼出人物的底层需求与外部阻碍。
2. **节奏明快**：目前网络文学与协作审稿非常关注“前三章爆点”和“信息差冲突”，请尽量减少铺垫性废话。
3. **结合平台流程**：您可以在【审稿工作台】或【我的项目】中直接将修改方案以“批注批语”形式附加给作者。

如需体验高保真功能，请点击下方的快捷提示词卡片进行测试！`

      const aiMsg: Message = {
        id: Math.random().toString(36).slice(2, 9),
        role: "assistant",
        content: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, aiMsg])
      setLoading(false)
    }, 1200)
  }

  const handleClear = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `您好，**${user.name}**！对话已重置。请问今天有什么可以帮您？`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ])
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[480px] flex-col gap-4">
      <PageHeader
        breadcrumb={["AI 助手"]}
        title="AI 助手"
        description={`基于大语言模型，辅助${ROLE_LABELS[user.role]}进行高效的小说创作与协同审稿`}
        actions={
          <Button variant="outline" size="sm" onClick={handleClear} className="bg-transparent text-muted-foreground hover:text-foreground">
            <Trash2 className="mr-1.5 size-4" />
            清空对话
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 overflow-hidden lg:grid-cols-4 flex-1">
        {/* 左侧：快捷指令推荐 (1/4 宽) */}
        <div className="flex flex-col gap-3 lg:col-span-1 overflow-y-auto pr-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 py-1">
            快捷指令卡片
          </div>
          {PRESETS.map((preset, idx) => {
            const Icon = preset.icon
            return (
              <Card
                key={idx}
                className="group flex flex-col gap-1.5 p-3.5 cursor-pointer border border-border bg-card transition-all hover:border-primary/50 hover:shadow-sm"
                onClick={() => handleSend(preset.prompt)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="size-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{preset.title}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-normal">{preset.desc}</p>
              </Card>
            )
          })}
        </div>

        {/* 右侧：聊天面板 (3/4 宽) */}
        <Card className="flex flex-col lg:col-span-3 h-full overflow-hidden border border-border bg-card shadow-sm">
          {/* 消息历史滚动区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const isAi = msg.role === "assistant"
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    isAi ? "mr-auto" : "ml-auto flex-row-reverse"
                  )}
                >
                  {/* 头像 */}
                  <div
                    className={cn(
                      "flex size-8 shrink-0 select-none items-center justify-center rounded-lg border text-xs font-semibold shadow-2xs",
                      isAi
                        ? "bg-primary text-primary-foreground border-primary/20"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {isAi ? <Bot className="size-4" /> : <User className="size-4" />}
                  </div>

                  {/* 消息体 */}
                  <div className="space-y-1">
                    <div
                      className={cn(
                        "rounded-xl px-4 py-2.5 text-sm leading-relaxed border",
                        isAi
                          ? "bg-muted/40 text-foreground border-border/60"
                          : "bg-primary text-primary-foreground border-primary/20"
                      )}
                    >
                      {/* Text content formatting */}
                      <div className="whitespace-pre-wrap break-words prose prose-sm dark:prose-invert">
                        {msg.content}
                      </div>
                    </div>
                    
                    <div className={cn("flex items-center gap-2 text-[10px] text-muted-foreground px-1", isAi ? "justify-start" : "justify-end")}>
                      <span>{msg.timestamp}</span>
                      {isAi && msg.id !== "welcome" && (
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="hover:text-foreground transition-colors"
                          title="复制内容"
                        >
                          {copiedId === msg.id ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {loading && (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground border border-primary/20 shadow-2xs animate-pulse">
                  <Bot className="size-4 animate-spin" />
                </div>
                <div className="rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
                  <Sparkles className="size-4 text-primary animate-pulse" />
                  <span>AI 正在思考润色方案，请稍候...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 输入框区 */}
          <div className="border-t border-border p-3.5 bg-muted/30 flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="请输入您的问题或修改指令，按回车发送..."
              className="resize-none min-h-[44px] h-[44px] max-h-[100px] border-border bg-background focus-visible:ring-primary focus-visible:ring-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button
              size="icon"
              disabled={loading || !input.trim()}
              onClick={() => handleSend()}
              className="shrink-0 h-11 w-11 shadow-sm"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
