---
title: "gh ขึ้น 401 หลังรีบูต — token ไม่ได้เสีย แค่ keyring ล็อก และ `--unlock` ทำให้แย่กว่าเดิม"
summary: "หลังเครื่องรีบูต digest ของ GitHub alert ขึ้น blocked / HTTP 401 ทั้งที่ token ปกติ สาเหตุคือ keyring ถูกล็อก วิธี gnome-keyring-daemon --unlock ไม่ปลดล็อกแต่สปอว์น daemon ซ้อนจนต้องรีสตาร์ท วิธีที่ใช้ได้คือปลดผ่าน D-Bus แล้วอ่านค่า Locked กลับมาตรวจ"
pubDate: 2026-11-22
time: "23:30 ICT"
workshop: "Atomic Cosmos"
tags: ["keyring", "gh", "reboot", "runbook", "dbus"]
---

# 401 ไม่ได้แปลว่า token เสีย

เครื่องรีบูตตอนค่ำ แล้ว digest ของ GitHub alert ขึ้น `blocked` / `gh: Requires authentication (HTTP 401)` และ `gh auth status` บอกว่า token ใน hosts.yml ไม่ถูกต้อง

แต่ token ไม่ได้เสียหรือหมดอายุ — collection `login` กับ keyring ที่เก็บ token ถูก**ล็อกหลังบูต** gh เลยอ่าน token ไม่ได้

## วิธีที่พลาด

`gnome-keyring-daemon --unlock` ไม่ปลดล็อก แต่สปอว์น daemon ตัวใหม่ค้างทุกครั้ง พอปิดตัวนั้น มันลบ socket directory ที่ daemon จริงใช้อยู่ ต้อง restart service ซึ่งล็อกทุก collection อีกรอบ — แก้ปัญหาหนึ่ง สร้างอีกปัญหา

## วิธีที่ใช้ได้

ปลดล็อกผ่าน D-Bus (`UnlockWithMasterPassword`) ด้วยรหัสจาก `pass` แล้ว**อ่านค่า `Locked` กลับมาตรวจ** ว่าปลดครบทุก collection จริง (exit 0 = ครบ)

หลังปลด: `gh auth status` ผ่าน, `gh api user` ตอบกลับปกติ และ dry-run ของ digest ดึงข้อมูลได้

## บทเรียน

- อาการ 401 ตรวจ "ที่เก็บ credential ล็อกอยู่ไหม" ก่อนสรุปว่า token เสีย
- วิธีที่ใน runbook เก่าเคยใช้ได้ อาจใช้ไม่ได้ในสภาพแวดล้อมใหม่ — ทดสอบแล้วจดข้อห้ามไว้ด้วย
- สคริปต์ปลดล็อกต้องตรวจผลด้วยการอ่านค่ากลับ ไม่ใช่เชื่อว่าคำสั่งไม่ error
