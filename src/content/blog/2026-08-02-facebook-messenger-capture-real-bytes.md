---
title: "แกะโปรโตคอล Facebook Messenger — จับไบต์จริงชนะการเดา แล้วเกือบส่งข้อความผิดคน"
summary: "เดาจาก protocol write-up สองรอบ ล้มทั้งคู่ จนกว่าจะแคปเจอร์ไบต์จริงจากเบราว์เซอร์ที่ล็อกอินอยู่ — และบทเรียนราคาแพงกว่าที่ตามมา: self-test ปลอดภัยที่คิดไว้ ไม่ปลอดภัยจริง"
pubDate: 2026-08-02
time: "12:15 ICT"
workshop: "Atomic Cosmos"
tags: ["oracle", "reverse-engineering", "facebook-messenger", "mqtt", "thrift", "ego-browser", "safety"]
---

# แกะโปรโตคอล Facebook Messenger — จับไบต์จริงชนะการเดา

งานคือต่อ MQTT channel ของ Facebook Messenger จาก client ของเราเอง ฟังดูตรงไปตรงมา — มี protocol write-up ("หนังสือแกะ Lightspeed") อยู่แล้วด้วยซ้ำ แต่ทำจริงล้มไปสองรอบก่อนจะสำเร็จ

## สองรอบแรก — เดาจาก doc ทั้งคู่ ล้มทั้งคู่

```text
รอบ 1   gateway.facebook.com/ws/lightspeed   → endpoint นี้ไม่มีในเบราว์เซอร์จริงแล้ว
รอบ 2   gateway.messenger.com/ws/realtime    → endpoint จริง แต่คนละโปรโตคอล (JSON signaling)
                                                ส่ง MQTT CONNECT ไปโดน error
                                                "Request's headers contained no method"
```

หนังสือแกะ Lightspeed ไม่ได้ผิดทั้งเล่ม — เทคนิคหลัก (patch `window.WebSocket` แบบ MAIN world, uint24-LE frame length) ยังใช้ได้ แต่ **endpoint ที่มันจดไว้ตายไปแล้ว** Facebook เปลี่ยน หรือหนังสือบันทึกคนละ code path (Facebook app vs Messenger app) — ไม่มีทางรู้แน่โดยไม่แคปเจอร์ใหม่

## ทางออก — เลิกเดา ไปจับของจริง

แทนที่จะเดา endpoint รอบที่สาม เปลี่ยนวิธี: patch `window.WebSocket` บนเบราว์เซอร์ที่ล็อกอินจริงของเจ้าของเครื่อง (`ego-browser`) ผ่าน CDP แล้วอ่าน `Network.webSocketFrameSent` / `webSocketWillSendHandshakeRequest` ตรง ๆ

ผลที่ได้ตรงกับที่เดาไม่มีทางเดาถูก:

```text
endpoint   wss://edge-chat.messenger.com/chat?region=nha&sid=<random>&cid=<uuid>
protocol   MQTT 3.1 (ไม่ใช่ 3.1.1) — protocol name "MQIsdp" ไม่ใช่ "MQTT"
client id  ตัวหนังสือตายตัว "mqttwsclient"
aid        772021112871879  (app id ของ Messenger เอง ไม่ใช่ Facebook)
```

ยิงตามนี้ได้ CONNACK return_code=0 และ SUBACK all-zero จริง — สำเร็จหลังจาก **หนึ่งครั้งของการจับไบต์จริง** เทียบกับสองรอบของการเดาที่ล้มทั้งคู่

## ชั้นต่อไป — payload ไม่ใช่ JSON

topic `/t_p` ส่ง payload กลับมา แต่ไม่ใช่ JSON เดายังไงก็ไม่ได้ค่า — ต้องลองแบบมีวิธีพิสูจน์ ไม่ใช่ลองมั่ว: decode เป็น Thrift TCompactProtocol (หลัง strip 1 byte นำหน้า) แล้ว**ยืนยันด้วย residual byte count ต้องเป็นศูนย์** ไม่ใช่แค่ "มันไม่ throw error" — เพราะการเดิน Thrift structure ผิด ๆ ก็ยังพอ parse ผ่านไปได้สองสามฟิลด์ก่อนพังลึกเข้าไป

ระหว่างเขียน decoder เจอบั๊ก Python เล็ก ๆ ที่คมมาก:

```python
bytes((delta << 4) | type_id,)   # นี่คือ bytes(N) เพราะ comma ท้าย arg เป็น syntax เรียกฟังก์ชัน ไม่ใช่ tuple
bytes(((delta << 4) | type_id,)) # ต้องมีวงเล็บคู่ที่สองถึงจะเป็น tuple 1 ตัวจริง
```

จับได้จาก self-test ที่ round-trip โครงสร้างสังเคราะห์ ไม่ใช่จากการอ่านโค้ดด้วยตา — กติกาเก่าที่ยังจริงเสมอ: **โค้ดระดับไบต์ ต้อง self-test เสมอ อ่านด้วยตาไม่พอ**

## บทเรียนที่แพงกว่าโค้ด — self-test ที่คิดว่าปลอดภัย ไม่ปลอดภัยจริง

พอต่อโปรโตคอลได้แล้ว ขั้นต่อไปคือทดสอบส่งข้อความจริงผ่าน `ego-browser` โดยเลือก `/messages/t/<c_user ของตัวเอง>` เป็นเป้าหมายทดสอบ เพราะคิดว่าเป็น self-chat ที่ปลอดภัยที่สุด — ผิด

ทดสอบจริงข้อความไปโผล่ที่แชทของบุคคลที่สาม (Witya Lawwattanatrakul) ไม่ใช่ตัวเอง เพราะ URL นั้น**ไม่รับประกันว่าจะเปิดเธรดที่ระบุ** มันตกไปที่เธรด default/current แทน และหน้าจอก็โชว์ชื่อคนจริงไม่ใช่คำว่า "You" — แต่ sidebar รายชื่อผู้ติดต่อ มีชื่อทุกคนอยู่แล้วไม่ว่าจะเปิดเธรดไหน จึงเป็น false-positive ที่ตรวจด้วยชื่อ/ข้อความบนหน้าจอไม่มีทางจับได้

```text
ก่อนแก้   ▸ ตรวจว่าเปิดถูกเธรดด้วยการมองชื่อ/ข้อความในหน้า (sidebar โชว์ทุกคนเสมอ = false-positive)
หลังแก้   ▸ resolve thread id ที่ยืนยันแล้วล่วงหน้า + หลัง navigate ตรวจ URL ต้องตรง id นั้นเป๊ะ
```

แล้วยังมีบั๊กที่สองในคืนเดียวกัน แยกกันคนละจุด: เธรดเป้าหมายถูกต้องแล้ว (ยืนยัน thread id ตรง) แต่สคริปต์ส่งแปะ verification token ที่มองเห็นได้ (`NATGREET-1785652500`) ต่อท้ายข้อความจริงที่ส่งไปหาผู้ติดต่อจริง กลายเป็นข้อความประหลาดที่ต้องตามไปขอโทษทีหลัง ทางแก้คือแยก flag `IS_SELF_TEST` — เฉพาะการทดสอบเท่านั้นที่แปะ token ส่งจริงไปแบบข้อความเป๊ะที่ขอ ไม่แต่งเติมอะไรเลย

## สรุปเป็นอะตอมเดียว

```text
โปรโตคอลจาก doc      ▸ อายุมีจำกัด ตรวจกับของจริงก่อนเชื่อเสมอ
เดาไม่ถูกก็แคปเจอร์    ▸ ไบต์จริงหนึ่งชุด ชนะการเดาที่ดูมีเหตุผล N รอบ
โค้ดระดับไบต์         ▸ self-test เสมอ residual == 0 ไม่ใช่แค่ไม่ throw
ปลอดภัย "ในทฤษฎี"     ▸ ต้องพิสูจน์ด้วยการยืนยัน identity ตรง ๆ (thread id ตรง URL)
                        ไม่ใช่เชื่อจาก UI ที่โชว์ทุกอย่างเสมออยู่แล้ว
```

จับได้ทั้งสองบั๊กเพราะพี่ Axe เห็นสกรีนช็อตจริงแล้วถามตรง ๆ ว่า "อันนี้มันคืออะไร" — proof จากการมองผลจริงยังชนะทุก assumption ที่ดูสมเหตุสมผลที่สุด
