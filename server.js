const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const os = require('os');
const Groq = require('groq-sdk');

// ─────────────────────────────────────────────
//  GROQ AI SETUP
// ─────────────────────────────────────────────
const groq = new Groq({
    apiKey: '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'
});

// ─────────────────────────────────────────────
//  AI CONVERSATION HISTORY (per chat)
// ─────────────────────────────────────────────
const conversationHistory = new Map();
const AI_SYSTEM_PROMPT = `Kamu adalah asisten WhatsApp yang cerdas, ramah, dan helpful bernama "BotAI". 
Kamu bisa membantu dengan berbagai pertanyaan: coding, matematika, bahasa, umum, dan lainnya.
Jawab dalam Bahasa Indonesia kecuali pengguna bertanya dalam bahasa lain.
Jawab secara ringkas dan jelas. Gunakan emoji secukupnya agar terasa lebih hidup.
Jika diminta menulis kode, berikan kode yang bersih dan ada penjelasannya.
Maksimal jawaban 500 kata kecuali diminta lebih detail.`;

const MAX_HISTORY = 10; // maks pesan yang diingat per chat

// ─────────────────────────────────────────────
//  WHATSAPP CLIENT
// ─────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update',
        ]
    }
});

// ─────────────────────────────────────────────
//  HELPER UTILITIES
// ─────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}h ${h}j ${m}m ${s}d`;
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getHistory(chatId) {
    if (!conversationHistory.has(chatId)) {
        conversationHistory.set(chatId, []);
    }
    return conversationHistory.get(chatId);
}

function addToHistory(chatId, role, content) {
    const history = getHistory(chatId);
    history.push({ role, content });
    // Batasi histori agar tidak terlalu panjang
    if (history.length > MAX_HISTORY * 2) {
        history.splice(0, 2);
    }
}

async function askGroq(chatId, userMessage) {
    const history = getHistory(chatId);
    addToHistory(chatId, 'user', userMessage);

    const messages = [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        ...history
    ];

    const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 800,
        temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || 'Maaf, tidak ada respons dari AI.';
    addToHistory(chatId, 'assistant', reply);
    return reply;
}

// ─────────────────────────────────────────────
//  BOT EVENTS
// ─────────────────────────────────────────────
client.on('qr', (qr) => {
    console.log('📱 Silakan scan QR code di bawah ini:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot sudah online dan siap!');
    console.log('🤖 Groq AI aktif — bot akan auto-reply semua pesan tanpa prefix');
});

client.on('auth_failure', () => {
    console.log('❌ Autentikasi gagal! Hapus folder .wwebjs_auth dan coba lagi.');
});

client.on('disconnected', (reason) => {
    console.log('🔌 Bot terputus:', reason);
});

// ─────────────────────────────────────────────
//  MESSAGE HANDLER
// ─────────────────────────────────────────────
client.on('message', async (message) => {
    // Abaikan pesan dari bot itu sendiri
    if (message.fromMe) return;

    const text = message.body.toLowerCase().trim();
    const args = message.body.trim().split(/\s+/).slice(1);
    const fullArgs = message.body.trim().split(/\s+/).slice(1).join(' ');
    const chatId = message.from;

    // Tandai "sedang mengetik" untuk pengalaman lebih natural
    const chat = await message.getChat();

    // ════════════════════════════════════════════
    //  📋 MENU UTAMA
    // ════════════════════════════════════════════
    if (text === '!menu' || text === '!help') {
        const menu =
`╔══════════════════════════════╗
║  🤖 *BOT MULTIFUNGSI + AI* 🤖  ║
╚══════════════════════════════╝

🧠 *AUTO AI REPLY (tanpa prefix!)*
Kirim pesan apa saja → AI akan menjawab
Contoh: "Jelaskan apa itu API"
Contoh: "Buatkan kode login PHP"

💬 *PERINTAH AI*
!ai [pertanyaan] → Tanya AI (eksplisit)
!reset           → Reset memori AI chat ini
!aimode on/off   → Aktif/matikan AI di chat ini

━━━━ 📋 *UMUM* ━━━━
!ping       → Cek status bot
!tagme      → Bot menyapamu
!stiker     → Gambar → stiker
!quote      → Kata bijak acak
!waktu      → Jam & tanggal sekarang
!koin       → Lempar koin
!dadu       → Lempar dadu 🎲
!pilih      → Bot pilihkan untukmu
!8ball      → Tanya bola ajaib
!acak       → Angka acak
!cuaca      → Info cuaca (contoh kota)
!kurs       → Kurs mata uang
!qr         → Buat QR code dari teks

━━━━ 💻 *CODING* ━━━━
!cek npm    → Info paket npm
!http       → Kode HTTP status
!regex      → Contoh regex umum
!gitcmd     → Perintah Git penting
!jssnippet  → Snippet JS berguna
!pycmd      → Snippet Python berguna
!color      → Random hex color
!encode     → Base64 encode teks
!decode     → Base64 decode teks
!json       → Format/validasi JSON
!uuid       → Generate UUID v4
!ip2bin     → IP ke biner
!cekjson    → Validasi JSON

━━━━ 🖥️ *SERVER/LINUX* ━━━━
!serverinfo → Info server bot
!uptime     → Uptime server
!ram        → Penggunaan RAM
!cpu        → Info CPU
!linuxcmd   → Perintah Linux penting
!portinfo   → Info port umum
!httpmeth   → Metode HTTP
!dockercmd  → Perintah Docker penting
!ssl        → Info SSL/TLS singkat
!nginx      → Contoh config Nginx
!pm2        → Perintah PM2 penting

━━━━ 🌐 *NETWORK/WEB* ━━━━
!ipinfo     → Info IP publik server
!dnscmd     → Perintah DNS
!curlcmd    → Contoh curl
!restapi    → Prinsip REST API
!webhook    → Penjelasan webhook
!cors       → Penjelasan CORS

━━━━ 🗄️ *DATABASE* ━━━━
!sqlcmd     → Query SQL penting
!mongodb    → Perintah MongoDB
!rediscmd   → Perintah Redis
!dbtype     → Jenis-jenis database

━━━━ 🔐 *KEAMANAN* ━━━━
!pwgen      → Generate password kuat
!hash       → Jenis hash umum
!owasp      → OWASP Top 10
!enkripsi   → Jenis enkripsi umum

━━━━ 🎌 *ANIME* ━━━━
!anime      → Rekomendasi anime
!waifu      → Waifu acak
!jutsu      → Jutsu Naruto acak
!zanpakuto  → Zanpakuto Bleach acak
!devil      → Buah iblis One Piece
!quirk      → Quirk MHA acak
!titan      → Titan AoT acak
!stand      → Stand JoJo acak
!openings   → Opening anime legendaris
!animequote → Quote anime terkenal

━━━━ 🎮 *GAMING* ━━━━
!gamedrop   → Item drop acak
!rpgclass   → Kelas RPG acak
!spell      → Mantra/spell acak
!loot       → Rarity item acak
!trivia     → Soal trivia acak

━━━━ 📚 *BELAJAR* ━━━━
!kalkulator → Hitung ekspresi
!roman      → Angka ke Romawi
!biner      → Desimal ke Biner
!morse      → Teks ke Morse
!suhu       → Konversi suhu
!tgl        → Info tanggal lengkap
!kataacak   → Kata acak Indonesia

━━━━ 🎉 *FUN* ━━━━
!jokes      → Jokes programmer
!roast      → Roasting santai
!fact       → Fakta unik acak
!horoscope  → Horoskop acak
!siapa      → Siapakah kamu?
!warna      → Arti warna kepribadian
!nama       → Arti nama (AI-powered)
!motivasi   → Kata motivasi
!tohell     → Kirim "ke neraka" 😈

Ketik perintah di atas untuk mencoba! 🚀
_Bot ini dilengkapi AI Groq (Llama 3.3 70B)_
_Kirim pesan tanpa prefix untuk tanya AI!_ 🧠`;
        return message.reply(menu);
    }

    // ════════════════════════════════════════════
    //  🧠 AI CONTROL COMMANDS
    // ════════════════════════════════════════════
    if (text === '!reset') {
        conversationHistory.delete(chatId);
        return message.reply('🔄 *Memori AI untuk chat ini telah direset!*\nAI tidak lagi mengingat percakapan sebelumnya di sini.');
    }

    if (text.startsWith('!ai ')) {
        try {
            await chat.sendStateTyping();
            const response = await askGroq(chatId, fullArgs);
            await chat.clearState();
            return message.reply(`🤖 *BotAI:*\n\n${response}`);
        } catch (err) {
            await chat.clearState();
            return message.reply('❌ AI sedang tidak tersedia. Coba lagi nanti.\nError: ' + err.message);
        }
    }

    // ════════════════════════════════════════════
    //  📡 UMUM
    // ════════════════════════════════════════════
    if (text === '!ping') {
        const start = Date.now();
        await message.reply('Mengukur...');
        const latency = Date.now() - start;
        return message.reply(`🏓 *Pong!*\nLatency: *${latency}ms*\nStatus: ✅ Online\nAI: 🤖 Aktif (Llama 3.3 70B)`);
    }

    if (text === '!tagme') {
        const contact = await message.getContact();
        return message.reply(`Halo @${contact.id.user}! 👋\nSemoga harimu menyenangkan! 🌟`, null, { mentions: [contact] });
    }

    if (text === '!waktu') {
        const now = new Date();
        const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const wita = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));
        const wit = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jayapura' }));
        const fmt = (d) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const tgl = wib.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return message.reply(`🕐 *Waktu Sekarang:*\n\n📅 ${tgl}\n\n🇮🇩 WIB  : ${fmt(wib)}\n🇮🇩 WITA : ${fmt(wita)}\n🇮🇩 WIT  : ${fmt(wit)}`);
    }

    if (text === '!koin') {
        const result = Math.random() < 0.5 ? '🪙 HEADS (Kepala)' : '🪙 TAILS (Ekor)';
        return message.reply(`Melempar koin...\nHasilnya: *${result}*`);
    }

    if (text === '!dadu') {
        const roll = Math.floor(Math.random() * 6) + 1;
        const face = ['⚀','⚁','⚂','⚃','⚄','⚅'][roll - 1];
        return message.reply(`🎲 Melempar dadu...\nHasilnya: ${face} *(${roll})*`);
    }

    if (text.startsWith('!pilih ')) {
        const options = fullArgs.split(/[,|\/]/).map(o => o.trim()).filter(Boolean);
        if (options.length < 2) return message.reply('❌ Masukkan minimal 2 pilihan dipisah koma.\nContoh: *!pilih kopi, teh, susu*');
        const chosen = randomItem(options);
        return message.reply(`🤔 Bot memilih: *${chosen}*`);
    }

    if (text.startsWith('!8ball')) {
        const responses = ['✅ Ya, tentu saja!', '✅ Pasti iya.', '✅ Kemungkinan besar iya.', '🤷 Tidak pasti.', '🤷 Tanyakan lagi nanti.', '🤷 Susah ditebak.', '❌ Jangan berharap.', '❌ Tidak.', '❌ Sangat diragukan.'];
        if (!fullArgs) return message.reply('❌ Tulis pertanyaanmu!\nContoh: *!8ball Apakah aku beruntung hari ini?*');
        return message.reply(`🎱 *Magic 8-Ball*\n\n❓ "${fullArgs}"\n\n${randomItem(responses)}`);
    }

    if (text.startsWith('!acak')) {
        const parts = fullArgs.split(/\s+/);
        const min = parseInt(parts[0]) || 1;
        const max = parseInt(parts[1]) || 100;
        if (min >= max) return message.reply('❌ Angka pertama harus lebih kecil dari angka kedua.');
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        return message.reply(`🎰 Angka acak antara *${min}–${max}*:\n*${num}*`);
    }

    if (text === '!motivasi') {
        const quotes = [
            '🌟 "Mulailah dari mana kamu bisa, gunakan apa yang kamu punya, lakukan apa yang kamu bisa." — Arthur Ashe',
            '💪 "Sukses bukan tentang tidak pernah gagal, tapi tentang bangkit setiap kali jatuh." — Winston Churchill',
            '🚀 "Mimpi bukan yang kamu lihat saat tidur, tapi yang tidak membiarkanmu tidur." — A.P.J. Abdul Kalam',
            '🔥 "Tidak ada yang mustahil. Kata \'mustahil\' saja menyebut \'mungkin\'." — Audrey Hepburn',
            '⭐ "Jangan tunggu inspirasi, kejar dia dengan tongkat." — Jack London',
            '🌈 "Satu-satunya cara untuk melakukan pekerjaan hebat adalah mencintai apa yang kamu lakukan." — Steve Jobs',
            '💎 "Tekanan menciptakan berlian. Tetaplah bertahan." — Anonymous',
        ];
        return message.reply(randomItem(quotes));
    }

    if (text === '!kurs') {
        try {
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            const d = await res.json();
            const idr = d.rates.IDR?.toLocaleString('id-ID') || '-';
            const sgd = d.rates.SGD?.toFixed(4) || '-';
            const myr = d.rates.MYR?.toFixed(4) || '-';
            const jpy = d.rates.JPY?.toFixed(2) || '-';
            const eur = d.rates.EUR?.toFixed(4) || '-';
            return message.reply(
`💱 *Kurs Mata Uang (vs USD)*

🇮🇩 IDR : Rp ${idr}
🇸🇬 SGD : ${sgd}
🇲🇾 MYR : ${myr}
🇯🇵 JPY : ¥${jpy}
🇪🇺 EUR : €${eur}

_Sumber: open.er-api.com_`
            );
        } catch {
            return message.reply('❌ Gagal mengambil data kurs. Coba lagi nanti.');
        }
    }

    if (text.startsWith('!cuaca ')) {
        const kota = fullArgs;
        try {
            const res = await fetch(`https://wttr.in/${encodeURIComponent(kota)}?format=j1`);
            const d = await res.json();
            const cur = d.current_condition[0];
            const area = d.nearest_area[0];
            const namaKota = area.areaName[0].value;
            const negara = area.country[0].value;
            const suhuC = cur.temp_C;
            const suhuF = cur.temp_F;
            const desc = cur.weatherDesc[0].value;
            const humidity = cur.humidity;
            const windSpeed = cur.windspeedKmph;
            const feelsLike = cur.FeelsLikeC;
            return message.reply(
`🌤️ *Cuaca ${namaKota}, ${negara}*

🌡️ Suhu: *${suhuC}°C* (${suhuF}°F)
🤔 Terasa seperti: ${feelsLike}°C
☁️ Kondisi: ${desc}
💧 Kelembaban: ${humidity}%
💨 Angin: ${windSpeed} km/h`
            );
        } catch {
            return message.reply('❌ Gagal mengambil data cuaca. Pastikan nama kota benar.\nContoh: *!cuaca Jakarta*');
        }
    }

    // ════════════════════════════════════════════
    //  🖼️ STIKER
    // ════════════════════════════════════════════
    if (text === '!stiker') {
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            return client.sendMessage(message.from, media, { sendMediaAsSticker: true, stickerName: 'BotAI', stickerAuthor: 'Groq x WhatsApp' });
        } else {
            return message.reply('❌ Kirim gambar dengan *caption* !stiker untuk mengubahnya jadi stiker.');
        }
    }

    // ════════════════════════════════════════════
    //  💻 CODING
    // ════════════════════════════════════════════
    if (text.startsWith('!cek npm ')) {
        const pkg = args[1];
        if (!pkg) return message.reply('❌ Contoh: *!cek npm express*');
        try {
            const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
            if (!res.ok) return message.reply(`❌ Paket *${pkg}* tidak ditemukan.`);
            const d = await res.json();
            return message.reply(
`📦 *NPM: ${d.name}*
Versi: *${d.version}*
Deskripsi: ${d.description || '-'}
Lisensi: ${d.license || '-'}
Homepage: ${d.homepage || '-'}
Install: \`npm install ${d.name}\``
            );
        } catch {
            return message.reply('❌ Gagal mengambil info paket npm.');
        }
    }

    if (text === '!http') {
        return message.reply(
`📡 *Kode Status HTTP*

✅ *2xx Sukses*
200 OK | 201 Created | 202 Accepted
204 No Content | 206 Partial Content

↩️ *3xx Redirect*
301 Moved Permanently | 302 Found
304 Not Modified | 307 Temp Redirect | 308 Perm Redirect

⚠️ *4xx Client Error*
400 Bad Request | 401 Unauthorized
403 Forbidden | 404 Not Found
405 Method Not Allowed | 408 Request Timeout
409 Conflict | 410 Gone | 422 Unprocessable
429 Too Many Requests

💥 *5xx Server Error*
500 Internal Server Error | 501 Not Implemented
502 Bad Gateway | 503 Service Unavailable
504 Gateway Timeout | 505 HTTP Ver Not Supported`
        );
    }

    if (text === '!regex') {
        return message.reply(
`🔍 *Regex Umum*

Email:
\`^[\\w.-]+@[\\w.-]+\\.[a-z]{2,}$\`

URL:
\`https?:\\/\\/[\\w\\-.]+(\\.[a-z]{2,})([\\/?#][^\\s]*)?\`

Nomor Telepon ID:
\`^(\\+62|62|0)8[1-9][0-9]{7,10}$\`

Tanggal DD/MM/YYYY:
\`^(0?[1-9]|[12]\\d|3[01])\\/(0?[1-9]|1[0-2])\\/\\d{4}$\`

Hanya Huruf & Spasi: \`^[a-zA-Z ]+$\`
Angka Saja: \`^\\d+$\`
Password Kuat: \`^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[!@#$%]).{8,}$\`
Slug URL: \`^[a-z0-9]+(?:-[a-z0-9]+)*$\`
Kode Pos ID: \`^[1-9][0-9]{4}$\``
        );
    }

    if (text === '!gitcmd') {
        return message.reply(
`🌿 *Perintah Git Penting*

*Setup*
git config --global user.name "Nama"
git config --global user.email "email"

*Dasar*
git init | git clone <url> | git status
git add . | git commit -m "pesan"
git push | git pull | git fetch

*Branch*
git branch | git checkout -b nama
git merge nama | git branch -d nama
git rebase main

*Log & Reset*
git log --oneline | git diff
git reset HEAD~1 | git revert HEAD
git stash | git stash pop

*Remote*
git remote -v
git remote add origin <url>
git push -u origin main

*Tag*
git tag v1.0.0
git push origin --tags`
        );
    }

    if (text === '!pycmd') {
        const snippets = [
`🐍 *List Comprehension*
\`\`\`python
squares = [x**2 for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]
\`\`\``,
`🐍 *Decorator*
\`\`\`python
import time
def timer(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        print(f"Waktu: {time.time()-start:.4f}s")
        return result
    return wrapper
\`\`\``,
`🐍 *Context Manager*
\`\`\`python
with open('file.txt', 'r') as f:
    content = f.read()
# File otomatis tertutup
\`\`\``,
`🐍 *Async/Await*
\`\`\`python
import asyncio
async def fetch_data():
    await asyncio.sleep(1)
    return "Data"
asyncio.run(fetch_data())
\`\`\``,
`🐍 *Dataclass*
\`\`\`python
from dataclasses import dataclass
@dataclass
class User:
    name: str
    age: int
    email: str = ""
user = User("Andi", 20)
\`\`\``
        ];
        return message.reply(randomItem(snippets));
    }

    if (text === '!jssnippet') {
        const snippets = [
`💡 *Debounce*
\`\`\`js
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
\`\`\``,
`💡 *Deep Clone*
\`\`\`js
const clone = obj => JSON.parse(JSON.stringify(obj));
\`\`\``,
`💡 *Fetch with Timeout*
\`\`\`js
async function fetchTimeout(url, ms = 5000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  const res = await fetch(url, { signal: ctrl.signal });
  clearTimeout(id);
  return res.json();
}
\`\`\``,
`💡 *Pipe Functions*
\`\`\`js
const pipe = (...fns) => x => fns.reduce((v, f) => f(v), x);
const add10 = x => x + 10;
const double = x => x * 2;
const transform = pipe(add10, double);
// transform(5) = 30
\`\`\``,
`💡 *Group Array by Key*
\`\`\`js
const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    (acc[item[key]] ??= []).push(item);
    return acc;
  }, {});
\`\`\``
        ];
        return message.reply(randomItem(snippets));
    }

    if (text === '!color') {
        const hex = '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const hsl = rgbToHsl(r,g,b);
        return message.reply(`🎨 *Random Color*\nHEX: *${hex}*\nRGB: *rgb(${r}, ${g}, ${b})*\nHSL: *hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)*\nCSS: \`color: ${hex};\``);
    }

    if (text.startsWith('!encode ')) {
        const encoded = Buffer.from(fullArgs).toString('base64');
        return message.reply(`🔠 *Base64 Encode*\nInput: ${fullArgs}\nOutput: \`${encoded}\``);
    }

    if (text.startsWith('!decode ')) {
        try {
            const decoded = Buffer.from(fullArgs, 'base64').toString('utf-8');
            return message.reply(`🔡 *Base64 Decode*\nInput: ${fullArgs}\nOutput: \`${decoded}\``);
        } catch {
            return message.reply('❌ Input bukan base64 yang valid.');
        }
    }

    if (text.startsWith('!json ')) {
        try {
            const parsed = JSON.parse(fullArgs);
            const formatted = JSON.stringify(parsed, null, 2);
            const lines = formatted.split('\n').length;
            return message.reply(`✅ *JSON Valid!* (${lines} baris)\n\`\`\`\n${formatted.slice(0, 1500)}\n\`\`\``);
        } catch (e) {
            return message.reply(`❌ *JSON Tidak Valid!*\nError: ${e.message}`);
        }
    }

    if (text === '!uuid') {
        const uuids = [];
        for (let i = 0; i < 3; i++) {
            uuids.push('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            }));
        }
        return message.reply(`🆔 *UUID v4 (3 buah):*\n\`${uuids[0]}\`\n\`${uuids[1]}\`\n\`${uuids[2]}\``);
    }

    if (text.startsWith('!ip2bin ')) {
        const ip = args[0];
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
            return message.reply('❌ Format IP tidak valid.\nContoh: *!ip2bin 192.168.1.1*');
        }
        const binary = parts.map(p => p.toString(2).padStart(8, '0')).join('.');
        const hex = parts.map(p => p.toString(16).padStart(2, '0').toUpperCase()).join(':');
        return message.reply(`🔢 *IP Converter*\n\nIP   : ${ip}\nBiner: \`${binary}\`\nHex  : \`${hex}\``);
    }

    if (text === '!nginx') {
        const configs = [
`🔧 *Nginx: Static Site*
\`\`\`nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
\`\`\``,
`🔧 *Nginx: Reverse Proxy (Node.js)*
\`\`\`nginx
server {
    listen 80;
    server_name api.example.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
\`\`\``,
`🔧 *Nginx: SSL dengan Let's Encrypt*
\`\`\`nginx
server {
    listen 443 ssl;
    server_name example.com;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / { ... }
}
\`\`\``
        ];
        return message.reply(randomItem(configs));
    }

    if (text === '!pm2') {
        return message.reply(
`⚙️ *Perintah PM2 Penting*

*Jalankan App*
pm2 start app.js --name myapp
pm2 start app.js -i max     → Cluster mode
pm2 start npm -- start      → npm start

*Monitoring*
pm2 list | pm2 status
pm2 monit                   → Dashboard real-time
pm2 logs myapp              → Lihat log
pm2 logs myapp --lines 100  → 100 baris terakhir

*Kontrol*
pm2 restart myapp
pm2 reload myapp            → Zero-downtime
pm2 stop myapp
pm2 delete myapp

*Auto-start*
pm2 startup                 → Buat startup script
pm2 save                    → Simpan konfigurasi

*Lainnya*
pm2 env myapp               → Lihat env vars
pm2 show myapp              → Detail info`
        );
    }

    // ════════════════════════════════════════════
    //  🖥️ SERVER / LINUX
    // ════════════════════════════════════════════
    if (text === '!serverinfo') {
        const mem = process.memoryUsage();
        return message.reply(
`🖥️ *Info Server Bot*

OS: ${os.type()} ${os.release()}
Platform: ${os.platform()}
Arsitektur: ${os.arch()}
Hostname: ${os.hostname()}
CPU: ${os.cpus()[0]?.model || 'Unknown'}
Core: ${os.cpus().length} core
Total RAM: ${formatBytes(os.totalmem())}
Free RAM: ${formatBytes(os.freemem())}
Used RAM: ${formatBytes(os.totalmem() - os.freemem())}
Uptime OS: ${formatUptime(os.uptime())}
Node.js: ${process.version}
Heap Used: ${formatBytes(mem.heapUsed)}
RSS: ${formatBytes(mem.rss)}
AI Model: Llama 3.3 70B (Groq)`
        );
    }

    if (text === '!uptime') {
        return message.reply(`⏱️ *Uptime*\n\nServer OS: ${formatUptime(os.uptime())}\nProses Bot: ${formatUptime(process.uptime())}`);
    }

    if (text === '!ram') {
        const total = os.totalmem(), free = os.freemem(), used = total - free;
        const percent = ((used / total) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(percent/10)) + '░'.repeat(10 - Math.round(percent/10));
        return message.reply(
`💾 *Info RAM*

Total  : ${formatBytes(total)}
Dipakai: ${formatBytes(used)}
Bebas  : ${formatBytes(free)}
[${bar}] ${percent}%`
        );
    }

    if (text === '!cpu') {
        const cpus = os.cpus();
        return message.reply(
`⚙️ *Info CPU*

Model : ${cpus[0]?.model || 'Unknown'}
Cores : ${cpus.length} core
Kecepatan: ${cpus[0]?.speed || 0} MHz
Platform: ${os.platform()} ${os.arch()}`
        );
    }

    if (text === '!linuxcmd') {
        const cmds = [
`🐧 *File Management*
ls -la | pwd | cd path
mkdir -p path | rmdir
cp -r src dst | mv src dst
rm -rf path | find . -name "*.js"
cat file | head -n 20 | tail -f file
grep -r "text" . | wc -l`,
`🐧 *Process & System*
top / htop / btop
ps aux | grep node
kill -9 PID | killall node
df -h | du -sh * | free -h
uname -a | lsb_release -a
systemctl status nginx
journalctl -u nginx -f`,
`🐧 *Networking*
ip a | ifconfig
ping -c 4 google.com
netstat -tulpn | ss -tulpn
curl -I https://example.com
wget -O file.zip url
scp file user@host:/path
rsync -avz src/ user@host:/dst`,
`🐧 *User & Permission*
whoami | id | groups
sudo su | su username
chmod 755 file | chown user:group file
useradd -m user | userdel user
passwd user
cat /etc/passwd | /etc/shadow
visudo → Edit sudoers`
        ];
        return message.reply(randomItem(cmds));
    }

    if (text === '!portinfo') {
        return message.reply(
`🔌 *Port Umum*

20/21  FTP (Data/Control)
22     SSH / SFTP
23     Telnet (tidak aman)
25     SMTP (email kirim)
53     DNS
80     HTTP
110    POP3
143    IMAP
443    HTTPS
465    SMTPS
587    SMTP Submission
993    IMAPS
995    POP3S
3000   Node.js Dev
3306   MySQL / MariaDB
5432   PostgreSQL
5672   RabbitMQ
6379   Redis
8080   HTTP Alt / Tomcat
8443   HTTPS Alt
9200   Elasticsearch
27017  MongoDB
11211  Memcached`
        );
    }

    if (text === '!httpmeth') {
        return message.reply(
`🌐 *HTTP Methods*

GET     → Ambil data (read-only, cached)
POST    → Buat data baru
PUT     → Update data penuh (replace)
PATCH   → Update sebagian (partial)
DELETE  → Hapus data
HEAD    → Seperti GET, tanpa body
OPTIONS → Cek method yang tersedia
TRACE   → Debug (hindari di prod)
CONNECT → Tunnel (untuk HTTPS proxy)

💡 *REST Convention:*
GET    /users       → List
GET    /users/:id   → Detail
POST   /users       → Create
PUT    /users/:id   → Replace
PATCH  /users/:id   → Update
DELETE /users/:id   → Delete`
        );
    }

    if (text === '!dockercmd') {
        return message.reply(
`🐳 *Docker Commands*

*Image*
docker pull nginx:latest
docker images | docker image ls
docker rmi image_id
docker build -t myapp:v1 .
docker tag myapp:v1 registry/myapp:v1
docker push registry/myapp:v1

*Container*
docker run -d -p 80:3000 --name myapp myimage
docker ps | docker ps -a
docker stop/start/restart myapp
docker rm myapp | docker rm -f myapp
docker logs -f myapp
docker exec -it myapp bash
docker stats

*Network & Volume*
docker network create mynet
docker volume create mydata
docker inspect myapp

*Docker Compose*
docker-compose up -d
docker-compose down -v
docker-compose logs -f
docker-compose ps
docker-compose exec service bash`
        );
    }

    if (text === '!ssl') {
        return message.reply(
`🔒 *SSL/TLS*

TLS 1.0/1.1 → Tidak aman, disable!
TLS 1.2     → Masih aman ✅
TLS 1.3     → Terbaru & tercepat ✅

*Tipe Sertifikat*
DV → Domain Validated (cepat, gratis)
OV → Organization Validated
EV → Extended Validated (green bar)

*Gratis*
Let's Encrypt + Certbot:
\`certbot --nginx -d domain.com\`
\`certbot renew --dry-run\`

*Cek SSL*
\`openssl s_client -connect domain.com:443\`
\`openssl x509 -in cert.pem -text -noout\`

*Self-signed (dev only)*
\`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem\``
        );
    }

    // ════════════════════════════════════════════
    //  🌐 NETWORK / WEB
    // ════════════════════════════════════════════
    if (text === '!ipinfo') {
        try {
            const res = await fetch('https://ipapi.co/json/');
            const d = await res.json();
            return message.reply(
`🌐 *Info IP Server Bot*

IP: ${d.ip}
Kota: ${d.city}
Wilayah: ${d.region}
Negara: ${d.country_name}
ISP: ${d.org}
Timezone: ${d.timezone}
Latitude: ${d.latitude}
Longitude: ${d.longitude}`
            );
        } catch {
            return message.reply('❌ Gagal mengambil info IP.');
        }
    }

    if (text === '!cors') {
        return message.reply(
`🔀 *CORS (Cross-Origin Resource Sharing)*

Browser memblokir request dari origin berbeda kecuali server mengizinkan.

*Response Headers:*
\`Access-Control-Allow-Origin: *\`
\`Access-Control-Allow-Methods: GET, POST, PUT, DELETE\`
\`Access-Control-Allow-Headers: Content-Type, Authorization\`
\`Access-Control-Max-Age: 86400\`

*Express.js:*
\`\`\`js
const cors = require('cors');
app.use(cors({
  origin: 'https://yourdomain.com',
  methods: ['GET','POST'],
  credentials: true
}));
\`\`\`

*Preflight:* Browser kirim OPTIONS sebelum POST/PUT cross-origin.
*Credentials:* Gunakan \`withCredentials: true\` di fetch/axios.`
        );
    }

    if (text === '!restapi') {
        return message.reply(
`📐 *Prinsip REST API*

6 Constraint REST:
1. *Stateless* — Setiap request independen, tidak ada state di server
2. *Client-Server* — Frontend & backend terpisah
3. *Cacheable* — Response bisa di-cache
4. *Uniform Interface* — URL konsisten & predictable
5. *Layered System* — Bisa ada proxy/load balancer di tengah
6. *Code on Demand* — Opsional, server bisa kirim kode

*Best Practices:*
✅ Noun bukan verb: /users bukan /getUsers
✅ Versi: /api/v1/users
✅ Plural noun: /users, /products
✅ Status code yang tepat
✅ Pagination: ?page=1&limit=20
✅ Filter: ?status=active&sort=name
✅ Auth: Bearer token / API Key
✅ JSON request & response`
        );
    }

    if (text === '!webhook') {
        return message.reply(
`🪝 *Webhook*

Webhook = HTTP callback yang dipanggil saat event terjadi.

*Cara Kerja:*
1. Daftar URL endpoint kamu ke service
2. Event terjadi (payment, push, message, dll)
3. Service POST JSON ke URL kamu
4. Kamu proses dan balas 200 OK

*Penggunaan:*
- GitHub/GitLab → Push, PR, Issue
- Midtrans/Xendit → Notif pembayaran
- Telegram/WA API → Pesan masuk
- Stripe → Event payment

*Tips:*
✅ Validasi HMAC signature header
✅ Balas 200 OK secepat mungkin
✅ Proses di background (queue)
✅ Idempotent: handle duplikat
✅ Retry dengan exponential backoff
✅ Log semua webhook masuk`
        );
    }

    if (text === '!curlcmd') {
        return message.reply(
`🌀 *Contoh cURL*

GET: \`curl https://api.example.com/users\`

GET + Header:
\`curl -H "Authorization: Bearer TOKEN" https://api.example.com/me\`

POST JSON:
\`curl -X POST -H "Content-Type: application/json" -d '{"name":"Andi"}' https://api/users\`

PUT:
\`curl -X PUT -d '{"name":"Budi"}' https://api/users/1\`

DELETE:
\`curl -X DELETE https://api/users/1\`

Cek Header:
\`curl -I https://example.com\`

Download File:
\`curl -O https://example.com/file.zip\`
\`curl -o namafile.zip https://example.com/file.zip\`

Verbose (debug):
\`curl -v https://example.com\``
        );
    }

    if (text === '!dnscmd') {
        return message.reply(
`🌍 *DNS Commands*

*nslookup*
\`nslookup example.com\`
\`nslookup -type=MX example.com\`

*dig*
\`dig example.com\`
\`dig example.com MX\`
\`dig example.com NS\`
\`dig +short example.com\`
\`dig @8.8.8.8 example.com\`  → pakai DNS Google

*host*
\`host example.com\`
\`host -t MX example.com\`

*Record Types:*
A     → IPv4 address
AAAA  → IPv6 address
CNAME → Alias ke domain lain
MX    → Mail server
NS    → Name server
TXT   → Verifikasi, SPF, DKIM
SOA   → Start of Authority
PTR   → Reverse DNS`
        );
    }

    // ════════════════════════════════════════════
    //  🗄️ DATABASE
    // ════════════════════════════════════════════
    if (text === '!sqlcmd') {
        return message.reply(
`🗄️ *SQL Penting*

*DDL*
\`CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(255) UNIQUE, created_at TIMESTAMP DEFAULT NOW());\`
\`ALTER TABLE users ADD COLUMN age INT;\`
\`DROP TABLE IF EXISTS users;\`
\`CREATE INDEX idx_email ON users(email);\`

*DML*
\`SELECT * FROM users WHERE age > 18 ORDER BY name LIMIT 10;\`
\`INSERT INTO users (name, email) VALUES ('Andi', 'andi@mail.com');\`
\`UPDATE users SET name='Budi' WHERE id=1;\`
\`DELETE FROM users WHERE id=1;\`

*JOIN*
\`SELECT u.name, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id;\`

*Agregasi*
\`SELECT city, COUNT(*), AVG(age) FROM users GROUP BY city HAVING COUNT(*) > 5;\`

*Subquery*
\`SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 100000);\``
        );
    }

    if (text === '!mongodb') {
        return message.reply(
`🍃 *MongoDB Commands*

*CRUD*
\`db.users.insertOne({name:"Andi",age:20})\`
\`db.users.insertMany([{...},{...}])\`
\`db.users.find({age:{$gt:18}}).limit(10)\`
\`db.users.findOne({_id: ObjectId("...")})\`
\`db.users.updateOne({name:"Andi"},{$set:{age:21}})\`
\`db.users.updateMany({},{$inc:{views:1}})\`
\`db.users.deleteOne({name:"Andi"})\`
\`db.users.countDocuments({active:true})\`

*Query Operators*
$gt $gte $lt $lte $ne $in $nin
$and $or $not $exists $regex

*Aggregation*
\`db.orders.aggregate([
  {$match:{status:"paid"}},
  {$group:{_id:"$city",total:{$sum:"$amount"}}},
  {$sort:{total:-1}}
])\`

*Index*
\`db.users.createIndex({email:1},{unique:true})\`
\`db.users.getIndexes()\``
        );
    }

    if (text === '!rediscmd') {
        return message.reply(
`🔴 *Redis Commands*

*String*
SET key "value" EX 3600
GET key | DEL key | EXISTS key
INCR counter | INCRBY counter 5
MSET k1 v1 k2 v2 | MGET k1 k2

*List*
LPUSH list val | RPUSH list val
LPOP list | RPOP list
LRANGE list 0 -1 | LLEN list

*Hash*
HSET user:1 name "Andi" age 20
HGET user:1 name | HGETALL user:1
HMSET user:1 k1 v1 k2 v2
HDEL user:1 age | HKEYS user:1

*Set*
SADD tags "node" "js" | SMEMBERS tags
SISMEMBER tags "node" | SCARD tags
SUNION s1 s2 | SINTER s1 s2

*Sorted Set*
ZADD leaderboard 100 "player1"
ZRANGE leaderboard 0 -1 WITHSCORES
ZRANK leaderboard "player1"

*Pub/Sub*
SUBSCRIBE channel | PUBLISH channel "msg"`
        );
    }

    if (text === '!dbtype') {
        return message.reply(
`🗂️ *Jenis Database*

*Relasional (SQL)*
MySQL, PostgreSQL, SQLite, MSSQL, Oracle
→ Data terstruktur, ACID, JOIN, transaksi

*Document*
MongoDB, CouchDB, Firestore, DynamoDB
→ JSON/BSON, skema fleksibel, nested data

*Key-Value*
Redis, DynamoDB, etcd, Memcached
→ Super cepat, cache, session, real-time

*Column-Family*
Cassandra, HBase, ScyllaDB
→ Big data, write-heavy, distribusi global

*Graph*
Neo4j, ArangoDB, Neptune
→ Relasi kompleks (social, rekomendasi)

*Time-Series*
InfluxDB, TimescaleDB, Prometheus
→ Sensor IoT, metrics, log, monitoring

*Search*
Elasticsearch, Solr, Typesense
→ Full-text search, analitik log

*NewSQL*
CockroachDB, TiDB, Spanner
→ SQL + distribusi horizontal`
        );
    }

    // ════════════════════════════════════════════
    //  🔐 KEAMANAN
    // ════════════════════════════════════════════
    if (text === '!pwgen') {
        const sets = [
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            'abcdefghijklmnopqrstuvwxyz',
            '0123456789',
            '!@#$%^&*()_+-=[]{}|;:,.<>?'
        ];
        const allChars = sets.join('');
        let password = '';
        // Pastikan ada minimal 1 karakter dari setiap set
        sets.forEach(s => password += s[Math.floor(Math.random() * s.length)]);
        for (let i = password.length; i < 16; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }
        password = password.split('').sort(() => Math.random() - 0.5).join('');
        return message.reply(`🔑 *Password Acak (16 karakter):*\n\`${password}\`\n\n⚠️ Jangan simpan password di chat!`);
    }

    if (text === '!hash') {
        return message.reply(
`#️⃣ *Jenis Hash*

MD5     → 128-bit | ❌ JANGAN untuk password
SHA-1   → 160-bit | ❌ Sudah rentan (collision)
SHA-256 → 256-bit | ✅ Aman untuk file/data
SHA-512 → 512-bit | ✅ Lebih kuat
SHA-3   → 256/512-bit | ✅ Standar terbaru

*Untuk Password (ada salt!)*
bcrypt  → ✅ Industri standard, lambat = aman
argon2  → ✅ Terbaik saat ini (pemenang PHC)
scrypt  → ✅ Memory-hard, sangat aman
PBKDF2  → ✅ FIPS-approved

*HMAC (autentikasi pesan)*
HMAC-SHA256 → Tanda tangan webhook, JWT

💡 MD5/SHA-1 hanya untuk checksum, BUKAN keamanan!`
        );
    }

    if (text === '!owasp') {
        return message.reply(
`🛡️ *OWASP Top 10 (2021)*

1. *A01* Broken Access Control
   → User akses data yang bukan miliknya
2. *A02* Cryptographic Failures
   → Data sensitif tidak terenkripsi
3. *A03* Injection (SQL, NoSQL, XSS, SSTI)
   → Input tidak disanitasi
4. *A04* Insecure Design
   → Arsitektur tidak aman sejak awal
5. *A05* Security Misconfiguration
   → Default password, error terbuka
6. *A06* Vulnerable Components
   → Library outdated dengan CVE
7. *A07* Auth Failures
   → Weak password, no rate limit
8. *A08* Data Integrity Failures
   → Deserialisasi tidak aman
9. *A09* Logging & Monitoring Failures
   → Serangan tidak terdeteksi
10. *A10* SSRF
    → Server mengakses URL dari input user

🔗 owasp.org`
        );
    }

    if (text === '!enkripsi') {
        return message.reply(
`🔐 *Jenis Enkripsi*

*Simetris (1 kunci):*
AES-128/256-GCM → Standar industri ✅
ChaCha20-Poly1305 → Alternatif AES ✅
DES/3DES → Sudah tua, hindari ❌

*Asimetris (public + private key):*
RSA-2048/4096 → TLS, email, signing
ECC (ECDSA/ECDH) → Lebih efisien dari RSA
Ed25519 → SSH key modern, cepat

*Hybrid (praktik nyata):*
TLS = Asimetris untuk key exchange + Simetris untuk data

*Penggunaan:*
Data at rest → AES-256-GCM
Data in transit → TLS 1.3
Password → bcrypt/argon2 (ini hash, bukan enkripsi)
File → GPG (GnuPG)
JWT → RS256 atau HS256`
        );
    }

    // ════════════════════════════════════════════
    //  🎌 ANIME
    // ════════════════════════════════════════════
    if (text === '!anime') {
        const list = [
            '🌟 *Attack on Titan* — Manusia vs Titan raksasa di dunia dystopian. Rating: 9.0/10',
            '⚡ *Fullmetal Alchemist: Brotherhood* — Dua bersaudara mencari Philosopher\'s Stone. Rating: 9.1/10',
            '🌀 *Naruto / Shippuden* — Ninja dengan Kurama, perjalanan jadi Hokage. Rating: 8.3/10',
            '🗡️ *Demon Slayer* — Tanjiro membasmi iblis, animasi paling indah. Rating: 8.7/10',
            '👊 *One Punch Man* — Pahlawan yang terlalu kuat sampai bosan. Rating: 8.7/10',
            '⛵ *One Piece* — Petualangan Luffy jadi Raja Bajak Laut. Rating: 8.9/10',
            '🧠 *Death Note* — Light vs L, perang kecerdasan dengan buku kematian. Rating: 9.0/10',
            '🔮 *Hunter x Hunter* — Gon mencari ayahnya, dunia Hunter. Rating: 9.0/10',
            '⚔️ *Bleach* — Ichigo jadi Shinigami, melindungi Soul Society. Rating: 8.2/10',
            '🏫 *My Hero Academia* — Dunia superhero, Deku tanpa Quirk. Rating: 8.4/10',
            '🌊 *Jujutsu Kaisen* — Yuji vs Sukuna, dunia roh kutukan. Rating: 8.6/10',
            '🎭 *JoJo\'s Bizarre Adventure* — Warisan Joestar vs Stand users. Rating: 8.4/10',
            '🚀 *Gurren Lagann* — Mecha menembus langit dengan semangat membara. Rating: 8.7/10',
            '🌸 *Violet Evergarden* — Prajurit belajar makna kata "cinta". Rating: 8.5/10',
            '🐉 *Dragon Ball Z* — Goku vs musuh terkuat semesta. Rating: 8.8/10',
        ];
        return message.reply(`🎌 *Rekomendasi Anime:*\n\n${randomItem(list)}`);
    }

    if (text === '!waifu') {
        const waifus = ['Rem (Re:Zero) 💙', 'Zero Two (Darling in the FranXX) 🌸', 'Mikasa Ackerman (AoT) ⚔️', 'Nezuko Kamado (Demon Slayer) 🎍', 'Asuna Yuuki (SAO) 🗡️', 'Hinata Hyuga (Naruto) 👁️', 'Erza Scarlet (Fairy Tail) 🛡️', 'Nami (One Piece) 🍊', 'Violet Evergarden 💜', 'Toga Himiko (MHA) 🩸', 'Yor Forger (Spy x Family) 🌹', 'Miku Nakano (5Toubun) 🎶', 'Makima (Chainsaw Man) 🔴', 'Power (Chainsaw Man) 🩸', 'Ai Hoshino (Oshi no Ko) ⭐'];
        return message.reply(`💖 *Waifu Acakmu:*\n\n${randomItem(waifus)}`);
    }

    if (text === '!jutsu') {
        const jutsus = ['🔥 Katon: Goukakyuu no Jutsu', '💨 Rasengan / Rasenshuriken', '⚡ Chidori / Raikiri', '🌀 Amaterasu (api hitam abadi)', '🌫️ Kage Bunshin no Jutsu (100 klon)', '💥 Bijuu-dama / Tailed Beast Ball', '🌊 Suiton: Daibakufu no Jutsu', '🌩️ Kamui (Obito/Kakashi)', '✨ Izanagi / Izanami', '🌀 Susanoo Sempurna', '💀 Tsukuyomi (genjutsu gila)', '🌙 Infinite Tsukuyomi', '🔴 Rinne Sharingan', '☯️ Six Paths Sage Mode'];
        return message.reply(`🍃 *Jutsu Naruto Acak:*\n\n${randomItem(jutsus)}`);
    }

    if (text === '!zanpakuto') {
        const zanpakutos = ['🌙 *Zangetsu* (Ichigo) — Getsuga Tenshou, Bankai: Tensa Zangetsu', '🌸 *Senbonzakura* (Byakuya) — Kelopak pedang, Bankai: Senbonzakura Kageyoshi', '🐯 *Haineko* (Rangiku) — Abu pedang panas', '🦊 *Shinso* (Gin) — Memanjang 100x dalam sekejap', '☀️ *Ryujin Jakka* (Yamamoto) — Api terpanas di Soul Society', '🌿 *Kazeshini* (Hisagi) — Pedang sabit angin kematian', '❄️ *Hyorinmaru* (Toshiro) — Bankai: Daiguren Hyorinmaru', '⚡ *Tenken* (Komamura) — Tubuh raksasa Bankai', '🌊 *Nejibana* (Ukitake) — Rantai petir kembar', '🌙 *Kyoka Suigetsu* (Aizen) — Ilusi sempurna tak terbatas', '🔱 *Nozarashi* (Kenpachi) — Bankai pertama Kenpachi'];
        return message.reply(`⚔️ *Zanpakuto Bleach Acak:*\n\n${randomItem(zanpakutos)}`);
    }

    if (text === '!devil') {
        const fruits = ['🌪️ *Gomu Gomu no Mi* → Gear 5 Nika (Luffy)', '🔥 *Mera Mera no Mi* → Api (Ace/Sabo)', '❄️ *Hie Hie no Mi* → Es absolut (Aokiji)', '⚡ *Goro Goro no Mi* → Petir Logia (Enel)', '🌑 *Yami Yami no Mi* → Kegelapan (Blackbeard)', '💧 *Ope Ope no Mi* → Ruang operasi (Law)', '🌋 *Magu Magu no Mi* → Magma terpanas (Akainu)', '🐲 *Uo Uo no Mi Model: Seiryu* → Naga Azure (Kaido)', '🌱 *Mori Mori no Mi* → Hutan (Green Bull)', '🔮 *Toki Toki no Mi* → Perjalanan waktu (Toki)', '🕷️ *Kumo Kumo no Mi* → Laba-laba raksasa (Black Maria)'];
        return message.reply(`🍎 *Buah Iblis One Piece Acak:*\n\n${randomItem(fruits)}`);
    }

    if (text === '!quirk') {
        const quirks = ['💪 *One For All* (Deku) — Kekuatan super berlapis yang diwariskan', '🔥 *Hellflame* (Endeavor) — Api paling panas dari pro hero', '🧊 *Half-Cold Half-Hot* (Todoroki) — Gabungan es dan api', '💥 *Explosion* (Bakugo) — Ledakan nitrogliserin dari telapak tangan', '🦅 *Fierce Wings* (Hawks) — Kendali bulu sayap tajam', '🕷️ *Black Whip* (Deku) — Cambuk energi hijau', '⚡ *Electrification* (Kaminari) — Listrik 1,3 juta volt', '🌸 *Zero Gravity* (Uraraka) — Nolkan gravitasi benda', '🔊 *Voice* (Present Mic) — Suara seperti bom', '🔮 *Erasure* (Aizawa) — Hapus Quirk orang lain'];
        return message.reply(`🦸 *Quirk MHA Acak:*\n\n${randomItem(quirks)}`);
    }

    if (text === '!titan') {
        const titans = ['⚔️ *Attack Titan* (Eren) — Melihat memori pemilik mendatang', '🏰 *Armored Titan* (Reiner) — Kulit keras seperti besi', '🌩️ *Colossal Titan* (Armin) — Uap panas & ledakan nuklir', '👑 *Founding Titan* (Ymir/Eren) — Mengendalikan semua subjek Ymir', '🦴 *Beast Titan* (Zeke) — Lempar batu & kendali Titan (Blutrausch)', '🔨 *War Hammer Titan* (Lara) — Membuat senjata dari tubuh sendiri', '🌑 *Female Titan* (Annie) — Menarik Titan pure, tubuh kristal', '🐲 *Jaw Titan* (Falco) — Rahang bisa hancurkan keras Titan apapun', '🐘 *Cart Titan* (Pieck) — Stamina tinggi, jalan 4 kaki berbulan-bulan'];
        return message.reply(`💀 *Titan AoT Acak:*\n\n${randomItem(titans)}`);
    }

    if (text === '!stand') {
        const stands = ['🌟 *Star Platinum* (Jotaro) — Za Warudo, stop waktu 5 detik', '🌙 *The World* (DIO) — ZA WARUDO! Stop waktu 9 detik', '💎 *Crazy Diamond* (Josuke) — Memperbaiki apapun kecuali diri sendiri', '🌺 *Gold Experience Requiem* (Giorno) — Nullify apapun termasuk kematian', '🏎️ *Sticky Fingers* (Bruno) — Ritsleting dimensi di apapun', '🧠 *King Crimson* (Diavolo) — Menghapus waktu, hanya dia yang bergerak', '🌈 *Soft & Wet* (Josuke 8) — Bubble mencuri properti fisik', '🔱 *Tusk Act 4* (Johnny) — Infinite rotation tembus apapun', '💀 *Killer Queen: Bites the Dust* (Kira) — Loop waktu, hidden bomb'];
        return message.reply(`🔮 *Stand JoJo Acak:*\n\n${randomItem(stands)}`);
    }

    if (text === '!openings') {
        const openings = ['🎵 *Guren no Yumiya* — AoT S1 (Linked Horizon)', '🎵 *We Are!* — One Piece (Hiroshi Kitadani)', '🎵 *Gurenge* — Demon Slayer S1 (LiSA)', '🎵 *The Hero* — One Punch Man S1 (JAM Project)', '🎵 *Crossing Field* — SAO (LiSA)', '🎵 *Silhouette* — Naruto Shippuden (KANA-BOON)', '🎵 *Again* — FMAB (YUI)', '🎵 *Unravel* — Tokyo Ghoul (TK)', '🎵 *Odd Future* — MHA S4 (UVERworld)', '🎵 *My War* — AoT S4 (Linked Horizon)', '🎵 *King Gnu* — Jujutsu Kaisen (Vivid Vice)', '🎵 *Ado* — One Piece Film: Red (Uta)', '🎵 *KICK BACK* — Chainsaw Man (Kenshi Yonezu)', '🎵 *THE RUMBLING* — AoT Final (SiM)'];
        return message.reply(`🎶 *Opening Anime Legendaris:*\n\n${randomItem(openings)}`);
    }

    if (text === '!animequote') {
        const quotes = [
            '"Manusia tidak pernah bisa menang melawan alam." — Hashirama Senju (Naruto)',
            '"Jika kamu tidak bisa memberitahuku mengapa kamu harus hidup, aku tidak perlu alasan untuk tidak membunuhmu." — Hisoka (HxH)',
            '"Orang yang tidak bisa menanggalkan senjatanya tidak memiliki hak untuk mengkritik orang lain." — Roy Mustang (FMAB)',
            '"Aku akan menjadi Raja Bajak Laut!" — Monkey D. Luffy (One Piece)',
            '"Setiap tetes air yang jatuh merupakan cara bumi menangis." — Violet Evergarden',
            '"Kamu tidak perlu jadi orang yang sempurna. Kamu hanya perlu jadi dirimu sendiri." — Izuku Midoriya (MHA)',
            '"Takdir bukanlah sesuatu yang telah ditentukan. Takdir adalah sesuatu yang kamu buat sendiri." — Erza Scarlet (Fairy Tail)',
            '"Jika kamu tidak pernah mencoba, kamu sudah kalah." — Gurren Lagann',
            '"Manusia yang tidak tahu rasa takut disebut pemberani atau bodoh." — Shanks (One Piece)',
            '"Tidak ada yang tidak bisa diselesaikan. Jika ada jalan, ambillah." — Levi Ackerman (AoT)',
        ];
        return message.reply(`💬 *Quote Anime:*\n\n_${randomItem(quotes)}_`);
    }

    // ════════════════════════════════════════════
    //  🎮 GAMING
    // ════════════════════════════════════════════
    if (text === '!gamedrop') {
        const items = ['⚔️ Excalibur (Legendary Sword)', '🛡️ Dragon Scale Armor +12', '💊 Mega Health Potion x5', '🏹 Elven Longbow +5', '💍 Ring of Invisibility', '📜 Ancient Scroll of Time', '🔮 Crystal of Arcane Mana', '🗡️ Shadowblade Dagger', '🪄 Staff of the Archmage', '💎 Soul Crystal Shard', '🦷 Dragon Fang Necklace', '📿 Amulet of Fortitude'];
        const rarity = ['⚪ Common (70%)', '🟢 Uncommon (20%)', '🔵 Rare (7%)', '🟣 Epic (2.5%)', '🟡 Legendary (0.4%)', '🌈 Mythic (0.1%)'];
        const item = randomItem(items);
        const rar = randomItem(rarity);
        return message.reply(`🎁 *Item Drop!*\n\n${item}\nRarity: ${rar}\n\nSelamat atas drop-mu, petualang! ⚔️`);
    }

    if (text === '!rpgclass') {
        const classes = ['⚔️ *Warrior* — Kuat, pertahanan tinggi, garis depan', '🧙 *Mage* — Sihir dahsyat, pertahanan lemah, area damage', '🗡️ *Rogue* — Cepat, serangan kritis tinggi, stealth', '🏹 *Archer* — Jarak jauh, akurasi tinggi, evasion', '✝️ *Paladin* — Tanker + healer + support aura', '🧝 *Ranger* — Penjelajah, ahli alam, dual wield', '☠️ *Necromancer* — Membangkitkan undead, drain life', '🔱 *Berserker* — Serangan brutal, HP tinggi, rage mode', '🌿 *Druid* — Sihir alam, transformasi binatang', '👁️ *Oracle/Seer* — Melihat masa depan, debuffer, support', '🌑 *Shadow Knight* — Gabungan tank dan dark magic', '🌟 *Hero* — Jack of all trades, master of destiny'];
        return message.reply(`🎮 *Kelas RPG Acak:*\n\n${randomItem(classes)}`);
    }

    if (text === '!spell') {
        const spells = ['🔥 *Fireball* Lv5 — 450 area damage, burning 3 detik', '❄️ *Blizzard* Lv4 — Badai es, slow 50%, area besar', '⚡ *Thunder Bolt* Lv6 — 680 dmg instan, stun 1 detik', '🌪️ *Cyclone Blast* — Pusaran udara, knockback + damage', '🌑 *Shadow Drain* — Serap HP musuh 30% per detik', '✨ *Holy Nova* — Heal ally + damage undead/demon', '🌊 *Tidal Surge* — Gelombang air besar, sapuan 5 target', '🌿 *Entangle* — Akar magis mengikat musuh 8 detik', '🌟 *Meteor Shower* — Hujan batu api dari langit', '💜 *Curse of Frailty* — DEF -70%, MDEF -70% selama 30 detik'];
        return message.reply(`🪄 *Mantra Acak:*\n\n${randomItem(spells)}`);
    }

    if (text === '!loot') {
        const rarities = [
            { name: '⚪ Common', drop: '70%', color: 'Abu-abu', stat: '+5 ATK' },
            { name: '🟢 Uncommon', drop: '20%', color: 'Hijau', stat: '+15 ATK +10 DEF' },
            { name: '🔵 Rare', drop: '7%', color: 'Biru', stat: '+35 ATK +25 DEF +10 MDEF' },
            { name: '🟣 Epic', drop: '2.5%', color: 'Ungu', stat: '+70 ATK +50 DEF +30 MDEF +5% Crit' },
            { name: '🟡 Legendary', drop: '0.4%', color: 'Emas', stat: '+150 ALL STATS +15% Crit +10% Evasion' },
            { name: '🌈 Mythic', drop: '0.1%', color: 'Pelangi', stat: 'UNSTOPPABLE — All stats max + unique ability' },
        ];
        const roll = Math.random() * 100;
        let result;
        if (roll < 0.1) result = rarities[5];
        else if (roll < 0.5) result = rarities[4];
        else if (roll < 3) result = rarities[3];
        else if (roll < 10) result = rarities[2];
        else if (roll < 30) result = rarities[1];
        else result = rarities[0];
        return message.reply(`🎲 *Roll Item Rarity!*\n\nKamu mendapatkan:\n${result.name}\n🎨 Warna: ${result.color}\n📊 Stats: ${result.stat}\n🎯 Drop Rate: ${result.drop}`);
    }

    if (text === '!trivia') {
        const trivias = [
            { q: 'Siapa pencipta Linux?', a: 'Linus Torvalds (1991)' },
            { q: 'Bahasa pemrograman apa yang dibuat oleh Guido van Rossum?', a: 'Python (1991)' },
            { q: 'Apa singkatan dari HTTP?', a: 'HyperText Transfer Protocol' },
            { q: 'Perusahaan apa yang menciptakan JavaScript?', a: 'Netscape (Brendan Eich, 1995)' },
            { q: 'Apa itu DNS?', a: 'Domain Name System — menerjemahkan domain ke IP' },
            { q: 'Berapa bit dalam 1 byte?', a: '8 bit' },
            { q: 'Siapa pendiri GitHub?', a: 'Tom Preston-Werner, Chris Wanstrath, PJ Hyett (2008)' },
            { q: 'Apa kepanjangan dari SQL?', a: 'Structured Query Language' },
            { q: 'Framework JavaScript apa yang dibuat oleh Facebook?', a: 'React.js (2013)' },
            { q: 'Apa perbedaan TCP dan UDP?', a: 'TCP: reliable, ordered, slower. UDP: fast, no guarantee' },
        ];
        const trivia = randomItem(trivias);
        return message.reply(`🧩 *Trivia Tech:*\n\n❓ ${trivia.q}\n\n🔍 Ketik *!jawab* untuk lihat jawaban (kirim dalam 30 detik)\n_atau tunggu bot jelaskan sendiri_\n\n||💡 Jawaban: ${trivia.a}||`);
    }

    // ════════════════════════════════════════════
    //  📚 BELAJAR
    // ════════════════════════════════════════════
    if (text.startsWith('!kalkulator ')) {
        try {
            const expr = fullArgs.replace(/[^0-9+\-*/().% ]/g, '');
            const result = Function('"use strict"; return (' + expr + ')')();
            if (!isFinite(result)) return message.reply('❌ Hasil tidak valid (misal pembagian dengan nol).');
            return message.reply(`🧮 *Kalkulator*\n\n${fullArgs}\n= *${result.toLocaleString('id-ID')}*`);
        } catch {
            return message.reply('❌ Ekspresi tidak valid.\nContoh: *!kalkulator 25 * 4 + 10 / 2*');
        }
    }

    if (text.startsWith('!roman ')) {
        const num = parseInt(args[0]);
        if (isNaN(num) || num < 1 || num > 3999) return message.reply('❌ Masukkan angka 1–3999.');
        const val = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
        const sym = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
        let n = num, result = '';
        for (let i = 0; i < val.length; i++) { while (n >= val[i]) { result += sym[i]; n -= val[i]; } }
        return message.reply(`🔢 *Angka Romawi*\n\n${num} → *${result}*`);
    }

    if (text.startsWith('!biner ')) {
        const num = parseInt(args[0]);
        if (isNaN(num)) return message.reply('❌ Masukkan angka desimal.');
        return message.reply(`💻 *Konversi Angka*\n\nDesimal: \`${num}\`\nBiner:   \`${num.toString(2)}\`\nHex:     \`0x${num.toString(16).toUpperCase()}\`\nOktal:   \`0o${num.toString(8)}\``);
    }

    if (text.startsWith('!morse ')) {
        const morseCode = {
            'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..',
            '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
            ' ':' / '
        };
        const morse = fullArgs.toUpperCase().split('').map(c => morseCode[c] || '?').join(' ');
        return message.reply(`📡 *Teks ke Morse:*\n\nTeks: ${fullArgs}\nMorse: \`${morse}\``);
    }

    if (text.startsWith('!suhu ')) {
        const val = parseFloat(args[0]);
        const unit = args[1]?.toLowerCase();
        if (isNaN(val) || !unit) return message.reply('❌ Format: *!suhu [angka] [c/f/k]*\nContoh: *!suhu 100 c*');
        let c, f, k;
        if (unit === 'c') { c=val; f=c*9/5+32; k=c+273.15; }
        else if (unit === 'f') { f=val; c=(f-32)*5/9; k=c+273.15; }
        else if (unit === 'k') { k=val; c=k-273.15; f=c*9/5+32; }
        else return message.reply('❌ Satuan harus: c, f, atau k');
        return message.reply(`🌡️ *Konversi Suhu*\n\n°Celsius    : *${c.toFixed(2)}°C*\n°Fahrenheit : *${f.toFixed(2)}°F*\nKelvin      : *${k.toFixed(2)} K*`);
    }

    if (text === '!tgl') {
        const now = new Date();
        const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const day = wib.getDay();
        const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
        const startOfYear = new Date(wib.getFullYear(), 0, 0);
        const diff = wib - startOfYear;
        const dayOfYear = Math.floor(diff / 86400000);
        const daysLeft = 365 - dayOfYear;
        const weekNum = Math.ceil(dayOfYear / 7);
        return message.reply(
`📅 *Info Tanggal Lengkap*

Hari    : ${days[day]}
Tanggal : ${wib.getDate()} ${months[wib.getMonth()]} ${wib.getFullYear()}
Hari ke : ${dayOfYear} dari 365
Minggu  : ke-${weekNum}
Sisa    : ${daysLeft} hari lagi ke 31 Des`
        );
    }

    if (text === '!kataacak') {
        const kosakata = ['Serendipity','Ephemeral','Melancholy','Sublime','Enigmatic','Ethereal','Crepuscule','Luminescent','Serenity','Metamorphosis','Kaleidoscope','Whimsical','Phantasmagoric','Surreptitious','Incandescent'];
        const kata = randomItem(kosakata);
        return message.reply(`📖 *Kata Menarik Hari Ini:*\n\n*${kata}*\n\nMau tahu artinya? Tanyakan langsung ke AI! 🤖`);
    }

    // ════════════════════════════════════════════
    //  💬 QUOTE
    // ════════════════════════════════════════════
    if (text === '!quote') {
        try {
            const res = await fetch('https://api.quotable.io/random');
            if (res.ok) {
                const d = await res.json();
                return message.reply(`💬 *Quote of the Moment*\n\n_"${d.content}"_\n\n— *${d.author}*`);
            }
        } catch {}
        const localQuotes = [
            '"Kode yang baik adalah dokumentasi terbaik." — Steve McConnell',
            '"Selalu tulis kode seolah orang yang akan merawatnya adalah psikopat yang tahu alamat rumahmu." — Martin Golding',
            '"Pemrograman itu seni. Jangan hanya membuatnya bekerja, buatlah indah." — Anonymous',
            '"Setiap program besar dulunya adalah program kecil." — Alan Kay',
        ];
        return message.reply(`💬 *Quote:*\n\n_${randomItem(localQuotes)}_`);
    }

    // ════════════════════════════════════════════
    //  🎉 FUN
    // ════════════════════════════════════════════
    if (text === '!jokes') {
        const jokes = [
            'Kenapa programmer suka dark mode?\nKarena *light attracts bugs!* 🪲',
            'Seorang programmer pergi ke warung.\n"Tolong berikan saya kopi, air, dan juice."\nWarung: "Kenapa banyak?"\nJawab: "Karena formulir tertulis *isi semua field.*"',
            'Kenapa Git tidak pernah bisa jadian?\nKarena selalu ada *conflict!* 💔',
            'Kenapa programmer tidak bisa tidur nyenyak?\nKarena selalu ada *bug di dalam mimpi!*',
            'Ada 10 tipe orang di dunia:\nYang mengerti *biner* dan yang tidak. 💻',
            'Programmer senior ke junior:\n"Kamu sudah fix bug-nya?"\nJunior: "Udah bang, tapi muncul 3 bug baru."\nSenior: "Progress!" 🎉',
            'Kenapa programmer suka ngopi?\nKarena Java! ☕',
            'Seorang QA masuk ke bar.\nDia memesan: 0 bir, -1 bir, 9999 bir, undefined bir.\n*Semua bar di dunia langsung crash.* 💥',
        ];
        return message.reply(`😂 *Jokes Programmer:*\n\n${randomItem(jokes)}`);
    }

    if (text === '!roast') {
        const roasts = [
            'Skillmu setara WiFi tetangga — kencang di teorinya, lemot pas dipakai. 📶',
            'Kamu tuh kayak console.log — ada di mana-mana tapi nggak berguna di production. 🙃',
            'Bug-mu lebih banyak dari fiturnya. Itu bukan produk, itu *eksperimen berbahaya*. 🔬',
            'Kamu nulis kode kayak nulis diary — nobody else can read it. 📔',
            'Git commit history-mu: "fix bug", "fix fix", "please work", "omg finally". Bro... 🤦',
            'Stack Overflow itu rumah keduamu ya? Sayang sewa, mending beli. 😅',
            'Indentasimu seperti zipper celana rusak — ada yang masuk, ada yang keluar. 😭',
            'Variable namamu: a, b, c, x, y, temp1, temp2, temp3... Brother, ada kamus ya? 📚',
        ];
        return message.reply(`🔥 *Roasting Santai:*\n\n${randomItem(roasts)}\n\n_Ini bercanda! Tetap semangat coding! 💪_`);
    }

    if (text === '!fact') {
        const facts = [
            '🤯 Kata "bug" dalam programming pertama kali digunakan tahun 1947 ketika ngengat nyangkut di komputer Harvard Mark II.',
            '🤯 Stack Overflow dikunjungi lebih dari 50 juta programmer per bulan.',
            '🤯 Nama JavaScript tidak ada hubungannya dengan Java. Itu murni strategi marketing.',
            '🤯 Linux dipakai oleh 96.3% dari 1000 server web teratas di dunia.',
            '🤯 Git diciptakan oleh Linus Torvalds hanya dalam 10 hari.',
            '🤯 Rata-rata programmer membuat 70 bug per 1000 baris kode.',
            '🤯 Ada sekitar 700 bahasa pemrograman aktif di dunia.',
            '🤯 Kode pertama yang berjalan di komputer ditulis oleh Ada Lovelace tahun 1843.',
            '🤯 Gurita punya 3 jantung dan darahnya berwarna biru.',
            '🤯 Semut bisa mengangkat beban 50x berat tubuhnya.',
            '🤯 Bahasa Python dinamai dari Monty Python, bukan ular.',
            '🤯 Versi 1 dari World Wide Web tidak memiliki gambar sama sekali.',
        ];
        return message.reply(`💡 *Fakta Unik:*\n\n${randomItem(facts)}`);
    }

    if (text === '!horoscope') {
        const signs = [
            '♈ *Aries* — Hari ini adalah saat yang tepat untuk mengambil inisiatif. Proyek barumu akan sukses!',
            '♉ *Taurus* — Fokus pada stabilitas finansialmu. Jangan tergoda pengeluaran impulsif hari ini.',
            '♊ *Gemini* — Komunikasimu sangat tajam hari ini. Manfaatkan untuk networking dan presentasi!',
            '♋ *Cancer* — Intuisimu kuat hari ini. Percayai perasaanmu dalam mengambil keputusan besar.',
            '♌ *Leo* — Karismamu bersinar! Waktunya jadi pusat perhatian dan pimpin tim dengan percaya diri.',
            '♍ *Virgo* — Detail dan ketelitianmu akan dihargai. Sempurnakan pekerjaanmu hari ini.',
            '♎ *Libra* — Keseimbangan adalah kuncimu. Jangan mudah terpengaruh pendapat orang lain.',
            '♏ *Scorpio* — Energimu penuh hari ini. Tapi hati-hati dengan kata-kata yang terlalu tajam.',
            '♐ *Sagittarius* — Petualangan menanti! Ada kesempatan baru yang datang, bersiaplah.',
            '♑ *Capricorn* — Kerja kerasmu hampir membuahkan hasil. Tetap konsisten sedikit lagi!',
            '♒ *Aquarius* — Ide inovatifmu bisa mengubah dunia. Jangan takut untuk tampil berbeda.',
            '♓ *Pisces* — Kreativitasmu sedang di puncak hari ini. Ekspresikan dirimu melalui karya.',
        ];
        return message.reply(`🔮 *Horoskop Acak Hari Ini:*\n\n${randomItem(signs)}`);
    }

    if (text === '!siapa') {
        const identities = [
            '🦸 Kamu adalah pahlawan tersembunyi yang sedang menunggu momen yang tepat!',
            '🧙 Kamu adalah penyihir hebat yang belum menemukan tongkat sihirnya.',
            '🚀 Kamu adalah astronaut yang belum menemukan roketnya.',
            '🎯 Kamu seperti sniper — lambat persiapannya, tapi akurat hasilnya.',
            '🌊 Kamu seperti ombak — terlihat biasa, tapi punya kekuatan yang luar biasa.',
            '🔥 Kamu adalah api unggun di malam yang dingin — selalu ada untukmu.',
            '💎 Kamu adalah berlian kasar yang butuh dipoles sedikit lagi.',
            '🌻 Kamu adalah bunga matahari — selalu menghadap cahaya walau badai datang.',
        ];
        return message.reply(`🤔 *Siapakah Kamu?*\n\n${randomItem(identities)}`);
    }

    if (text === '!warna') {
        const colors = [
            '🔴 *Merah* — Energi, keberanian, gairah. Pemimpin alami yang penuh semangat.',
            '🔵 *Biru* — Kepercayaan, ketenangan, profesional. Pemikir analitis yang dapat diandalkan.',
            '🟢 *Hijau* — Pertumbuhan, harmoni, keseimbangan. Penyembuh alam yang peduli lingkungan.',
            '🟡 *Kuning* — Optimisme, kreativitas, kecerdasan. Jiwa muda yang selalu bersemangat.',
            '🟣 *Ungu* — Misteri, kebijaksanaan, spiritualitas. Visioner yang berpikir jauh ke depan.',
            '🟠 *Oranye* — Antusiasme, petualangan, sosialisasi. Entertainer yang menyegarkan.',
            '⚫ *Hitam* — Kekuatan, elegan, misteri. Perfeksionis yang menghargai kualitas.',
            '⚪ *Putih* — Kesucian, kesederhanaan, kejelasan. Pemikir minimalis yang jernih.',
        ];
        return message.reply(`🎨 *Arti Warna Kepribadian:*\n\n${randomItem(colors)}`);
    }

    if (text === '!tohell') {
        return message.reply('😈 *KE NERAKA KAU!!!*\n\n👿 Hahahaha, just kidding bestie. Semangat terus ya! 😂❤️');
    }

    if (text.startsWith('!nama ')) {
        try {
            await chat.sendStateTyping();
            const response = await askGroq(chatId, `Ceritakan asal-usul dan arti nama "${fullArgs}" secara singkat dan menarik. Sertakan asal bahasa, makna harfiah, dan karakter orang dengan nama ini. Maksimal 150 kata.`);
            await chat.clearState();
            return message.reply(`📛 *Arti Nama "${fullArgs}":*\n\n${response}`);
        } catch {
            await chat.clearState();
            return message.reply('❌ Gagal mengambil info nama. Coba lagi nanti.');
        }
    }

    // ════════════════════════════════════════════
    //  ❓ PERINTAH TIDAK DIKENAL → TETAP AI
    // ════════════════════════════════════════════
    if (text.startsWith('!')) {
        return message.reply(`❓ Perintah *${text}* tidak dikenali.\nKetik *!menu* untuk melihat semua perintah yang tersedia.\n\n💡 _Atau kirim pesan tanpa "!" untuk tanya langsung ke AI!_ 🤖`);
    }

    // ════════════════════════════════════════════
    //  🤖 AUTO AI REPLY — semua pesan non-command
    // ════════════════════════════════════════════
    // Abaikan pesan yang terlalu pendek (kurang dari 3 karakter)
    if (message.body.trim().length < 3) return;

    // Abaikan jika bukan pesan teks biasa
    if (message.type !== 'chat' && message.type !== 'text') return;

    try {
        await chat.sendStateTyping();
        const aiResponse = await askGroq(chatId, message.body.trim());
        await chat.clearState();
        await message.reply(`🤖 ${aiResponse}`);
    } catch (err) {
        await chat.clearState();
        console.error('Groq AI Error:', err.message);
        // Gagal diam-diam agar tidak spam error
    }
});

// ─────────────────────────────────────────────
//  HELPER: RGB to HSL
// ─────────────────────────────────────────────
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d/(2-max-min) : d/(max+min);
        switch (max) {
            case r: h = ((g-b)/d + (g < b ? 6 : 0))/6; break;
            case g: h = ((b-r)/d + 2)/6; break;
            case b: h = ((r-g)/d + 4)/6; break;
        }
    }
    return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
console.log('🚀 Memulai WhatsApp Bot + Groq AI...');
console.log('📦 Pastikan sudah install: npm install whatsapp-web.js qrcode-terminal groq-sdk');
client.initialize();