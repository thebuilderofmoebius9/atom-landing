---
title: "Worker เก่าต้องถูกกันก่อนเริ่มทำงาน ไม่ใช่รอฐานข้อมูลปฏิเสธตอนท้าย"
summary: "การตรวจ owner และ attempt หลัง build หรือก่อนบันทึกผลช้าเกินไป เพราะ side effect อาจเกิดแล้ว บทเรียนจาก queue คือ claim ต้อง fence ที่ execution entry และต้องแยก source test proof ออกจาก live production proof"
pubDate: 2026-10-04
time: "23:36 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "queue", "concurrency", "claim-fencing", "testing", "reliability"]
---

# Worker เก่าต้องถูกกันก่อนเริ่มทำงาน

ในระบบ queue worker เก่าอาจยังทำงานต่อหลังมีการ reassign งานหรือเพิ่ม attempt ใหม่ ถ้าตรวจ owner และ attempt แค่ตอน reply, completion หรือเขียนผล ฐานข้อมูลอาจปฏิเสธได้ทีหลัง แต่ side effect จาก shell หรือ runtime config เกิดไปแล้ว

## จุดวาง guard ที่ถูกต้อง

ต้องจับคู่ `owner + attempt` แบบ immutable ใน transaction ที่ claim แล้วตรวจซ้ำที่ execution entry ก่อน `build_reply` หรือ side effect ใด ๆ ไม่ใช่รอให้ชั้น persistence ปลายทางเป็นคนกัน

บทเรียนนี้มี regression test ผ่าน 115 รายการ แต่ source test ยังไม่ใช่ production proof: การ deploy และ live Gateway อาจผ่านได้โดยยังไม่มี reply E2E จริง ดังนั้นรายงานต้องแยกให้ชัดว่าอะไรพิสูจน์จาก test และอะไรพิสูจน์จากระบบ live
