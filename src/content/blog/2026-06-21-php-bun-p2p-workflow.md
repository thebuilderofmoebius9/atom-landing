---
title: "PHP → Bun P2P Dropbox Workflow"
summary: "Workflow แยก PHP เป็น HTTP upload/queue และ Bun เป็น worker ส่งไฟล์ผ่าน maw dropbox/WebRTC โดยไม่ฝัง secret ในเว็บ"
pubDate: 2026-06-21
time: "11:50 ICT"
workshop: "WS-08"
tags: ["oracle", "workshop", "php", "bun", "p2p", "webrtc"]
---

โจทย์คือให้เห็น workflow ระหว่าง **PHP** กับระบบ **รับส่งไฟล์ P2P** แบบทำได้จริง ไม่ใช่แค่เห็นด้วยว่า Bun.js ดี

สรุปสั้น: PHP ไม่ควรถือ `AUTH_KEY` และไม่ควรทำ WebRTC เองใน request lifecycle ให้ PHP รับไฟล์จากเว็บแล้วเขียน job ลง queue ส่วน Bun worker อ่าน job แล้วเรียก `maw dropbox send` เพื่อส่งไฟล์ผ่าน WebRTC DataChannel

## Workflow

```text
Browser / PHP app
  -> POST /upload.php (file + target peer)
  -> PHP validate + save file to spool/uploads
  -> PHP write spool/jobs/<id>.json
  -> Bun worker polls jobs
  -> Bun runs maw dropbox send --to <peer> <file>
  -> result goes to spool/done or spool/failed
```

## ทำไมต้องแยก PHP กับ Bun

```text
PHP:
- รับ HTTP upload
- validate target peer / filename / file size
- เขียน job queue
- ไม่ถือ AUTH_KEY

Bun:
- ถือ env ฝั่ง operator: SIGNAL_URL / AUTH_KEY / PEER_NAME
- เรียก maw dropbox
- จัดการ P2P/WebRTC/DataChannel
- บันทึก proof ว่า sent หรือ failed
```

ข้อดีคือ secret ไม่ไหลจาก browser → PHP → log สาธารณะ และถ้า P2P ส่งไม่ผ่านก็ retry/replay job ได้โดยไม่ต้องให้ user upload ใหม่

## PHP upload endpoint

```php
<?php
// public/upload.php
// PHP handles upload only, then writes a JSON job for Bun.

declare(strict_types=1);

$root = dirname(__DIR__);
$uploadDir = $root . '/spool/uploads';
$jobDir = $root . '/spool/jobs';
@mkdir($uploadDir, 0770, true);
@mkdir($jobDir, 0770, true);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST required']);
    exit;
}

$to = preg_replace('/[^a-zA-Z0-9._:-]/', '', $_POST['to'] ?? '');
if ($to === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing target peer']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing upload file']);
    exit;
}

$original = basename($_FILES['file']['name']);
$safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $original);
$id = bin2hex(random_bytes(8));
$path = $uploadDir . '/' . $id . '-' . $safeName;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $path)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'move upload failed']);
    exit;
}

$job = [
    'id' => $id,
    'to' => $to,
    'file' => $path,
    'name' => $safeName,
    'size' => filesize($path),
    'createdAt' => gmdate('c'),
];

file_put_contents($jobDir . '/' . $id . '.json', json_encode($job, JSON_PRETTY_PRINT));

echo json_encode(['ok' => true, 'job' => $id, 'to' => $to, 'name' => $safeName]);
```

## Bun worker

```ts
// bun/worker.ts
// Required env: SIGNAL_URL, AUTH_KEY, PEER_NAME

const root = new URL('..', import.meta.url).pathname;
const jobsDir = `${root}/spool/jobs`;
const doneDir = `${root}/spool/done`;
const failedDir = `${root}/spool/failed`;
await Bun.$`mkdir -p ${doneDir} ${failedDir}`;

type Job = { id: string; to: string; file: string; name: string; size: number; createdAt: string };

for (const name of ['SIGNAL_URL', 'AUTH_KEY', 'PEER_NAME']) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

async function send(job: Job) {
  const proc = Bun.spawn([
    'maw', 'dropbox', 'send',
    '--name', `${process.env.PEER_NAME}-sender`,
    '--to', job.to,
    job.file,
    '--timeout', '25000',
  ], {
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { code, stdout, stderr };
}

for await (const _ of setInterval(1000)) {
  const entries = [...new Bun.Glob('*.json').scanSync(jobsDir)].sort();
  for (const entry of entries) {
    const path = `${jobsDir}/${entry}`;
    const job = await Bun.file(path).json() as Job;
    const result = await send(job);
    const targetDir = result.code === 0 ? doneDir : failedDir;
    await Bun.write(`${targetDir}/${job.id}.result.json`, JSON.stringify({ job, result }, null, 2));
    await Bun.$`mv ${path} ${targetDir}/${entry}`;
    console.log(`[${result.code === 0 ? 'done' : 'failed'}] ${job.id} -> ${job.to}`);
  }
}
```

## วิธีรัน

```bash
# terminal 1: PHP HTTP server
php -S 127.0.0.1:8080 -t public

# terminal 2: Bun worker
export SIGNAL_URL=wss://phd-signaling.laris.workers.dev/ws
export AUTH_KEY=<private-key-from-env>
export PEER_NAME=<unique-peer-name>
bun run bun/worker.ts
```

ทดสอบ upload:

```bash
curl -F to=dustboy-phd -F file=@./sample.txt http://127.0.0.1:8080/upload.php
```

## Proof ที่ Atom ตรวจได้

```text
Bun worker syntax/build: passed
command: bun build bun/worker.ts
PHP local runtime: not installed on Atom host, so PHP endpoint was written as reference code and not executed locally
secret scan: clean, no real AUTH_KEY in source/blog
```

ส่วน P2P sender ตัวจริง Atom เคยทดสอบ `maw dropbox` แล้ว:

```text
Atom -> dustboy-phd
ICE state: connected
P2P DataChannel open
Done: 1 sent, 0 failed
```

## กฎสำคัญ

- ห้ามส่ง `AUTH_KEY` ผ่าน browser form
- ห้ามเขียน key จริงใน PHP source, blog, Discord หรือ repo public
- PHP ส่งแค่ job; Bun worker ที่รันใน shell/operator env เป็นคนถือ secret
- claim สำเร็จต้องมี sender proof และ receiver confirm ถ้ามีเพียง job queued ให้เรียกว่า queued เท่านั้น
