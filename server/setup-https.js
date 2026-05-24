/**
 * Доверенный HTTPS для localhost (ПР15)
 *
 * 1. Создаёт (или переиспользует) корневой CA
 * 2. Выпускает сертификат localhost (валидная подпись, без лишних SKI/AKI)
 * 3. Добавляет CA в доверенные хранилища ОС и NSS (Chrome/Firefox на Linux)
 *
 * npm run cert
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, 'localhost.pem');
const keyPath = path.join(__dirname, 'localhost-key.pem');
const caPath = path.join(__dirname, 'rootCA.pem');
const caKeyPath = path.join(__dirname, 'rootCA-key.pem');
const caDerPath = path.join(__dirname, 'rootCA.crt');

const forge = require('node-forge');
const pki = forge.pki;

const caAttrs = [
  { name: 'commonName', value: 'KastryulaMarket Dev CA' },
  { name: 'organizationName', value: 'KastryulaMarket' },
  { name: 'countryName', value: 'RU' },
];

function installCaTrust() {
  const platform = process.platform;
  let caInstalled = false;

  console.log('[3/4] Добавление CA в доверенные сертификаты...');

  if (platform === 'win32') {
    try {
      execSync(`certutil -addstore -f "Root" "${caDerPath}"`, { stdio: 'pipe', windowsHide: true });
      console.log('   CA добавлен в хранилище Windows (Root).');
      caInstalled = true;
    } catch (e) {
      console.log('   PowerShell (администратор):');
      console.log(`   certutil -addstore -f "Root" "${caDerPath}"`);
    }
  } else if (platform === 'linux') {
    const linuxCaDest = '/usr/local/share/ca-certificates/kastryulamarket-dev-ca.crt';
    try {
      execSync(`sudo cp "${caPath}" "${linuxCaDest}"`, { stdio: 'pipe' });
      execSync('sudo update-ca-certificates', { stdio: 'pipe' });
      console.log('   CA добавлен в системное хранилище Linux.');
      caInstalled = true;
    } catch (e) {
      console.log(`   sudo cp "${caPath}" "${linuxCaDest}" && sudo update-ca-certificates`);
    }

    const nssDb = path.join(process.env.HOME || '', '.pki', 'nssdb');
    if (fs.existsSync(nssDb)) {
      try {
        execSync(
          `certutil -d sql:${nssDb} -A -t "C,," -n "KastryulaMarket Dev CA" -i "${caPath}"`,
          { stdio: 'pipe' }
        );
        console.log('   CA добавлен в NSS (Chrome/Firefox).');
        caInstalled = true;
      } catch (e) {
        console.log('   Для Chrome: sudo apt install libnss3-tools');
        console.log(`   certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "KastryulaMarket Dev CA" -i "${caPath}"`);
      }
    }
  } else if (platform === 'darwin') {
    try {
      execSync(
        `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${caPath}"`,
        { stdio: 'pipe' }
      );
      console.log('   CA добавлен в Keychain (macOS).');
      caInstalled = true;
    } catch (e) {
      console.log(`   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${caPath}"`);
    }
  } else {
    console.log(`   Импортируйте вручную: ${caPath}`);
  }

  return caInstalled;
}

function loadOrCreateCa() {
  if (fs.existsSync(caPath) && fs.existsSync(caKeyPath)) {
    console.log('[1/4] Используем существующий CA (rootCA.pem)...');
    const caCert = pki.certificateFromPem(fs.readFileSync(caPath, 'utf8'));
    const caKeys = {
      privateKey: pki.privateKeyFromPem(fs.readFileSync(caKeyPath, 'utf8')),
      publicKey: caCert.publicKey,
    };
    if (!fs.existsSync(caDerPath)) {
      const caDer = forge.asn1.toDer(pki.certificateToAsn1(caCert)).getBytes();
      fs.writeFileSync(caDerPath, Buffer.from(caDer, 'binary'));
    }
    return { caCert, caKeys };
  }

  console.log('[1/4] Генерация корневого CA...');
  const caKeys = pki.rsa.generateKeyPair(2048);
  const caCert = pki.createCertificate();
  caCert.publicKey = caKeys.publicKey;
  caCert.serialNumber = '01';
  caCert.validity.notBefore = new Date();
  caCert.validity.notAfter = new Date();
  caCert.validity.notAfter.setFullYear(caCert.validity.notAfter.getFullYear() + 10);
  caCert.setSubject(caAttrs);
  caCert.setIssuer(caAttrs);
  caCert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
  ]);
  caCert.sign(caKeys.privateKey, forge.md.sha256.create());

  fs.writeFileSync(caPath, pki.certificateToPem(caCert));
  fs.writeFileSync(caKeyPath, pki.privateKeyToPem(caKeys.privateKey));
  const caDer = forge.asn1.toDer(pki.certificateToAsn1(caCert)).getBytes();
  fs.writeFileSync(caDerPath, Buffer.from(caDer, 'binary'));
  console.log('   CA создан: rootCA.pem + rootCA.crt');
  return { caCert, caKeys };
}

function createServerCert(caCert, caKeys) {
  console.log('[2/4] Генерация сертификата для localhost...');
  const serverKeys = pki.rsa.generateKeyPair(2048);
  const serverCert = pki.createCertificate();
  serverCert.publicKey = serverKeys.publicKey;
  serverCert.serialNumber = String(Date.now());
  serverCert.validity.notBefore = new Date();
  serverCert.validity.notAfter = new Date();
  serverCert.validity.notAfter.setFullYear(serverCert.validity.notAfter.getFullYear() + 1);
  serverCert.setSubject([{ name: 'commonName', value: 'localhost' }]);
  serverCert.setIssuer(caAttrs);
  serverCert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' },
      ],
    },
  ]);
  serverCert.sign(caKeys.privateKey, forge.md.sha256.create());

  fs.writeFileSync(certPath, pki.certificateToPem(serverCert));
  fs.writeFileSync(keyPath, pki.privateKeyToPem(serverKeys.privateKey));
  console.log('   localhost.pem (только leaf), localhost-key.pem');
  return serverCert;
}

// --- main ---
console.log('');
console.log('=== Доверенный HTTPS для localhost ===');
console.log('');

try {
  require.resolve('node-forge');
} catch (e) {
  execSync('npm install node-forge', { stdio: 'inherit', cwd: __dirname });
}

const { caCert, caKeys } = loadOrCreateCa();
createServerCert(caCert, caKeys);
const caInstalled = installCaTrust();

console.log('[4/4] Готово!');
console.log('');
if (caInstalled) {
  console.log('Закройте браузер полностью и откройте: https://localhost:3001');
  console.log('Ожидается: «Защищённое соединение» (замок), без предупреждения.');
  console.log('');
} else {
  console.log('Импортируйте rootCA.pem в браузер как доверенный корневой центр.');
  console.log('Chrome: Настройки → Безопасность → Управление сертификатами → Центры сертификации → Импорт');
  console.log('');
}
console.log('cd server && npm start');
console.log('cd client && npm start');
console.log('');
