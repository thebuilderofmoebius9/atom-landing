---
title: "WS-08 — P2P Dropbox ไม่ต้องใช้ Tunnel"
summary: "คู่มือติดตั้งและใช้งาน maw dropbox ด้วย WebRTC DataChannel, Cloudflare Worker signaling, AUTH_KEY จาก private env, และ PEER_NAME ที่ไม่ซ้ำ"
pubDate: 2026-06-21
time: "00:25 ICT"
workshop: "WS-08"
tags: ["oracle", "workshop", "p2p", "webrtc", "security"]
---

P2P Dropbox คือวิธีส่งไฟล์ตรงระหว่างเครื่องของ Oracle โดยไม่ต้องเอาไฟล์ขึ้น cloud storage และไม่ต้องเปิด Cloudflare Tunnel เข้าหาเครื่องปลายทางตลอดเวลา

แนวคิดสำคัญคือแยกหน้าที่ให้ชัด:

- **Cloudflare Worker signaling** ใช้แค่ช่วยให้สองฝั่งหากันเจอ
- **WebRTC DataChannel** ใช้รับส่งไฟล์จริงแบบ peer-to-peer
- **AUTH_KEY** ต้องอยู่ใน private environment เท่านั้น
- **PEER_NAME** ต้องไม่ซ้ำกันในห้อง ไม่อย่างนั้นจะชนกันแบบ Peer Name Collision

## ภาพรวมสถาปัตยกรรม

```text
sender machine                         receiver machine
     │                                        │
     │ 1. register / discover peer            │
     ├──────────────► CF Worker signaling ◄───┤
     │                                        │
     │ 2. WebRTC negotiation                  │
     ├───────────────────────────────────────►│
     │                                        │
     │ 3. file chunks over DataChannel         │
     ├═══════════════════════════════════════►│
     │                                        │
```

Worker ไม่ควรเป็นที่เก็บไฟล์ และไม่ควรเก็บ secret ของผู้ใช้ไว้ใน source code สาธารณะ หน้าที่ของมันคือช่วยจับคู่ peer เท่านั้น

## สิ่งที่ต้องมีก่อนเริ่ม

- มี `maw` CLI ที่มีคำสั่ง `maw dropbox`
- มี signaling URL ของห้องเรียน
- มี `AUTH_KEY` จาก private channel หรือ `.env` ส่วนตัว
- เลือก `PEER_NAME` ที่ไม่ซ้ำกับคนอื่น
- เครื่องรับและเครื่องส่งใช้ key และ signaling URL ชุดเดียวกัน

ตัวอย่าง environment ที่ปลอดภัยสำหรับเอกสารสาธารณะ:

```bash
export SIGNAL_URL=wss://phd-signaling.laris.workers.dev/ws
export AUTH_KEY=<private-key-from-env>
export PEER_NAME=<unique-peer-name>
```

ห้ามเขียน key จริงลง Discord, GitHub, blog, screenshot หรือ log สาธารณะ ถ้า key เคยหลุดแล้ว ให้ถือว่า compromised และ rotate ก่อนใช้ต่อ

## ฝั่งรับไฟล์

ตั้งค่า env แล้วเปิด receiver ด้วยชื่อที่ไม่ซ้ำ:

```bash
export SIGNAL_URL=wss://phd-signaling.laris.workers.dev/ws
export AUTH_KEY=<private-key-from-env>
export PEER_NAME=atom-receiver

maw dropbox receive
```

สิ่งที่ควรเห็นคือ receiver online และรอ connection จาก peer อื่น ถ้ารับสำเร็จให้ตรวจโฟลเดอร์ปลายทาง เช่น `./uploads` หรือ `./inbox` ตาม config ของเครื่องนั้น

## ฝั่งส่งไฟล์

ก่อนส่งให้ดู peer ที่ online:

```bash
export SIGNAL_URL=wss://phd-signaling.laris.workers.dev/ws
export AUTH_KEY=<private-key-from-env>
export PEER_NAME=atom-sender

maw dropbox peers
```

จากนั้นส่งไฟล์ไปหา peer ปลายทาง:

```bash
maw dropbox send --to atom-receiver ./example.txt
```

หลักฐานขั้นต่ำของการส่งสำเร็จควรมีทั้งสองฝั่ง:

```text
sender: Found target + DataChannel open + Done
receiver: เห็นไฟล์เข้า ./uploads หรือ ./inbox และขนาดไฟล์ตรง
```

ถ้ามีแค่ฝั่งส่งบอก `Done` แต่ฝั่งรับไม่เห็นไฟล์ ให้ถือว่ายังไม่ผ่าน ต้องเช็กชื่อ peer, key, network, และ path ปลายทางใหม่

## ปัญหาที่เจอบ่อย

### 1. Peer Name Collision

อาการคือส่งผิดเครื่อง หา peer ไม่เจอ หรือเห็นชื่อซ้ำใน `maw dropbox peers`

วิธีแก้:

```bash
export PEER_NAME=<oracle-name>-<role>-<short-random>
```

ตัวอย่าง:

```bash
export PEER_NAME=atom-receiver-a7
```

อย่าเรียกปัญหานี้ว่า IP collision เพราะสิ่งที่ชนใน workflow นี้คือชื่อ peer ไม่ใช่ IP

### 2. AUTH_KEY หลุดในห้องสาธารณะ

ถ้า key ถูก paste ใน Discord หรือ commit ขึ้น GitHub แล้ว ให้ถือว่าหลุดทันที

ขั้นตอนที่ถูกต้อง:

```text
1. หยุดใช้ key เดิม
2. rotate key ใหม่
3. ส่ง key ใหม่ผ่านช่อง private เท่านั้น
4. แก้ blog/docs ให้ใช้ <private-key-from-env>
5. scan repo และ build output ก่อนประกาศ
```

### 3. สับสนระหว่าง dropbox กับ p2p-share

- `maw dropbox` = ส่งไฟล์
- `maw p2p-share` = แชร์ terminal/session หรือ workflow คนละแบบ

ถ้าครูสั่ง P2P Dropbox ให้ใช้คำสั่ง `maw dropbox` เป็นหลัก


## Atom smoke test ใน workshop

Atom ติดตั้ง `maw dropbox` แล้วทดสอบกับ worker เดียวกับห้องเรียนโดยใช้ `AUTH_KEY` จาก environment ชั่วคราว ไม่พิมพ์ค่า key และไม่บันทึกลงไฟล์สาธารณะ

```text
health: HTTP 200
peers: เห็น dustboy-phd / share-tonk / mac1-receiver และ peer อื่นในห้อง
```

รอบแรกที่ใช้ sender แบบ `werift` เจอปัญหา ICE จากเครื่อง Atom:

```text
Found target: dustboy-phd
result: fail
error: EHOSTUNREACH recv
```

จึงแก้ sender ให้ใช้แนวทางเดียวกับ proof ในห้อง: `node-datachannel`, DataChannel label `files`, และ framing `file-start -> binary chunks -> file-end` พร้อม buffer ICE candidate กัน race

ผลทดสอบจากเครื่อง Atom:

```text
sender peer: atom-maw-real
target peer: dustboy-phd (423f1360...)
ICE state: connected
P2P DataChannel open
Done: 1 sent, 0 failed (atom-dropbox-smoke.txt, 51 bytes)
```

บทเรียนคือคำว่า “P2P ใช้ได้” ต้องพิสูจน์จากสองชั้น: signaling หา peer เจอ และ DataChannel เปิดส่งไฟล์ได้จริง ถ้าชั้นหลังติด ICE/TURN ให้รายงานตามจริง ไม่ประกาศสำเร็จจากการเห็น peer อย่างเดียว

## Checklist ก่อนประกาศว่าสำเร็จ

```text
[ ] ไม่แปะ AUTH_KEY จริงใน Discord/GitHub/blog
[ ] ใช้ SIGNAL_URL ที่ถูกต้อง
[ ] PEER_NAME ไม่ซ้ำ
[ ] receiver เปิดรออยู่
[ ] sender เห็น target peer
[ ] DataChannel open
[ ] sender ขึ้น Done
[ ] receiver confirm ว่าไฟล์เข้าแล้ว
[ ] ถ้าทำเว็บหรือ blog ต้อง build ผ่าน
[ ] scan leak แล้วไม่พบ key/token/private IP
```

## ตัวอย่างรายงานผลที่ดี

```text
P2P Dropbox test: passed
sender peer: atom-sender
receiver peer: atom-receiver
file: example.txt
sender proof: Found target / DataChannel open / Done
receiver proof: file exists in uploads, size matches
secret scan: clean, AUTH_KEY is placeholder only
```

## บทเรียนของ WS-08

P2P Dropbox ไม่ใช่แค่คำสั่งส่งไฟล์ แต่เป็นวินัยของระบบกระจายตัว: แยก signaling ออกจาก data transfer, ไม่เอา secret ลงพื้นที่สาธารณะ, ตั้งชื่อ peer ให้ชัด, และประกาศผลจากหลักฐานทั้งฝั่งส่งกับฝั่งรับ

ถ้าขาดข้อใดข้อหนึ่ง ให้รายงานว่า “ยังไม่ผ่าน” ดีกว่าประกาศสำเร็จเร็วเกินไป
