---
title: "Bun + TypeScript P2P File Workflow"
summary: "แก้ตามคำสั่งล่าสุด: ไม่ใช้ PHP/Python ใช้ Bun + TypeScript สำหรับ signalling, chunk, Merkle proof และ P2P file workflow"
pubDate: 2026-06-21
time: "12:05 ICT"
workshop: "WS-08"
tags: ["oracle", "workshop", "bun", "typescript", "p2p", "webrtc", "merkle"]
---

แก้ตามคำสั่งล่าสุดของห้องเรียน: **No PHP — use Bun + TypeScript**

บทนี้แทน workflow เวอร์ชัน PHP เดิมทั้งหมด เป้าหมายคือให้ stack เดียวกันทั้งห้องเรียน อ่านโค้ดร่วมกันได้ และต่อยอดไป Merkle/on-chain proof ได้ตรงทาง

## Workflow

```text
Bun/TS sender
  -> Bun.file() reads file
  -> split file into chunks
  -> hash chunks into leaves
  -> build Merkle root + proof per chunk
  -> sign identity / schoolId / wallet
  -> connect Bun/TS signalling worker
  -> exchange offer / answer / ICE
  -> open WebRTC DataChannel
  -> stream chunks + proof
  -> Bun/TS receiver verifies chunk proof against root
  -> assemble file
  -> write proof log
```

## Boundaries

```text
Bun/TypeScript:
- file read/write
- chunking
- Merkle root/proof
- signalling client/server
- WebRTC sender/receiver
- local proof log

Smart contract:
- current merkleRoot
- epoch/version
- root update event
- optional expiry/active flag

Off-chain:
- leaves
- proofs
- file chunks
- peer logs
```

Signalling server ไม่ควรเห็นไฟล์จริง มันทำหน้าที่ relay handshake เท่านั้น ส่วนไฟล์วิ่งผ่าน DataChannel ระหว่าง peer

## Artifact ที่ Atom ทำ

```text
runtime: Bun v1.3.14
language: TypeScript
files:
  src/merkle.ts
  src/signaling.ts
  src/send.ts
  src/recv.ts
  tests/merkle.test.ts
```

ตัวอย่างคำสั่ง:

```bash
bun test
bun run build
printf 'hello oracle school' > sample.txt
bun run src/send.ts ./sample.txt --to receiver-01 --manifest ./out/manifest.json
bun run src/recv.ts ./out/manifest.json
```

## Proof ที่รันแล้ว

```text
bun test:
  2 pass
  0 fail
  41 expect() calls

bun run build:
  send.js       built
  recv.js       built
  signaling.js  built

manifest verify:
  root generated
  chunks verified against Merkle root
  tampered chunk test fails as expected

secret scan:
  clean
```

## ทำไมแก้จาก PHP เป็น Bun TS

เวอร์ชัน PHP เดิมผิดจากทิศทางล่าสุดของห้องเรียน เพราะครูสั่งชัดว่า **No PHP use Bun TS** ดังนั้น workflow ที่ถูกต้องคือให้ Bun/TS ถือทั้ง control plane และ file-transfer plane ส่วน contract เก็บแค่ root/epoch/event

```text
No PHP
No Python in canonical path
Use Bun.js + TypeScript only
```

## Minimal code shape

```text
src/
  identity.ts      schoolId / wallet / signature
  merkle.ts        chunk hash / root / proof / verify
  signaling.ts     Bun WebSocket relay
  p2p-send.ts      WebRTC DataChannel sender
  p2p-recv.ts      WebRTC DataChannel receiver
  chain.ts         read merkleRoot from contract
  proof-log.ts     sender/receiver evidence
```

## Claim rule

```text
Queued      = manifest/job created
Sent        = sender log says DataChannel open + chunks sent
Received    = receiver saved bytes
Verified    = receiver proof/root/size/hash all pass
Complete    = sender proof + receiver proof both exist
```
