---
title: "เทสต์ที่อ่าน transcript จริงจับ guard ที่ตาบอดมา 22 วัน"
summary: "เทสต์ fixture ยังเขียว แต่ stale-status guard อ่าน transcript ผิดบ้านหลังแยก Claude lane ทำให้ไม่มีหลักฐานให้ตรวจเลย บทเรียนคือเทสต์ต้องแตะข้อมูลจริงในจุดที่ path และ shape เปลี่ยนได้ และเทสต์แดงต้องถูกอ่านก่อนทำให้เขียว"
pubDate: 2026-09-27
time: "18:38 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "testing", "transcript", "configuration", "regression", "observability"]
---

# เทสต์ที่อ่าน transcript จริงจับ guard ที่ตาบอดมา 22 วัน

## เทสต์แดงไม่ได้แปลว่าเทสต์ผิด

`TestStaleStatusGuard::test_transcript_probe_count_reads_a_real_bridge_transcript` แดงเพราะ
parser หา `tool_use` ไม่เจอใน transcript จริง การตีความแรกที่ง่ายที่สุดคือ fixture เพี้ยนหรือเทสต์
เปราะ แต่หลักฐานชี้ไปอีกทาง: guard ไม่ได้อ่าน session ที่ bridge ใช้งานอยู่เลย

หลังแยก `CLAUDE_CONFIG_DIR` ต่อ lane เมื่อ 25 สิงหาคม Claude Code เขียน transcript ลง
`secrets/claude-sponsored-home/projects/...` แต่ `transcript_path_for_thread()` ยังอ่านจาก
`~/.claude` ผลคือ `count_tool_uses_since()` คืน `None` หรือ `0` ตลอด และ stale-status guard
ไม่มีหลักฐานให้ตรวจมา 22 วัน

## ทำไม fixture อย่างเดียวไม่พอ

fixture ที่เราเขียนเองมักสะท้อน path และรูปร่างข้อมูลที่เราคาดไว้ เมื่อ config แยก lane หรือ
provider เปลี่ยน home, fixture ยังทำงานเหมือนเดิมจึงไม่จับ path drift ได้ การทดสอบที่ probe
transcript จริงทำให้ความคลาดเคลื่อนระหว่าง runtime กับสมมติฐานโผล่ขึ้นมาในจุดที่มีความหมาย

แนวทางที่แก้คือให้ `CLAUDE_CONFIG_HOMES` เรียงลำดับ sponsored, gateway และ isolated แล้วเลือก
home ที่ถือ session นั้นจริง พร้อม fallback ไป `~/.claude` เพื่อรักษาพฤติกรรมเดิมเมื่อไม่มีข้อมูล
ใหม่ หลังจากนั้น guard จึงกลับมาอ่านหลักฐานจาก lane ที่ถูกต้อง

## กฎสำหรับเทสต์ระบบที่มีหลาย lane

- มีอย่างน้อยหนึ่งเทสต์ที่อ่าน path จริงหรือ contract จริงในจุดที่ config เป็นตัวกำหนด
- แยกเทสต์ config ออกจากเทสต์ routing: ค่าจริงปักไว้ที่เดียว ส่วน routing อ่านค่าจาก config
  ห้าม hard-code รุ่นหรือ path ซ้ำ 18 จุด
- เมื่อเจอเทสต์แดง ให้ถามก่อนว่า “เทสต์ผิด หรือระบบผิด” อย่าแก้ config เพียงเพื่อให้สีเขียว
- เทสต์ที่เขียวมานานไม่ได้พิสูจน์ว่ามันยังเฝ้าของจริงอยู่ ต้องตรวจว่ามันอ่านข้อมูลที่ production ใช้
  ในปัจจุบันหรือไม่

ระบบที่มีหลาย provider หรือหลาย lane เปลี่ยนแค่ path เดียวก็ทำให้ guard กลายเป็นเครื่องประดับได้
การให้เทสต์แตะหลักฐานจริงอย่างพอดีจึงเป็นวิธีตรวจว่า observability ยังผูกกับ runtime อยู่ ไม่ใช่
แค่ผูกกับ fixture ที่ไม่มีวันเปลี่ยน
