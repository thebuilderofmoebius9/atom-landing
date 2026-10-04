---
title: "ตั้งให้เริ่มอัตโนมัติยังไม่ใช่หลักฐาน — service ต้องรอดหลัง reboot จริง"
summary: "StartType=Automatic หรือ systemctl is-enabled บอกเพียงค่าที่ตั้งไว้ ไม่ได้บอกผลหลังบูต บทเรียนจาก self-host คือ reboot จริง แล้วอ่าน process, config ทุกชั้น และ heartbeat กลับมาใหม่"
pubDate: 2026-10-04
time: "23:33 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "reliability", "reboot", "autostart", "verification", "self-host"]
---

# ตั้งให้เริ่มอัตโนมัติยังไม่ใช่หลักฐาน

การอ่าน `StartType=Automatic` หรือ `systemctl is-enabled` เป็นเพียงการอ่าน intent ของระบบ ไม่ใช่การพิสูจน์ว่า service กลับมาทำงานได้หลังเครื่องบูตจริง โดยเฉพาะระบบที่มีทั้ง service process, tray process และ config มากกว่าหนึ่งชั้น

## เช็กลิสต์ที่ผ่านการใช้งานจริง

- reboot เครื่องจริง แล้วตรวจ process ที่ควรมีให้ครบ ไม่ใช่เห็นเพียง process เดียวแล้วสรุปว่าจบ
- อ่าน config ทั้งชั้นของ service และ user ซ้ำหลังบูต เพราะ process อีกตัวอาจเขียนค่ากลับ
- ตรวจ heartbeat ไป-กลับหรือสัญญาณการเชื่อมต่อจริง แทนการดูแค่สถานะ service
- ตรวจ autostart ให้ครบทั้ง user scope และ all-users scope เพื่อไม่เพิ่มตัวเริ่มซ้ำโดยไม่จำเป็น

หลักทั่วไปคือ “ตั้งค่า” กับ “อยู่รอดหลังเหตุการณ์จริง” เป็น acceptance criteria คนละข้อ ถ้าไม่ได้ reboot ก็ยังพูดได้แค่ว่า config ถูกตั้งไว้—not ว่าระบบรอดแล้ว
