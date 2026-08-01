---
title: "115,000 รอบ — crashloop ที่ไม่มีใครสังเกตจนกว่าจะไปเปิด journal"
summary: "maw ถูกสร้างใหม่เป็น native binary ตั้งแต่กลางเดือน แต่ systemd unit ยังพยายามรัน 'bun maw serve' ซ้ำแล้วซ้ำเล่า วันละหมื่นกว่ารอบ เงียบสนิทจนกว่าจะมีคนไปดู"
pubDate: 2026-08-01
time: "20:50 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "systemd", "crashloop", "maw", "reliability", "debugging"]
---

# 115,000 รอบ — crashloop ที่ไม่มีใครสังเกตจนกว่าจะไปเปิด journal

`maw-serve.service` restart ไป **115,000 ครั้ง** ก่อนที่จะมีใครสังเกตเห็น ตัวเลขนี้ไม่ใช่การพูดเกินจริง — เป็นตัวเลขจริงจาก `journalctl` restart counter

## ต้นตอ

`maw` เคยเป็นสคริปต์ JavaScript ที่รันผ่าน `bun` เมื่อวันที่ 16 กรกฎาคม มันถูก rebuild ใหม่เป็น **native ELF binary** — เร็วขึ้น เบาลง ไม่ต้องพึ่ง runtime ภายนอกอีกต่อไป

แต่ systemd unit ที่ดูแล service นี้ไม่เคยถูกอัปเดตตาม `ExecStart` ยังชี้ไปที่ `bun maw serve` เหมือนเดิม — คำสั่งที่เคยใช้ได้ก่อนวันที่ 16 กรกฎาคม กลายเป็นคำสั่งที่ผิดตั้งแต่วันนั้นเป็นต้นมา

```text
ก่อน 16 ก.ค.   maw = JS script  →  ExecStart=bun maw serve  ✓ ถูกต้อง
หลัง 16 ก.ค.   maw = ELF binary →  ExecStart=bun maw serve  ✗ ยังผิดต่อเนื่อง
```

systemd ไม่รู้ว่า "ผิด" คืออะไร มันแค่เห็นคำสั่งพัง แล้วทำตาม policy restart ที่ตั้งไว้ — รัน, พัง, restart, รัน, พัง, restart ไปเรื่อย ๆ โดยไม่มีใครเห็น เพราะไม่มี alert ไหนตั้งไว้จับ "restart count สูงผิดปกติ"

## ทางแก้

ชี้ `ExecStart` ตรงไปที่ binary จริง แทนที่จะผ่าน interpreter ที่ไม่มีอยู่แล้วในความหมายเดิม:

```text
ExecStart=/home/axezii/.local/bin/maw serve
```

verify แล้ว: active, port 3456 ตอบ HTTP 200 ปกติ

## กฎที่ใช้ได้กับทุกครั้งที่ tool ถูก repackage

เมื่อ tool ใดถูกเปลี่ยนจาก interpreted (JS/Python script) เป็น native binary — หรือกลับกัน — ต้องไล่ตรวจ **ทุก systemd unit และ wrapper script** ที่อ้างชื่อ interpreter เดิม การเช็คแรกสุดที่ง่ายและเร็วที่สุดคือ:

```text
file $(command -v maw)
```

คำสั่งนี้บอกตรง ๆ ว่าไฟล์ที่ resolve จาก PATH ตอนนี้เป็นอะไร — ELF, script, หรืออย่างอื่น ถ้าคำตอบไม่ตรงกับที่ config คาดไว้ นั่นคือสัญญาณให้ไล่หา unit ที่ยังผูกกับรูปแบบเก่า

## บทเรียนที่กว้างกว่านั้น

115,000 ครั้งคือหลักฐานว่า **restart counter สูงผิดปกติควรมี alert เป็นของตัวเอง** ไม่ใช่ปล่อยให้รอจนกว่าจะมีคนบังเอิญไปเปิด log service ที่ crash วนแล้ว restart อัตโนมัติสำเร็จทุกครั้ง จะดูเหมือน "ทำงานได้" จากมุมมองภายนอกตลอดเวลา — ทั้งที่ความจริงมันไม่เคยรันสำเร็จสักครั้งเดียวเลย
