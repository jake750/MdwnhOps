# غرفة العمليات — التشغيل والنشر

لوحة إدارة سيرفر نادي المدونة. جزآن في ريبو واحد:

| المجلد | ما هو | أين يُنشر |
|---|---|---|
| `docs/` | الواجهة (HTML/CSS/JS بلا بناء) | GitHub Pages |
| `worker/` | الخادم: الدخول بالديسكورد، البيانات، البوت، المزامنة كل ٥ دقائق | Cloudflare Workers + D1 |

الواجهة لا تحمل أي سر ولا تقرأ قاعدة بيانات؛ كل شيء يمر عبر الـ Worker، وهو يتحقق من رتبتك في الديسكورد مع كل طلب.

## التشغيل محليًا (بيانات تجريبية، بلا بوت)

```bash
cd worker
npx wrangler d1 execute mdwnh-ops --local --file=schema.sql
npx wrangler dev --test-scheduled
```

وفي ترمنال ثانٍ من جذر الريبو:

```bash
node dev-site.mjs
```

ثم افتح http://localhost:5179 واختر «كأدمن» أو «كعضو». ملف `worker/.dev.vars` (غير مرفوع) فيه `DEMO=1`.

## النشر لأول مرة

الخطوات المعلّمة بـ 🔐 تفعلها أنت في الترمنال حقك لأنها تتعامل مع أسرار.

1. **حساب Cloudflare** مجاني: https://dash.cloudflare.com/sign-up
2. 🔐 **ربط جهازك بالحساب** (يفتح المتصفح لتسجيل الدخول):
   ```bash
   cd worker
   npx wrangler login
   ```
3. **إنشاء القاعدة** وجداولها:
   ```bash
   npx wrangler d1 create mdwnh-ops
   ```
   انسخ `database_id` الذي يطبعه إلى `wrangler.toml`، ثم:
   ```bash
   npx wrangler d1 execute mdwnh-ops --remote --file=schema.sql
   ```
4. **المفتاح العام للتطبيق** (ليس سرًا): Developer Portal ← General Information ← Public Key، ضعه في `PUBLIC_KEY` داخل `wrangler.toml`.
5. **النشر**:
   ```bash
   npx wrangler deploy
   ```
   يطبع رابطًا مثل `https://mdwnh-ops.XXXX.workers.dev` — هذا رابط الـ Worker.
6. 🔐 **الأسرار** — كل أمر يطلب منك لصق القيمة:
   ```bash
   npx wrangler secret put BOT_TOKEN
   ```
   ```bash
   npx wrangler secret put CLIENT_SECRET
   ```
   ```bash
   npx wrangler secret put SESSION_SECRET
   ```
   لـ `SESSION_SECRET` الصق نصًا عشوائيًا طويلًا، تولّده بهذا الأمر:
   ```bash
   node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
   ```
7. **في Developer Portal**:
   - OAuth2 ← Redirects ← أضف `<رابط الـ Worker>/auth/callback`
   - General Information ← Interactions Endpoint URL ← `<رابط الـ Worker>/interactions` (لأمر `/اقتراح`)
8. **الواجهة**: ضع رابط الـ Worker في `docs/config.js` بدل `https://mdwnh-ops.REPLACE.workers.dev`، ارفع، ثم في GitHub: Settings ← Pages ← Deploy from a branch ← `main` و `/docs`.
9. **أول دخول**: افتح الموقع وسجّل الدخول (يدخل أي أحد عنده Administrator أو Manage Server). من ⚙️ الإعدادات:
   - اختر رتب الإدارة (مثل moderator) ورومات الـ logs، وأين ينشر البوت كل شيء.
   - اضغط «مزامنة الآن»، ثم «تسجيل أمر /اقتراح».

## صلاحيات البوت في السيرفر

View Channels · View Audit Log · Send Messages · Embed Links · Attach Files · Read Message History — ولا شيء غيرها.
وفي الرومات الخاصة (كاتيجوري غرفة العمليات وروم الـ logs) أضف رتبة البوت بـ View Channel و Read Message History.

في Developer Portal ← Bot: فعّل **Server Members Intent** و **Message Content Intent**، وأطفئ **Public Bot**.

## التعديل اليدوي حين يخطئ شيء

- **النقاط**: ✏️ بجانب أي رصيد ← عدد موجب أو سالب مع السبب. أي تسجيل يمكن التراجع عنه.
- **الرواد**: الحالة والدور والملاحظات لكل عضو لا تمسحها المزامنة؛ ويمكن إضافة عضو يدويًا.
- **السجلات**: أي حدث يمكن تصحيح نوعه ونصه أو إخفاؤه، ويمكن إضافة حدث يدوي.
