---
title: "Discord Channel + MCP — notification, tool call, stdio และ control plane"
summary: "Technical deep dive จาก source จริงของ anthropics/claude-plugins-official: Discord channel plugin ไม่ใช่แค่ tool แต่เป็นสะพานระหว่าง Discord Gateway, MCP stdio, notifications/claude/channel, tools และ permission control plane"
pubDate: 2026-07-09
time: "09:55 ICT"
workshop: "Discord Channel / MCP"
tags: ["oracle", "mcp", "discord", "claude-code", "channel", "technical", "source-audit"]
---

โพสต์นี้ตอบคำถามว่า **Discord channel ของ Claude Code เกี่ยวกับ MCP อย่างไร** และทำไมมันไม่ใช่ “tool plugin ธรรมดา” แต่เป็น bridge หลายชั้นที่มีทั้ง transport, data plane, tool plane และ control plane อยู่ในไฟล์เดียว

หลักฐานที่ใช้:

```text
repo:   anthropics/claude-plugins-official
commit: 73e22af437e0d09b6534854ac0f3d4884dd9d9a3
files:
  external_plugins/fakechat/server.ts   295 lines
  external_plugins/discord/server.ts    900 lines
  external_plugins/telegram/server.ts  1038 lines
  external_plugins/imessage/server.ts   875 lines
MCP docs:
  https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
  https://modelcontextprotocol.io/specification/draft/basic/transports
```

## 1. MCP transport ไม่ใช่ Discord Gateway

MCP spec รุ่น 2025-11-25 ระบุ standard transport หลัก 2 แบบ:

```text
1. stdio — client launch server เป็น subprocess แล้วคุยผ่าน stdin/stdout
2. Streamable HTTP — POST/GET ที่ endpoint เดียว พร้อม SSE stream ได้
```

ใน official Discord channel plugin เส้น MCP ที่ต่อกับ Claude Code คือ **stdio**:

```ts
// external_plugins/discord/server.ts:14
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

// external_plugins/discord/server.ts:723
await mcp.connect(new StdioServerTransport())
```

ดังนั้น architecture ที่ถูกต้องคือ:

```text
Discord Gateway / REST API
  ↕
discord/server.ts
  ↕  MCP JSON-RPC over stdio
Claude Code
```

Discord Gateway เป็น transport ของ Discord เอง ไม่ใช่ MCP transport ส่วน MCP transport คือ stdio ระหว่าง `server.ts` กับ Claude Code

## 2. Channel plugin คือ MCP server ที่ประกาศ capability พิเศษ

Discord plugin สร้าง MCP `Server` แล้วประกาศ 2 อย่างพร้อมกัน:

```ts
// external_plugins/discord/server.ts:440-453
const mcp = new Server(
  { name: 'discord', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
      experimental: {
        'claude/channel': {},
        'claude/channel/permission': {},
      },
    },
    instructions: [...].join('\n'),
  },
)
```

แปลว่า plugin นี้ไม่ได้มีแค่ `tools` แต่ประกาศ `experimental.claude/channel` ด้วย เพื่อบอก Claude Code ว่า server นี้สามารถ push ข้อความ inbound เข้า session ได้

ตารางนี้คือเส้นแบ่งสำคัญ:

| ชั้น | อยู่ตรงไหน | หน้าที่ | ใครเริ่มก่อน |
|---|---|---|---|
| MCP transport | stdio | ขน JSON-RPC ระหว่าง Claude Code กับ plugin | Claude Code launch subprocess |
| Discord transport | Gateway + REST | รับ event / ส่ง message กับ Discord | Discord หรือ plugin |
| Channel data plane | `notifications/claude/channel` | push ข้อความคนเข้า Claude | Discord user |
| Tool plane | `reply`, `react`, `edit_message`, `download_attachment`, `fetch_messages` | Claude สั่ง action กลับออกไป | Claude |
| Permission control plane | `notifications/claude/channel/permission*` | approve/deny tool execution ผ่านช่องทางที่ authenticate แล้ว | Claude Code + allowlisted user |

## 3. ขาเข้า: Discord message กลายเป็น notification

จุดเริ่มคือ Discord Gateway event:

```ts
// external_plugins/discord/server.ts:805-807
client.on('messageCreate', msg => {
  if (msg.author.bot) return
  handleInbound(msg).catch(e => process.stderr.write(`discord: handleInbound failed: ${e}\n`))
})
```

จากนั้น `handleInbound()` ผ่าน gate ก่อน ถ้าไม่ผ่านก็ drop:

```ts
// external_plugins/discord/server.ts:810-813
async function handleInbound(msg: Message): Promise<void> {
  const result = await gate(msg)

  if (result.action === 'drop') return
```

ถ้าผ่าน gate แล้ว plugin emit notification เข้า Claude:

```ts
// external_plugins/discord/server.ts:875-880
mcp.notification({
  method: 'notifications/claude/channel',
  params: {
    content,
    meta: {
      chat_id,
```

นี่คือ marker ที่ทำให้มันเป็น **channel**: โลกภายนอก push เข้ามาเองโดย Claude ไม่ต้องเรียก tool ก่อน

## 4. ขาออก: Claude ต้องเรียก tool เท่านั้น

Discord plugin register tools 5 ตัว:

```ts
// external_plugins/discord/server.ts:520-599
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'reply', ... },
    { name: 'react', ... },
    { name: 'edit_message', ... },
    { name: 'download_attachment', ... },
    { name: 'fetch_messages', ... },
  ],
}))
```

แล้วรับ tool call ผ่าน `CallToolRequestSchema`:

```ts
// external_plugins/discord/server.ts:601-605
mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  try {
    switch (req.params.name) {
      case 'reply': {
```

สรุปทิศทาง:

```text
Discord → Claude
  notification: notifications/claude/channel
  fire-and-forget style

Claude → Discord
  tool call: reply/react/edit_message/download_attachment/fetch_messages
  request/response style
```

## 5. `reply` ไม่ใช่ transcript output

Official instructions บอกชัดว่า transcript ของ Claude ไม่ไปถึง Discord เอง:

```ts
// external_plugins/discord/server.ts:455-460
'The sender reads Discord, not this session. Anything you want them to see must go through the reply tool — your transcript output never reaches their chat.'

'Messages from Discord arrive as <channel source="discord" chat_id="..." message_id="..." user="..." ts="...">... Reply with the reply tool — pass chat_id back.'

'reply accepts file paths (files: ["/abs/path.png"]) for attachments. Use react to add emoji reactions, and edit_message for interim progress updates.'
```

จุดนี้สำคัญมากสำหรับ threat model: model “พูดใน session” กับ “ส่งไปหาคนใน Discord” เป็นคนละ action ต้องผ่าน tool ที่ plugin คุมได้

## 6. Gate: channel inbound ต้องมี access control

`access.json` เป็น state ของ channel ไม่ใช่ prompt ธรรมดา:

```ts
// external_plugins/discord/server.ts:38
const ACCESS_FILE = join(STATE_DIR, 'access.json')

// external_plugins/discord/server.ts:123-129
function defaultAccess(): Access {
  return {
    dmPolicy: 'pairing',
    allowFrom: [],
    groups: {},
    pending: {},
  }
}
```

DM path:

```ts
// external_plugins/discord/server.ts:246-273
if (isDM) {
  if (access.allowFrom.includes(senderId)) return { action: 'deliver', access }
  if (access.dmPolicy === 'allowlist') return { action: 'drop' }

  // pairing mode — check for existing non-expired code for this sender
  ...
  access.pending[code] = {
    senderId,
    chatId: msg.channelId,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1000,
    replies: 1,
  }
  saveAccess(access)
  return { action: 'pair', code, isResend: false }
}
```

Guild/thread path:

```ts
// external_plugins/discord/server.ts:276-293
const channelId = msg.channel.isThread()
  ? msg.channel.parentId ?? msg.channelId
  : msg.channelId
const policy = access.groups[channelId]
if (!policy) return { action: 'drop' }
const groupAllowFrom = policy.allowFrom ?? []
const requireMention = policy.requireMention ?? true
if (groupAllowFrom.length > 0 && !groupAllowFrom.includes(senderId)) {
  return { action: 'drop' }
}
if (requireMention && !(await isMentioned(msg, access.mentionPatterns))) {
  return { action: 'drop' }
}
return { action: 'deliver', access }
```

ดังนั้น “channel” ที่รับข้อความจากคนต้องมี gate เพราะ inbound จากโลกภายนอกคือ attack surface

## 7. Permission control plane: ท่อที่สาม

Discord plugin ไม่ได้มีแค่ data plane + tool plane แต่มี permission plane ด้วย

Claude Code ส่ง permission request มาที่ plugin:

```ts
// external_plugins/discord/server.ts:472-479
mcp.setNotificationHandler(
  z.object({
    method: z.literal('notifications/claude/channel/permission_request'),
    params: z.object({
      request_id: z.string(),
      tool_name: z.string(),
```

User กดปุ่มหรือพิมพ์ yes/no แล้ว plugin ส่งกลับเป็น permission notification:

```ts
// external_plugins/discord/server.ts:833-845
const permMatch = PERMISSION_REPLY_RE.exec(msg.content)
if (permMatch) {
  void mcp.notification({
    method: 'notifications/claude/channel/permission',
    params: {
      request_id: permMatch[2]!.toLowerCase(),
      behavior: permMatch[1]!.toLowerCase().startsWith('y') ? 'allow' : 'deny',
    },
  })
```

ปุ่ม Discord ก็ถูก gate ด้วย `allowFrom`:

```ts
// external_plugins/discord/server.ts:744-753
client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isButton()) return
  const m = /^perm:(allow|deny|more):([a-km-z]{5})$/.exec(interaction.customId)
  if (!m) return
  const access = loadAccess()
  if (!access.allowFrom.includes(interaction.user.id)) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true }).catch(() => {})
    return
  }
```

นี่คือเหตุผลที่ permission approval ผ่าน channel ต้อง authenticate replier ไม่อย่างนั้นคนในห้องอาจกลายเป็นผู้อนุมัติ tool execution บนเครื่อง owner

## 8. fakechat vs Discord: skeleton vs production channel

ทั้งสองตัวใช้ MCP stdio และ `notifications/claude/channel` เหมือนกัน แต่ขอบเขตต่างกันมาก

| item | fakechat | Discord |
|---|---|---|
| LOC | 295 | 900 |
| MCP transport | `StdioServerTransport` line 10, connect line 133 | `StdioServerTransport` line 14, connect line 723 |
| inbound marker | `notifications/claude/channel` line 139 | `notifications/claude/channel` line 876 |
| tools | `reply`, `edit_message` | `reply`, `react`, `edit_message`, `download_attachment`, `fetch_messages` |
| external network | local Bun server / browser UI | Discord Gateway + REST API |
| auth/access | no token, no access control | `DISCORD_BOT_TOKEN`, `access.json`, `dmPolicy`, `allowFrom`, `groups` |
| permission plane | none | `permission_request`, `permission`, button/text reply handling |
| intended role | contract skeleton / local teaching | production-ish bridge to real people |

fakechat source:

```ts
// external_plugins/fakechat/server.ts:59-63
const mcp = new Server(
  { name: 'fakechat', version: '0.1.0' },
  {
    capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
    instructions: `The sender reads the fakechat UI, not this session...`,
```

fakechat inbound:

```ts
// external_plugins/fakechat/server.ts:135-140
function deliver(id: string, text: string, file?: { path: string; name: string }): void {
  void mcp.notification({
    method: 'notifications/claude/channel',
    params: {
```

fakechat is useful because it shows the minimal contract: tool list + stdio connect + channel notification

Discord is larger because real Discord means auth, token, pair/allowlist, permission request relay, attachment handling, history fetching, typing/reaction UX, shutdown hygiene, and anti-forgery comments around metadata

## 9. Telegram / iMessage confirm the pattern

Telegram and iMessage repeat the same channel grammar:

```ts
// external_plugins/telegram/server.ts:388-394
experimental: {
  'claude/channel': {},
  'claude/channel/permission': {},
}

// external_plugins/telegram/server.ts:420
method: z.literal('notifications/claude/channel/permission_request')
```

```ts
// external_plugins/imessage/server.ts:548-555
experimental: {
  'claude/channel': {},
  'claude/channel/permission': {},
}

// external_plugins/imessage/server.ts:576
method: z.literal('notifications/claude/channel/permission_request')
```

ต่างกันตรง platform adapter:

| channel | external adapter | history model | attachment model | default access |
|---|---|---|---|---|
| Discord | Gateway + REST | `fetch_messages` ได้ สูงสุดตาม Discord API cap | download on demand | pairing |
| Telegram | Bot API | ไม่มี history/search ใน bot API ตาม instructions | file_id → download | pairing |
| iMessage | local `chat.db` + Messages attachments | อ่าน `chat.db` แบบ scoped | local attachment path | allowlist |
| fakechat | local web UI | in-memory/browser demo | local upload path | none |

## 10. Security details ที่ซ่อนอยู่ใน source

### 10.1 Attachment metadata อยู่ใน meta ไม่ใช่ content

```ts
// external_plugins/discord/server.ts:862-873
// Attachments are listed (name/type/size) but not downloaded — the model
// calls download_attachment when it wants them.
...
// Attachment listing goes in meta only — an in-content annotation is
// forgeable by any allowlisted sender typing that string.
const content = msg.content || (atts.length > 0 ? '(attachment)' : '')
```

นี่คือ anti-forgery design: ถ้าข้อมูลพิเศษอยู่ในข้อความธรรมดา ผู้ส่งสามารถพิมพ์หลอกได้ แต่ถ้าอยู่ใน `meta` มาจาก plugin เท่านั้น

### 10.2 Channel state ห้ามส่งออกเป็น attachment

```ts
// external_plugins/discord/server.ts:135-148
// reply's files param takes any path. .env is ~60 bytes and ships as an
// upload. Claude can already Read+paste file contents, so this isn't a new
// exfil channel for arbitrary paths — but the server's own state is the one
// thing Claude has no reason to ever send.
function assertSendable(f: string): void {
  ...
  if (real.startsWith(stateReal + sep) && !real.startsWith(inbox + sep)) {
    throw new Error(`refusing to send channel state: ${f}`)
  }
}
```

Discord/Telegram ยอมให้ส่งไฟล์จาก `inbox` แต่ไม่ให้ส่ง state ของ channel เอง เช่น `access.json`

### 10.3 `fetch_messages` sanitize newline

```ts
// external_plugins/discord/server.ts:670-675
// Tool result is newline-joined; multi-line content forges adjacent rows.
const text = m.content.replace(/[\r\n]+/g, ' ⏎ ')
return `[${m.createdAt.toISOString()}] ${who}: ${text}  (id: ${m.id}${atts})`
```

นี่คืออีก anti-forgery detail: ถ้า content หลายบรรทัดอยู่ใน result ที่ join ด้วย newline ผู้ส่งสามารถทำให้ log ดูเหมือนมี record เพิ่มได้

## 11. Model ที่ควรจำ

ถ้าจะอธิบาย Discord channel + MCP แบบสั้นที่สุด:

```text
MCP stdio = pipe ระหว่าง Claude Code กับ plugin
Discord Gateway = event source จากโลกภายนอก
notifications/claude/channel = data plane ขาเข้า
MCP tools = action plane ขาออก
notifications/claude/channel/permission* = control plane สำหรับอนุมัติ tool execution
access.json = policy state ที่กันคนภายนอก push เข้า session หรือ approve งานแทน owner
```

หรือเขียนเป็น flow:

```text
คนพิมพ์ใน Discord
  → Discord Gateway messageCreate
  → gate(access.json, dmPolicy, allowFrom, groups, mention)
  → mcp.notification('notifications/claude/channel', content + meta)
  → Claude เห็น <channel source="discord" ...>
  → Claude เรียก tool reply/react/edit/download/fetch
  → plugin ใช้ Discord REST ส่งผลกลับ
```

## 12. Checklist เวลา audit channel plugin

| check | grep marker | ทำไมสำคัญ |
|---|---|---|
| MCP transport | `StdioServerTransport` | รู้ว่า Claude Code คุยกับ plugin ผ่าน pipe แบบไหน |
| channel capability | `'claude/channel'` | แยก channel จาก tool-only server |
| inbound notification | `notifications/claude/channel` | marker ของโลกภายนอก push เข้า Claude |
| tool registry | `ListToolsRequestSchema` | ดู action ที่ Claude เรียกออกได้ |
| tool handler | `CallToolRequestSchema` | ดู side effect จริงของแต่ละ tool |
| access state | `access.json`, `dmPolicy`, `allowFrom` | ตรวจว่าใครมีสิทธิ์ส่งเข้า/อนุมัติ |
| permission plane | `permission_request`, `permission` | ตรวจ control path ที่อาจให้สิทธิ์รัน tool |
| anti-forgery | `meta`, newline sanitize | ตรวจว่าข้อมูล machine-readable forge ได้ไหม |
| file exfil guard | `assertSendable` | ตรวจว่า state/token ไม่ถูกส่งกลับออกไปง่าย ๆ |

## สรุป

Discord channel plugin คือ **MCP server over stdio** ที่ทำหน้าที่เป็น protocol translator ระหว่าง Discord กับ Claude Code

สิ่งที่ทำให้มันเป็น channel ไม่ใช่ชื่อ plugin แต่คือความสามารถในการ emit:

```text
notifications/claude/channel
```

ส่วน tool คือสิ่งที่ Claude เรียกเองหลังจากได้รับ context แล้ว:

```text
reply / react / edit_message / download_attachment / fetch_messages
```

และสิ่งที่ทำให้ Discord หนักกว่า fakechat คือ real-world boundary: token, gateway, REST, access policy, permission approval, attachment handling, history, anti-forgery, และ shutdown hygiene

ถ้าจะจำแค่ประโยคเดียว: **Channel คือปากทางที่โลกภายนอก push เข้า Claude ได้; Tool คือมือที่ Claude เลือกใช้; MCP stdio คือท่อที่สองฝั่งใช้คุยกัน; permission plane คือเบรกมือของ owner**
