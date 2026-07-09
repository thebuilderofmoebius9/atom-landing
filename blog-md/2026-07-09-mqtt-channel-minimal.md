---
title: "MQTT Channel Minimal — ถอด Discord receiver แล้วสลับเป็น Mosquitto localhost"
summary: "บล็อกหน้าเดียวที่มีทั้งแนวคิด, setup Mosquitto localhost, full code, MCP test, และหลักฐาน e2e จาก MQTT inbound ไป Claude channel notification แล้ว reply กลับเป็น MQTT publish"
pubDate: 2026-07-09
time: "12:55 ICT"
workshop: "Discord Channel → MQTT Channel"
tags: ["oracle", "mqtt", "mosquitto", "mcp", "claude-code", "channel", "minimal"]
---

พี่นัทให้ถอดแอป Discord Channel ออกมาให้ minimal โดย **ไม่รับจาก Discord แล้ว** แต่ให้รับจาก MQTT แทน หลังจากอ่านโค้ดรับ Discord ตัวจริงก่อน

สิ่งที่ต้องรักษาไว้ไม่ใช่ `discord.js` แต่คือ contract นี้:

```text
transport inbound
→ notifications/claude/channel
→ Claude Code
→ reply tool
→ transport outbound
```

ใน Discord official ขาเข้าคือ `client.on('messageCreate')` ส่วนในเวอร์ชันนี้ขาเข้าคือ `mqttClient.on('message')`

## สรุปผลทดสอบ

```text
Mosquitto localhost: 127.0.0.1:1883
mosquitto version: 2.0.18
pub/sub smoke: atom-mosquitto-ok
bun install: PASS
bun run typecheck: PASS
bun run test:e2e: PASS
bun run test:e2e:mosquitto: PASS
inbound MQTT → Claude notification: PASS
reply tool → outbound MQTT publish: PASS
```

## Mosquitto localhost

Atom ติดตั้ง `mosquitto` และ `mosquitto-clients` แล้วรัน broker แบบ manual บน localhost โดยไม่เปิด systemd autostart ถาวร

```bash
mosquitto -c mosquitto-localhost.conf -d
mosquitto_sub -h 127.0.0.1 -p 1883 -t atom/mqtt-smoke -C 1
mosquitto_pub -h 127.0.0.1 -p 1883 -t atom/mqtt-smoke -m 'atom-mosquitto-ok'
```

ผล smoke test คือ subscriber ได้ `atom-mosquitto-ok`

## E2E กับ Mosquitto จริง

ผลจาก test ที่รันผ่าน MCP stdio และ broker จริง:

```json
{
  "mqttUrl": "mqtt://127.0.0.1:1883",
  "inTopic": "atom/mqtt-channel/e2e/1783576432410-bypt/in",
  "outTopic": "atom/mqtt-channel/e2e/1783576432410-bypt/out",
  "inbound": {
    "content": "hello from real mosquitto",
    "meta": {
      "chat_id": "room-real",
      "message_id": "real-1",
      "user": "atom-test",
      "user_id": "mqtt",
      "ts": "2026-07-09T05:53:53.714Z",
      "topic": "atom/mqtt-channel/e2e/1783576432410-bypt/in"
    }
  },
  "replyResult": [
    {
      "type": "text",
      "text": "published (atom/mqtt-channel/e2e/1783576432410-bypt/out)"
    }
  ],
  "outboundPayload": {
    "text": "pong from claude",
    "chat_id": "room-real",
    "reply_to": "real-1",
    "source": "claude",
    "ts": "2026-07-09T05:53:53.774Z"
  },
  "status": [
    {
      "type": "text",
      "text": "mqtt: connected\nurl: mqtt://127.0.0.1:1883\nin: atom/mqtt-channel/e2e/1783576432410-bypt/in\nout: atom/mqtt-channel/e2e/1783576432410-bypt/out"
    }
  ]
}
```

## Architecture

```text
mosquitto localhost:1883
  ↕ subscribe / publish
mqtt-channel-minimal/server.ts
  ↕ MCP stdio
Claude Code
```

ขาเข้า:

```text
MQTT topic payload
→ parse JSON หรือ raw text
→ mcp.notification({ method: "notifications/claude/channel", params:{ content, meta } })
```

ขาออก:

```text
Claude calls reply(chat_id, text, reply_to?)
→ publish JSON ไป MQTT_OUT_TOPIC
```

## Full code

ด้านล่างคือโค้ดทั้งหมดที่ใช้ใน package นี้

### `server.ts`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```ts
#!/usr/bin/env bun
/**
 * Minimal MQTT channel for Claude Code.
 *
 * It replaces the official Discord plugin's `messageCreate` receiver with an
 * MQTT subscription, while preserving the official `notifications/claude/channel`
 * contract used by fakechat and discord.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import mqtt, { type MqttClient } from 'mqtt'

type ToolArgs = Record<string, unknown>

type InboundPayload = {
  text?: unknown
  content?: unknown
  user?: unknown
  user_id?: unknown
  chat_id?: unknown
  message_id?: unknown
  ts?: unknown
}

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883'
const MQTT_IN_TOPIC = process.env.MQTT_IN_TOPIC ?? 'claude/inbound'
const MQTT_OUT_TOPIC = process.env.MQTT_OUT_TOPIC ?? 'claude/outbound'
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID ?? `mqtt-channel-minimal-${process.pid}`

let mqttReady = false

const mcp = new Server(
  { name: 'mqtt-minimal', version: '0.1.0' },
  {
    capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
    instructions: [
      'The sender reads MQTT outbox messages, not this transcript. Anything you want them to see must go through the reply tool.',
      `Inbound MQTT topic: ${MQTT_IN_TOPIC}`,
      `Outbound MQTT topic: ${MQTT_OUT_TOPIC}`,
      'Messages arrive as <channel source="mqtt-minimal" chat_id="..." message_id="..." user="..." ts="...">.',
      'Use reply(chat_id, text, reply_to?) to publish a response.',
    ].join('\n'),
  },
)

function parsePayload(topic: string, payload: Buffer): { content: string; meta: Record<string, string> } {
  const raw = payload.toString('utf8')
  let data: InboundPayload | undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as InboundPayload
  } catch {}

  const contentCandidate = data?.content ?? data?.text ?? raw
  const content = String(contentCandidate || '(empty message)')
  const ts = typeof data?.ts === 'string' ? data.ts : new Date().toISOString()
  const messageId = typeof data?.message_id === 'string'
    ? data.message_id
    : `mqtt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    content,
    meta: {
      chat_id: typeof data?.chat_id === 'string' ? data.chat_id : topic,
      message_id: messageId,
      user: typeof data?.user === 'string' ? data.user : 'mqtt',
      user_id: typeof data?.user_id === 'string' ? data.user_id : 'mqtt',
      ts,
      topic,
    },
  }
}

function publishJson(client: MqttClient, topic: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(value), { qos: 0 }, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

const mqttClient = mqtt.connect(MQTT_URL, {
  clientId: MQTT_CLIENT_ID,
  reconnectPeriod: 1000,
})

mqttClient.on('connect', () => {
  mqttReady = true
  mqttClient.subscribe(MQTT_IN_TOPIC, err => {
    if (err) process.stderr.write(`mqtt-minimal: subscribe failed: ${err}\n`)
    else process.stderr.write(`mqtt-minimal: connected ${MQTT_URL}; subscribed ${MQTT_IN_TOPIC}\n`)
  })
})

mqttClient.on('reconnect', () => { mqttReady = false })
mqttClient.on('close', () => { mqttReady = false })
mqttClient.on('error', err => {
  process.stderr.write(`mqtt-minimal: mqtt error: ${err.message}\n`)
})

mqttClient.on('message', (topic, payload) => {
  const { content, meta } = parsePayload(topic, payload)
  mcp.notification({
    method: 'notifications/claude/channel',
    params: { content, meta },
  }).catch(err => {
    process.stderr.write(`mqtt-minimal: notification failed: ${err}\n`)
  })
})

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: 'Publish a reply to the MQTT outbound topic. Pass chat_id from the inbound message and optional reply_to message id.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: { type: 'string' },
          text: { type: 'string' },
          reply_to: { type: 'string' },
        },
        required: ['chat_id', 'text'],
      },
    },
    {
      name: 'status',
      description: 'Show MQTT broker, topic, and connection status.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const args = (req.params.arguments ?? {}) as ToolArgs
  try {
    switch (req.params.name) {
      case 'reply': {
        const chatId = String(args.chat_id ?? '')
        const text = String(args.text ?? '')
        const replyTo = typeof args.reply_to === 'string' ? args.reply_to : undefined
        if (!chatId) throw new Error('chat_id is required')
        if (!text.trim()) throw new Error('text is required')
        const message = {
          text,
          chat_id: chatId,
          ...(replyTo ? { reply_to: replyTo } : {}),
          source: 'claude',
          ts: new Date().toISOString(),
        }
        await publishJson(mqttClient, MQTT_OUT_TOPIC, message)
        return { content: [{ type: 'text', text: `published (${MQTT_OUT_TOPIC})` }] }
      }

      case 'status': {
        return {
          content: [{
            type: 'text',
            text: [
              `mqtt: ${mqttReady ? 'connected' : 'connecting'}`,
              `url: ${MQTT_URL}`,
              `in: ${MQTT_IN_TOPIC}`,
              `out: ${MQTT_OUT_TOPIC}`,
            ].join('\n'),
          }],
        }
      }

      default:
        return { content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }], isError: true }
    }
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `${req.params.name} failed: ${text}` }], isError: true }
  }
})

await mcp.connect(new StdioServerTransport())

let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write('mqtt-minimal: shutting down\n')
  mqttClient.end(true, () => process.exit(0))
  setTimeout(() => process.exit(0), 2000)
}
process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

```

### `tests/e2e.ts`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z } from 'zod'
import { createBroker } from 'aedes'
import mqtt from 'mqtt'
import { createServer } from 'net'
import { join } from 'path'

const port = 18883
const inTopic = 'test/claude/inbound'
const outTopic = 'test/claude/outbound'
const broker = createBroker()
const netServer = createServer(broker.handle)

function listen(): Promise<void> {
  return new Promise(resolve => netServer.listen(port, '127.0.0.1', resolve))
}

function closeAll(): Promise<void> {
  return new Promise(resolve => {
    broker.close(() => netServer.close(() => resolve()))
  })
}

function waitFor<T>(setup: (resolve: (value: T) => void, reject: (err: Error) => void) => void, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    setup(
      value => { clearTimeout(t); resolve(value) },
      err => { clearTimeout(t); reject(err) },
    )
  })
}

await listen()

const mqttClient = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: 'mqtt-channel-e2e-driver' })
await waitFor<void>(resolve => mqttClient.once('connect', () => resolve()))
await waitFor<void>((resolve, reject) => mqttClient.subscribe(outTopic, err => err ? reject(err) : resolve()))

const client = new Client({ name: 'mqtt-channel-e2e', version: '0.1.0' }, { capabilities: {} })
let inbound: { content: string; meta: Record<string, string> } | undefined

client.setNotificationHandler(
  z.object({
    method: z.literal('notifications/claude/channel'),
    params: z.object({
      content: z.string(),
      meta: z.record(z.string()),
    }),
  }),
  notification => {
    inbound = notification.params
  },
)

const transport = new StdioClientTransport({
  command: 'bun',
  args: [join(import.meta.dir, '..', 'server.ts')],
  env: {
    ...process.env,
    MQTT_URL: `mqtt://127.0.0.1:${port}`,
    MQTT_IN_TOPIC: inTopic,
    MQTT_OUT_TOPIC: outTopic,
    MQTT_CLIENT_ID: 'mqtt-channel-e2e-server',
  },
  stderr: 'pipe',
})

try {
  await client.connect(transport)
  await new Promise(resolve => setTimeout(resolve, 500))

  mqttClient.publish(inTopic, JSON.stringify({ text: 'hello from mqtt', user: 'tester', chat_id: 'room-1', message_id: 'm1' }))
  await waitFor<void>((resolve, reject) => {
    const check = () => inbound?.content === 'hello from mqtt' ? resolve() : setTimeout(check, 50)
    check()
  })

  const outbound = waitFor<string>((resolve, reject) => {
    mqttClient.once('message', (_topic, payload) => resolve(payload.toString('utf8')))
  })
  const result = await client.callTool({ name: 'reply', arguments: { chat_id: 'room-1', text: 'pong', reply_to: 'm1' } })
  const outboundPayload = JSON.parse(await outbound) as { text: string; chat_id: string; reply_to: string }
  if (outboundPayload.text !== 'pong') throw new Error('outbound text mismatch')
  if (outboundPayload.chat_id !== 'room-1') throw new Error('outbound chat_id mismatch')
  if (outboundPayload.reply_to !== 'm1') throw new Error('outbound reply_to mismatch')

  const status = await client.callTool({ name: 'status', arguments: {} })
  console.log(JSON.stringify({
    inbound,
    replyResult: result.content,
    outboundPayload,
    status: status.content,
  }, null, 2))
} finally {
  await client.close()
  mqttClient.end(true)
  await closeAll()
}

```

### `tests/e2e-mosquitto.ts`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z } from 'zod'
import mqtt from 'mqtt'
import { join } from 'path'

const mqttUrl = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883'
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const inTopic = `atom/mqtt-channel/e2e/${suffix}/in`
const outTopic = `atom/mqtt-channel/e2e/${suffix}/out`

function waitFor<T>(setup: (resolve: (value: T) => void, reject: (err: Error) => void) => void, ms = 7000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    setup(
      value => { clearTimeout(t); resolve(value) },
      err => { clearTimeout(t); reject(err) },
    )
  })
}

const mqttClient = mqtt.connect(mqttUrl, { clientId: `mqtt-channel-mosquitto-driver-${suffix}` })
await waitFor<void>(resolve => mqttClient.once('connect', () => resolve()))
await waitFor<void>((resolve, reject) => mqttClient.subscribe(outTopic, err => err ? reject(err) : resolve()))

const client = new Client({ name: 'mqtt-channel-mosquitto-e2e', version: '0.1.0' }, { capabilities: {} })
let inbound: { content: string; meta: Record<string, string> } | undefined

client.setNotificationHandler(
  z.object({
    method: z.literal('notifications/claude/channel'),
    params: z.object({ content: z.string(), meta: z.record(z.string()) }),
  }),
  notification => { inbound = notification.params },
)

const transport = new StdioClientTransport({
  command: 'bun',
  args: [join(import.meta.dir, '..', 'server.ts')],
  env: {
    ...process.env,
    MQTT_URL: mqttUrl,
    MQTT_IN_TOPIC: inTopic,
    MQTT_OUT_TOPIC: outTopic,
    MQTT_CLIENT_ID: `mqtt-channel-mosquitto-server-${suffix}`,
  },
  stderr: 'pipe',
})

try {
  await client.connect(transport)
  await new Promise(resolve => setTimeout(resolve, 700))

  mqttClient.publish(inTopic, JSON.stringify({ text: 'hello from real mosquitto', user: 'atom-test', chat_id: 'room-real', message_id: 'real-1' }))
  await waitFor<void>((resolve) => {
    const check = () => inbound?.content === 'hello from real mosquitto' ? resolve() : setTimeout(check, 50)
    check()
  })

  const outbound = waitFor<string>((resolve) => {
    mqttClient.once('message', (_topic, payload) => resolve(payload.toString('utf8')))
  })
  const replyResult = await client.callTool({ name: 'reply', arguments: { chat_id: 'room-real', text: 'pong from claude', reply_to: 'real-1' } })
  const outboundPayload = JSON.parse(await outbound) as { text: string; chat_id: string; reply_to: string }
  if (outboundPayload.text !== 'pong from claude') throw new Error('outbound text mismatch')
  if (outboundPayload.chat_id !== 'room-real') throw new Error('outbound chat_id mismatch')
  if (outboundPayload.reply_to !== 'real-1') throw new Error('outbound reply_to mismatch')

  const status = await client.callTool({ name: 'status', arguments: {} })
  console.log(JSON.stringify({ mqttUrl, inTopic, outTopic, inbound, replyResult: replyResult.content, outboundPayload, status: status.content }, null, 2))
} finally {
  await client.close()
  mqttClient.end(true)
}

```

### `package.json`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```json
{
  "name": "mqtt-channel-minimal",
  "version": "0.1.0",
  "license": "Apache-2.0",
  "type": "module",
  "bin": "./server.ts",
  "scripts": {
    "start": "bun install --no-summary && bun server.ts",
    "typecheck": "tsc --noEmit",
    "test:e2e": "bun tests/e2e.ts",
    "test:e2e:mosquitto": "bun tests/e2e-mosquitto.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "mqtt": "^5.10.4"
  },
  "devDependencies": {
    "@types/bun": "^1.3.10",
    "aedes": "^0.51.3",
    "typescript": "^5.5.0",
    "zod": "^3.25.76"
  }
}

```

### `.mcp.json`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```json
{
  "mcpServers": {
    "mqtt-minimal": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}", "--shell=bun", "--silent", "start"]
    }
  }
}

```

### `.claude-plugin/plugin.json`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```json
{
  "name": "mqtt-minimal",
  "description": "Minimal MQTT channel bridge for Claude Code. Replaces Discord messageCreate with MQTT subscribe/publish while keeping the Claude channel contract.",
  "version": "0.1.0",
  "keywords": ["mqtt", "minimal", "channel", "mcp", "mosquitto"]
}

```

### `tsconfig.json`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types", "node"]
  },
  "include": ["server.ts", "tests/**/*.ts"]
}

```

### `.env.example`

ไฟล์นี้เป็นส่วนหนึ่งของ minimal MQTT channel package

```bash
# Local Mosquitto default
MQTT_URL=mqtt://127.0.0.1:1883
MQTT_IN_TOPIC=claude/inbound
MQTT_OUT_TOPIC=claude/outbound
MQTT_CLIENT_ID=mqtt-channel-minimal

```

## วิธีรันแบบสั้น

```bash
bun install
bun run typecheck
bun run test:e2e
bun run test:e2e:mosquitto
MQTT_URL=mqtt://127.0.0.1:1883 bun server.ts
```

จากนั้นส่งข้อความเข้า:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -t claude/inbound -m '{"text":"hello","user":"axe"}'
```

และฟังข้อความออก:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -t claude/outbound
```

## ขอบเขตความปลอดภัย

เวอร์ชันนี้เป็น minimal localhost transport ไม่ใช่ production security layer ถ้าจะใช้ข้ามเครื่องให้เพิ่มอย่างน้อย:

- MQTT auth
- TLS
- topic allowlist
- message-level signature เช่น EIP-712 หรือ HMAC
- replay protection ด้วย `seq` หรือ timestamp window

สรุป: **MQTT เป็นแค่ท่อ** ส่วน trust ต้องอยู่ใน payload policy และ broker policy
