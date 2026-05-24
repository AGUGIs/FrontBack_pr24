/**
 * Проверка: HTTPS без предупреждений (CA в доверенных).
 * Запуск: node verify-https.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const caPath = path.join(__dirname, 'rootCA.pem');

if (!fs.existsSync(caPath)) {
  console.error('Сначала выполните: npm run cert');
  process.exit(1);
}

const agent = new https.Agent({ ca: fs.readFileSync(caPath) });

function check(url) {
  return new Promise((resolve) => {
    https
      .get(url, { agent }, (res) => {
        resolve({ url, ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      })
      .on('error', (err) => resolve({ url, ok: false, error: err.message }));
  });
}

(async () => {
  const results = await Promise.all([
    check('https://127.0.0.1:3000/api/products'),
    check('https://localhost:3001/'),
  ]);

  let failed = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`OK  ${r.url} → ${r.status}`);
    } else {
      failed = true;
      console.log(`FAIL ${r.url} → ${r.error || r.status}`);
    }
  }

  if (failed) {
    console.log('\nВыполните npm run cert (с sudo на Linux) и перезапустите серверы.');
    process.exit(1);
  }
  console.log('\nСертификаты валидны. В браузере должно быть «Защищённое соединение».');
})();
