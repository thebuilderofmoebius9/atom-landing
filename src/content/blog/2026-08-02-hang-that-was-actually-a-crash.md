---
title: "ค้างที่ไม่ได้ค้างจริง — เมื่อ crash ถูกกลืนหายบน Windows ไทย"
summary: "อัปโหลดเฟิร์มแวร์ผ่าน SSH ไปเครื่อง Windows ที่ตั้ง codepage ไทย ดูเหมือนค้างไม่จบ จนบอร์ดดับสนิท — ต้นเหตุคือ UnicodeEncodeError ที่ถูกกลืนหายไปกลางทาง ไม่ใช่พอร์ตค้างอย่างที่คิด"
pubDate: 2026-08-02
time: "14:10 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "esp32", "platformio", "windows", "encoding", "debugging"]
---

# ค้างที่ไม่ได้ค้างจริง

สั่งอัปโหลดเฟิร์มแวร์ไปบอร์ด ESP32 ผ่าน `pio run -t upload` บน COM3 จากเครื่อง Windows ทาง SSH คำสั่งพิมพ์แค่ `Serial port COM3:` แล้วเงียบไปหลายนาที ไม่มี error ไม่มี progress ไม่มี exit code — ดูเหมือนพอร์ตค้าง

สรุปว่าค้างจริงแล้วรอ ผลคือบอร์ดดับสนิท serial ขึ้น:

```text
E boot: OTA app partition slot 0 is not bootable
E esp_image: image at 0x210000 has invalid magic byte
E boot: No bootable app partitions in the partition table
```

## ต้นเหตุจริง — ไม่ใช่พอร์ตค้าง แต่คือ error ที่ถูกกลืนหาย

จับ stdout เต็มแบบ foreground แทนการ poll ว่า process ยังอยู่ไหม ถึงเจอตัวจริง:

```text
File "cp874.py", line 19, in encode
UnicodeEncodeError: 'charmap' codec can't encode characters in position 23-52
*** [upload] Error 4294967295
```

เครื่อง Windows รันด้วย codepage ไทย (cp874) แต่ progress bar ของ esptool ใช้อักขระ block ของ Unicode (`█░`) — พอเขียนลง stdout ที่ไม่ใช่ UTF-8 มันพัง**กลางการอัปโหลด** ไม่ใช่ตอนเริ่มหรือตอนจบ แปลว่า app partition ถูก erase ไปแล้วครึ่งหนึ่งตอนที่ crash เกิดขึ้น บอร์ดจึงวน reboot ใน ROM bootloader โดยไม่มี firmware ให้บูต

หน้าจอดับไม่ได้แปลว่าเฟิร์มแวร์พัง — มันแปลว่า partition ถูกเขียนครึ่งเดียว

## ทางแก้ตรงจุด

```bash
ssh host 'set "PYTHONIOENCODING=utf-8" && set "PYTHONUTF8=1" && cd C:\path && pio.exe run -t upload --upload-port COM3'
```

ต้องใส่ quote ค่า `set` ด้วย — `set X=1 && ` แบบไม่มี quote จะทำให้ space ท้ายค่าหลุดเข้าไปในตัวแปร แล้ว Python จะฟ้อง `invalid PYTHONUTF8 environment variable value` แทน

## กับดักที่สอง — ตัวถือพอร์ตที่ไม่มีใครเห็น

แก้ encoding แล้วยังเจออีกชั้น: `atom_status_bridge.py` วิ่งอยู่บน Windows ผ่าน SSH `ExecStart` การ stop service ฝั่ง Linux ฆ่าแค่ **ssh client ฝั่งนี้** ไม่ได้ฆ่า python ที่รันอยู่ฝั่ง remote มันยังถือ handle COM3 ค้างไว้ตลอด และทุกครั้งที่ restart service จะทิ้ง orphan เพิ่มอีกตัว

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'atom_status_bridge' } |
  Select-Object ProcessId,CreationDate
taskkill /F /PID <each> /T
```

ต้องเช็คว่าเหลือ instance เดียวจริงหลัง restart — นับที่ `python.exe` ลูก ไม่ใช่ `cmd.exe` แม่ที่ห่อไว้

## แถม — สาเหตุที่สองในคืนเดียวกัน ไม่ใช่ encoding

หลังแก้ encoding แล้ว COM3 ยังดับซ้ำอีกรอบ คราวนี้ต้นเหตุต่างไปเลย: baud rate สูงเกินไปสำหรับเส้นทาง SSH-to-Windows-USB นี้

```text
--baud 921600   ค้างประมาณ 14 นาที
--baud 460800   ค้างประมาณ 4 นาที
--baud 115200   สำเร็จใน 8.2 วินาที
```

กฎรวมสำหรับเครื่องนี้: ก่อนสรุปว่าพอร์ตตาย ให้เช็คทั้งสองอย่าง — orphan process ที่ถือพอร์ตค้าง และ encoding crash ก่อน แล้วถ้ายังค้างจริง (ไม่ใช่ crash) ค่อยลด baud ลง

## บทเรียนเชิงวิธีคิด

```text
"ค้าง" ที่ไม่มี output เลย   ▸ สงสัย crash ที่ถูกกลืนก่อน สงสัยว่างานยังทำอยู่
วิธีพิสูจน์                  ▸ รัน foreground อ่าน stderr จริง ไม่ใช่ poll สถานะ process จากภายนอก
```

รอบนี้เสียเวลาไปหลายรอบเพราะ poll ดูว่า process ยังอยู่ไหม แทนที่จะอ่าน error จริงตั้งแต่แรก — บทเรียนเดิมที่ต้องเจอซ้ำถึงจะจำได้จริง: หน้าจอเงียบไม่เท่ากับงานยังทำอยู่ปกติ
