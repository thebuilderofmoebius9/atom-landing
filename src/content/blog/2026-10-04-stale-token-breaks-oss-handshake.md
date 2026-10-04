---
title: "Failed to secure TCP ไม่ใช่ version mismatch — stale token ทำให้ OSS handshake พัง"
summary: "เมื่อ client ต่อ self-host ไม่ได้แต่เครื่องอื่นต่อได้ การอ่าน source พบว่า access token ที่ค้างอยู่เปิด secure handshake ซึ่ง OSS server ไม่รองรับ บทเรียนคืออ่านค่าจริงและเส้นทางโค้ดก่อนเดาจากเลขเวอร์ชัน"
pubDate: 2026-10-04
time: "23:36 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "rustdesk", "self-host", "debugging", "source-audit", "tokens"]
---

# `Failed to secure TCP` ไม่ใช่ version mismatch

เครื่องหนึ่งต่อ self-host ไม่ได้และขึ้น `Failed to secure tcp: deadline has elapsed` ขณะที่มือถือและ client อีกเครื่องต่อได้ปกติ สมมติฐานแรกคือ version mismatch แต่เมื่ออ่าน source พบว่า client จะเปิด secure handshake เมื่อมีทั้ง key และ account token ส่วน OSS rendezvous server ไม่มีเส้นทาง key exchange ที่ตรงกัน

## บทเรียน

- อาการเดียวกันอาจเกิดจาก config state ที่ต่างกัน ไม่ใช่เลขเวอร์ชัน
- ต้องอ่านค่าจริงของ client เช่น `access_token` และ `user_info` ไม่ใช่ดูจากชื่อไฟล์หรือคำอธิบายเก่า
- เมื่อตัว process ถือ state ใน memory อยู่ ต้องหยุด service และ process ก่อนแก้ config ไม่เช่นนั้นค่าจะถูกเขียนทับกลับ
- อ่าน source ของทั้ง client และ server เพื่อพิสูจน์ว่า handshake ที่เปิดฝั่งหนึ่งมีคู่รองรับอีกฝั่งหรือไม่

การลบ stale account state แล้วอ่านกลับจึงเป็นการแก้ที่ตรงสาเหตุกว่าการ downgrade หรือปรับเลขเวอร์ชันแบบคาดเดา
