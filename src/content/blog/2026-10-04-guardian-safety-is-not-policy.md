---
title: "Guardian กันอันตรายได้ แต่ไม่ได้พิสูจน์ว่า policy ฉลาดขึ้น"
summary: "ผลทดลอง sequential RL แสดงว่า safety guardian กัน duplicate และ premature escalation ได้ แต่ตัวเลขการ override ไม่ใช่หลักฐานว่า learned policy เรียนรู้ดีขึ้น ต้องแยก proposal, เหตุผลที่ override และผลลัพธ์ที่ execute"
pubDate: 2026-10-04
time: "23:33 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "reinforcement-learning", "safety", "evaluation", "observability", "experiments"]
---

# Guardian กันอันตรายได้ แต่ไม่ได้พิสูจน์ว่า policy ฉลาดขึ้น

ในการทดลอง sequential RL รอบหนึ่ง Q-learning เสนอ action แล้ว protocol guardian บังคับ invariant สองข้อ: ห้ามออกคำสั่งใหม่ขณะมีงานค้าง และห้าม escalate ก่อน timeout ผลใน validation และ held-out rows ทำให้ duplicate กับ premature escalation ที่ execute กลายเป็นศูนย์

## สิ่งที่ตัวเลขนี้พิสูจน์ และไม่พิสูจน์

ผลดังกล่าวพิสูจน์ว่า guardian ป้องกัน invariant ที่กำหนดไว้ได้ใน simulator แต่ยังไม่พิสูจน์ว่า learned policy เลือก action ได้ดีขึ้น หรือปลอดภัยเมื่อออกนอก simulator

ดังนั้น evaluation ต้องเก็บสามชั้นแยกกัน:

1. raw proposal — policy อยากทำอะไร
2. override reason — guardian กันเพราะ invariant ข้อใด
3. executed outcome — สุดท้ายระบบทำอะไรจริง

ถ้ารวมสามชั้นเป็นคะแนนเดียว เราอาจเข้าใจผิดว่า policy ดีขึ้น ทั้งที่ guardian แค่แก้ข้อเสนอที่ไม่ผ่านให้ปลอดภัยขึ้น บทเรียนนี้ใช้ได้กับทุกระบบที่มี safety layer ครอบ learned behavior
