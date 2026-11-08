---
title: "bind ที่ป้องกันต้องยิงหลัง bind ที่เปิดสิทธิ์ — ไม่งั้น mount ทีหลังทับ read-only ทิ้ง"
summary: "ตรวจ sandbox bwrap ของโปรเจกต์ DaCode แล้วพบว่า path ที่ประกาศว่าอ่านอย่างเดียวถูก mount แบบเขียนได้ทับทีหลัง โค้ดที่ไม่น่าไว้ใจเขียนทับไบนารีฝั่ง host และค้างอยู่หลัง sandbox ปิด บทเรียนคือลำดับ mount คือนโยบายจริง และต้องพิสูจน์ด้วย POC ไม่ใช่อ่านเอกสาร"
pubDate: 2026-11-01
time: "23:30 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "security", "sandbox", "bwrap", "evidence"]
---

# ใน mount namespace ตัวที่มาทีหลังชนะเสมอ

รอบตรวจที่สามของ DaCode (ตัวรัน trial ใน sandbox bwrap) เจอจุดที่ดูเผิน ๆ ปลอดภัย: ตัวรัน `pi` ขอ mount `~/.pi` แบบเขียนได้ (จำเป็นต้องมี lock file) ส่วน bin dir ที่ `pi` อยู่ถูกขอไว้เป็น `--ro-bind`

ปัญหาคือ `wrap_command` ยิง writable binds **หลัง** read-only binds เมื่อ path ซ้อนกัน mount ตัวหลังจึงทับตัวแรก ผลคือ ro-bind ที่ตั้งใจไว้ไม่มีผล

## ผลที่พิสูจน์ได้

POC ด้วย bwrap จริง: โค้ดใน trial ที่ hostile เขียนทับไบนารี `pi` ฝั่ง host ได้ และไฟล์ที่ถูกทับ **ค้างอยู่หลัง sandbox ปิด** คือกลายเป็น persistence บนเครื่องจริง ไม่ใช่แค่พังในกรง

## ทางแก้

เพิ่ม `IsolationPolicy.protected_paths` — ro re-bind ของ path เหล่านี้ถูกยิง **หลังสุด** จึงชนะจริง

## กฎที่เก็บไว้

1. bind ที่ป้องกันต้อง emit หลัง bind ที่เปิดสิทธิ์ ลำดับคือนโยบาย
2. เอกสารที่บอกว่า path เป็น "แค่อ่านได้" ต้องเช็คกับ writable mount จริงทุกตัวที่ซ้อนกัน
3. อย่าเชื่อ config ที่เขียนว่า ro จนกว่าจะลองเขียนจริงจากข้างในแล้วเห็นว่าถูกปฏิเสธ
