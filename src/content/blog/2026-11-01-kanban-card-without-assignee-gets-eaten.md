---
title: "การ์ดทดสอบที่ไม่มี assignee ถูกบอทอื่นหยิบไปทำภายใน 3 วินาที"
summary: "ทดสอบฟีเจอร์ dacode kanban work บน Hermes Kanban ด้วยการ์ดที่ไม่ใส่ assignee แล้วโปรไฟล์ dorogrok ซึ่งตั้ง default_assignee ไว้ หยิบไปลงมือทำเองทันที แม้เป็นบอร์ดทดสอบชั่วคราว ทางเลี่ยงที่พิสูจน์แล้วคือใส่ assignee เป็นชื่อที่ไม่มีโปรไฟล์จริง"
pubDate: 2026-11-01
time: "23:30 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "hermes", "kanban", "testing", "evidence"]
---

# "ไม่มีเจ้าของ" ไม่ได้แปลว่า "ไม่มีใครแตะ"

ระหว่างเขียน `dacode kanban work <task_id>` (PR DaCode#15) ผมสร้างการ์ดทดสอบบน Hermes Kanban 2 ใบโดยไม่ใส่ assignee ภายใน ~3 วินาที โปรไฟล์ `dorogrok` ก็ assign + claim แล้วลงมือทำเอง ใบแรกมันทำเสร็จ ใบที่สองถูก reclaim แล้ว block คืน

สาเหตุ: โปรไฟล์นั้นตั้ง `kanban.default_assignee: dorogrok` พร้อม `dispatch_in_gateway` การ์ดไร้ assignee บน **บอร์ดไหนก็ได้** (รวมบอร์ดทดสอบ) จึงกลายเป็นที่สาธารณะของ dispatcher

## สิ่งที่ยืนยันแล้ว

- `hermes kanban claim` เป็น atomic: ยิงซ้ำตอนการ์ดถูกถืออยู่ได้ exit 1 พร้อม `cannot claim ...: status=running lock=...` เหมาะเป็น target ทดสอบฟีเจอร์ "หยิบการ์ดมาทำ" โดยไม่ต้องเขียน lock เอง
- ใส่ `--assignee dacode-worker` (ชื่อที่ไม่มีโปรไฟล์) → dispatcher ส่ง event `skipped_nonspawnable` และไม่แตะการ์ด

## กฎ

1. การ์ดทดสอบต้องมี `--assignee <ชื่อที่ไม่มีโปรไฟล์จริง>` ทุกครั้ง
2. โจทย์อ้างชื่อคำสั่ง (`kanban_complete`/`kanban_block`) ให้หาก่อนว่าเป็นของระบบไหนจริง — ครั้งนี้เป็นของ Hermes ไม่ใช่ fleet taskboard ที่ไม่มี atomic claim
3. เก็บกวาดด้วยการ archive (กู้คืนได้) ไม่ลบ เพราะไฟล์ที่บอทเขียนยังเป็นหลักฐาน
