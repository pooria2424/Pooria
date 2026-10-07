import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";

let client = null;
let session = null;

let apiId = null;
let apiHash = "";
let phoneNumber = "";

let currentUser = null;
let messageHandler = null;

// Timers running in browser
const timers = new Map();

// ======================================================
// DOM
// ======================================================

const $ = (id) => document.getElementById(id);

const apiIdInput = $("apiId");
const apiHashInput = $("apiHash");
const phoneInput = $("phone");
const sessionInput = $("session");

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");

const loginSection = $("loginSection");
const botPanel = $("botPanel");

const statusEl = $("status");

// ======================================================
// Local Storage
// ======================================================

const STORAGE = {
  apiId: "tg_api_id",
  apiHash: "tg_api_hash",
  phone: "tg_phone",
  session: "tg_session",
  schedules: "tg_schedules"
};

function saveSchedules(schedules) {
  localStorage.setItem(
    STORAGE.schedules,
    JSON.stringify(schedules)
  );
}

function loadSchedules() {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE.schedules) || "{}"
    );
  } catch {
    return {};
  }
}

function getSchedule(chatId) {
  const schedules = loadSchedules();
  return schedules[String(chatId)] || null;
}

function setSchedule(chatId, data) {
  const schedules = loadSchedules();

  schedules[String(chatId)] = {
    ...data,
    chatId: String(chatId),
    updatedAt: Date.now()
  };

  saveSchedules(schedules);
}

function removeSchedule(chatId) {
  const schedules = loadSchedules();

  delete schedules[String(chatId)];

  saveSchedules(schedules);
}

// ======================================================
// UI
// ======================================================

function setStatus(text, type = "") {
  if (!statusEl) return;

  statusEl.textContent = text;
  statusEl.className = "status " + type;
}

function showPanel() {
  if (loginSection) {
    loginSection.style.display = "none";
  }

  if (botPanel) {
    botPanel.style.display = "block";
  }
}

function showLogin() {
  if (loginSection) {
    loginSection.style.display = "block";
  }

  if (botPanel) {
    botPanel.style.display = "none";
  }
}

// ======================================================
// Saved settings
// ======================================================

function loadSavedInputs() {
  if (apiIdInput) {
    apiIdInput.value =
      localStorage.getItem(STORAGE.apiId) || "";
  }

  if (apiHashInput) {
    apiHashInput.value =
      localStorage.getItem(STORAGE.apiHash) || "";
  }

  if (phoneInput) {
    phoneInput.value =
      localStorage.getItem(STORAGE.phone) || "";
  }

  if (sessionInput) {
    sessionInput.value =
      localStorage.getItem(STORAGE.session) || "";
  }
}

function saveInputs() {
  if (apiIdInput) {
    localStorage.setItem(
      STORAGE.apiId,
      apiIdInput.value.trim()
    );
  }

  if (apiHashInput) {
    localStorage.setItem(
      STORAGE.apiHash,
      apiHashInput.value.trim()
    );
  }

  if (phoneInput) {
    localStorage.setItem(
      STORAGE.phone,
      phoneInput.value.trim()
    );
  }
}

// ======================================================
// Telegram Login
// ======================================================

async function loginTelegram() {
  try {
    apiId = Number(apiIdInput.value.trim());
    apiHash = apiHashInput.value.trim();
    phoneNumber = phoneInput.value.trim();

    if (!apiId || !apiHash) {
      throw new Error(
        "API ID و API Hash را وارد کنید."
      );
    }

    saveInputs();

    const savedSession =
      sessionInput.value.trim() ||
      localStorage.getItem(STORAGE.session) ||
      "";

    session = new StringSession(savedSession);

    client = new TelegramClient(
      session,
      apiId,
      apiHash,
      {
        connectionRetries: 5
      }
    );

    setStatus(
      "در حال اتصال به تلگرام...",
      "loading"
    );

    if (savedSession) {
      await client.connect();
    } else {
      await client.start({
        phoneNumber: async () => phoneNumber,

        password: async () => {
          return prompt(
            "رمز دو مرحله‌ای تلگرام را وارد کنید:"
          );
        },

        phoneCode: async () => {
          return prompt(
            "کد ارسال‌شده توسط تلگرام را وارد کنید:"
          );
        },

        onError: (err) => {
          console.error(err);
          setStatus(
            "خطا در ورود: " + err.message,
            "error"
          );
        }
      });
    }

    if (!client.connected) {
      await client.connect();
    }

    currentUser = await client.getMe();

    // Save session
    const newSession =
      client.session.save();

    localStorage.setItem(
      STORAGE.session,
      newSession
    );

    sessionInput.value = newSession;

    setStatus(
      `وارد شدید: ${
        currentUser.username
          ? "@" + currentUser.username
          : currentUser.firstName || "کاربر"
      }`,
      "success"
    );

    showPanel();

    // Setup message listener
    await setupMessageListener();

    // Restore active schedules
    await restoreSchedules();

    // Send activation message
    await sendActivationMessage();

  } catch (error) {
    console.error(error);

    setStatus(
      "خطا: " + (
        error?.message || String(error)
      ),
      "error"
    );
  }
}

// ======================================================
// Message Listener
// ======================================================

async function setupMessageListener() {
  if (!client) return;

  // جلوگیری از نصب Listener چندباره
  if (messageHandler) {
    try {
      client.removeEventHandler(
        messageHandler
      );
    } catch {}
  }

  messageHandler = async (event) => {
    try {
      await handleIncomingMessage(event);
    } catch (error) {
      console.error(
        "Message handler error:",
        error
      );
    }
  };

  client.addEventHandler(
    messageHandler,
    new NewMessage({})
  );
}

// ======================================================
// Incoming Message
// ======================================================

async function handleIncomingMessage(event) {
  if (!event || !event.message) {
    return;
  }

  const message = event.message;

  const rawText =
    message.message || "";

  const text =
    rawText.trim();

  if (!text) return;

  const chat = await message.getChat();

  if (!chat) return;

  // ====================================================
  // Saved Messages
  // ====================================================

  if (await isSavedMessages(message)) {

    // .list
    if (
      text.toLowerCase() === ".list"
    ) {
      await sendScheduleList();
      return;
    }

    // .stopall
    if (
      text.toLowerCase() === ".stopall"
    ) {
      await stopAllSchedules();

      await client.sendMessage(
        "me",
        {
          message:
            "🛑 تمام زمان‌بندی‌ها متوقف شدند."
        }
      );

      return;
    }

    return;
  }

  // ====================================================
  // Group commands
  // ====================================================

  if (!isGroupChat(chat)) {
    return;
  }

  const parsed =
    parseCommand(text);

  if (!parsed) {
    return;
  }

  const chatId =
    String(chat.id);

  const title =
    getChatTitle(chat);

  // ----------------------------------------------------
  // OFF
  // ----------------------------------------------------

  if (parsed.action === "off") {

    stopTimer(chatId);
    removeSchedule(chatId);

    await client.sendMessage(
      chat,
      {
        message:
          "🛑 ارسال خودکار برای این گروه متوقف شد."
      }
    );

    return;
  }

  // ----------------------------------------------------
  // ON / EDIT
  // ----------------------------------------------------

  if (
    parsed.action === "on" ||
    parsed.action === "edit"
  ) {

    stopTimer(chatId);

    const schedule = {
      chatId,
      title,
      text: parsed.text,
      minutes: parsed.minutes,
      intervalMs:
        parsed.minutes * 60 * 1000,
      active: true,
      createdAt: Date.now()
    };

    // Try to create a useful group link
    try {
      if (
        chat.username
      ) {
        schedule.link =
          "https://t.me/" +
          chat.username;
      }
    } catch {}

    setSchedule(
      chatId,
      schedule
    );

    startTimer(
      chatId,
      schedule
    );

    await client.sendMessage(
      chat,
      {
        message:
          `✅ زمان‌بندی ${
            parsed.action === "edit"
              ? "ویرایش"
              : "فعال"
          } شد.\n\n` +
          `📝 متن: ${parsed.text}\n` +
          `⏱ فاصله: ${parsed.minutes} دقیقه`
      }
    );

    return;
  }
}

// ======================================================
// Detect Saved Messages
// ======================================================

async function isSavedMessages(message) {
  try {
    const chat = await message.getChat();

    if (!chat) {
      return false;
    }

    // Saved Messages has input peer "me"
    if (
      message.out ||
      message.peerId?.className ===
        "PeerUser"
    ) {
      const sender = await message.getSender();

      if (
        sender &&
        currentUser &&
        String(sender.id) ===
          String(currentUser.id)
      ) {
        return true;
      }
    }

    return false;

  } catch {
    return false;
  }
}

// ======================================================
// Group Detection
// ======================================================

function isGroupChat(chat) {
  if (!chat) return false;

  // Normal group
  if (
    chat.className === "Chat"
  ) {
    return true;
  }

  // Supergroup
  if (
    chat.className === "Channel" &&
    chat.megagroup === true
  ) {
    return true;
  }

  return false;
}

// ======================================================
// Parse Commands
// ======================================================

function parseCommand(text) {

  // ----------------------------------------------
  // Word off
  // ----------------------------------------------

  if (
    /^word\s+off$/i.test(text)
  ) {
    return {
      action: "off"
    };
  }

  // ----------------------------------------------
  // word=TEXT time=NUMBER on
  // word=TEXT time=NUMBER edit
  // ----------------------------------------------

  const match =
    text.match(
      /^word=(.+?)\s+time=(\d+(?:\.\d+)?)\s+(on|edit)$/i
    );

  if (!match) {
    return null;
  }

  const word =
    match[1].trim();

  const minutes =
    Number(match[2]);

  const action =
    match[3].toLowerCase();

  if (!word) {
    return null;
  }

  if (
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return null;
  }

  return {
    text: word,
    minutes,
    action
  };
}

// ======================================================
// Timer
// ======================================================

function startTimer(
  chatId,
  schedule
) {
  stopTimer(chatId);

  const interval =
    Number(schedule.intervalMs);

  if (
    !Number.isFinite(interval) ||
    interval <= 0
  ) {
    return;
  }

  const timer =
    setInterval(
      async () => {

        try {

          if (!client) {
            return;
          }

          if (!client.connected) {
            try {
              await client.connect();
            } catch {
              return;
            }
          }

          await client.sendMessage(
            Number(chatId),
            {
              message:
                schedule.text
            }
          );

          console.log(
            "Scheduled message sent:",
            chatId,
            schedule.text
          );

        } catch (error) {

          console.error(
            "Scheduled send error:",
            error
          );

        }

      },
      interval
    );

  timers.set(
    String(chatId),
    timer
  );

  console.log(
    `Timer started: ${chatId} / ${schedule.minutes} min`
  );
}

function stopTimer(chatId) {

  const key =
    String(chatId);

  const timer =
    timers.get(key);

  if (timer) {
    clearInterval(timer);
    timers.delete(key);
  }
}

// ======================================================
// Restore Schedules
// ======================================================

async function restoreSchedules() {

  const schedules =
    loadSchedules();

  for (
    const chatId of Object.keys(schedules)
  ) {

    const schedule =
      schedules[chatId];

    if (
      !schedule ||
      schedule.active !== true
    ) {
      continue;
    }

    // Ensure required fields
    if (
      !schedule.text ||
      !schedule.minutes
    ) {
      continue;
    }

    schedule.intervalMs =
      Number(schedule.minutes) *
      60 *
      1000;

    startTimer(
      chatId,
      schedule
    );
  }
}

// ======================================================
// List
// ======================================================

async function sendScheduleList() {

  if (!client) {
    return;
  }

  const schedules =
    loadSchedules();

  const active =
    Object.values(schedules)
      .filter(
        item =>
          item &&
          item.active === true
      );

  if (active.length === 0) {

    await client.sendMessage(
      "me",
      {
        message:
          "📋 هیچ زمان‌بندی فعالی وجود ندارد."
      }
    );

    return;
  }

  let output =
    "📋 زمان‌بندی‌های فعال\n\n";

  let index = 1;

  for (const schedule of active) {

    let link =
      schedule.link || "";

    // Try to get updated group information
    try {

      const entity =
        await client.getEntity(
          Number(schedule.chatId)
        );

      if (
        entity?.username
      ) {
        link =
          "https://t.me/" +
          entity.username;
      }

      if (
        entity?.title
      ) {
        schedule.title =
          entity.title;
      }

      setSchedule(
        schedule.chatId,
        schedule
      );

    } catch {}

    output +=
      `${index}. ${schedule.title || "گروه"}\n`;

    output +=
      `📝 متن: ${schedule.text}\n`;

    output +=
      `⏱ هر ${schedule.minutes} دقیقه\n`;

    output +=
      `🆔 ${schedule.chatId}\n`;

    if (link) {
      output +=
        `🔗 ${link}\n`;
    }

    output += "\n";

    index++;
  }

  await client.sendMessage(
    "me",
    {
      message: output.trim()
    }
  );
}

// ======================================================
// Stop All
// ======================================================

async function stopAllSchedules() {

  const schedules =
    loadSchedules();

  for (
    const chatId of Object.keys(schedules)
  ) {
    stopTimer(chatId);
  }

  localStorage.removeItem(
    STORAGE.schedules
  );
}

// ======================================================
// Activation Message
// ======================================================

async function sendActivationMessage() {

  try {

    await client.sendMessage(
      "me",
      {
        message:
`🟢 Userbot فعال شد.

دستورهای قابل استفاده:

📌 فعال کردن:
word=میو time=4 on

📌 تغییر:
word=هی time=2 edit

📌 توقف:
Word off

📌 مشاهده لیست:
.list

📌 توقف همه:
.stopall

⏱ زمان‌ها بر اساس دقیقه هستند.

⚠️ برای اجرای زمان‌بندی‌ها باید این صفحه و اتصال تلگرام فعال بماند.`
      }
    );

  } catch (error) {

    console.error(
      "Activation message error:",
      error
    );

  }
}

// ======================================================
// Logout
// ======================================================

async function logoutTelegram() {

  try {

    // Stop all timers
    for (
      const chatId of timers.keys()
    ) {
      stopTimer(chatId);
    }

    if (client) {

      try {
        await client.disconnect();
      } catch {}

      client = null;
    }

    currentUser = null;
    messageHandler = null;

    localStorage.removeItem(
      STORAGE.session
    );

    sessionInput.value = "";

    showLogin();

    setStatus(
      "از حساب خارج شدید.",
      "success"
    );

  } catch (error) {

    console.error(error);

    setStatus(
      "خطا هنگام خروج: " +
      error.message,
      "error"
    );
  }
}

// ======================================================
// Button Events
// ======================================================

if (loginBtn) {
  loginBtn.addEventListener(
    "click",
    loginTelegram
  );
}

if (logoutBtn) {
  logoutBtn.addEventListener(
    "click",
    logoutTelegram
  );
}

// ======================================================
// Initial
// ======================================================

loadSavedInputs();

console.log(
  "Telegram MTProto Userbot loaded."
);یر کرد.\n\n📝 ${command.word}\n⏱ هر ${command.minutes} دقیقه`
        }
      );

    }

  } catch (error) {

    console.error(
      "Handler error:",
      error
    );

  }

}


// ============================================================
// LOGIN
// ============================================================

async function login() {

  const apiId =
    Number(
      $("apiId").value.trim()
    );


  const apiHash =
    $("apiHash").value.trim();


  const phone =
    $("phone").value.trim();


  let sessionString =
    $("session").value.trim();


  if (
    !apiId ||
    !apiHash
  ) {

    setLoginStatus(
      "❌ API ID و API Hash را وارد کن."
    );

    return;

  }


  try {

    localStorage.setItem(
      STORAGE.API_ID,
      String(apiId)
    );

    localStorage.setItem(
      STORAGE.API_HASH,
      apiHash
    );

    localStorage.setItem(
      STORAGE.PHONE,
      phone
    );


    const stringSession =
      new StringSession(
        sessionString
      );


    client =
      new TelegramClient(
        stringSession,
        apiId,
        apiHash,
        {
          connectionRetries: 5
        }
      );


    setLoginStatus(
      "🔄 در حال اتصال..."
    );


    // ------------------------------------------------
    // SESSION موجود
    // ------------------------------------------------

    if (sessionString) {

      await client.connect();


    }

    // ------------------------------------------------
    // LOGIN جدید
    // ------------------------------------------------

    else {

      if (!phone) {

        setLoginStatus(
          "❌ شماره تلفن را وارد کن."
        );

        return;

      }


      await client.start({

        phoneNumber:
          async () => phone,


        phoneCode:
          async () => {

            const code =
              prompt(
                "کد ورود تلگرام را وارد کن:"
              );

            return code;

          },


        password:
          async () => {

            const password =
              prompt(
                "رمز Two-Step Verification را وارد کن:"
              );

            return password;

          },


        onError:
          (error) => {

            console.error(error);

          }

      });

    }


    // ------------------------------------------------
    // SAVE SESSION
    // ------------------------------------------------

    const savedSession =
      client.session.save();


    localStorage.setItem(
      STORAGE.SESSION,
      savedSession
    );


    $("session").value =
      savedSession;


    // ------------------------------------------------
    // GET ACCOUNT
    // ------------------------------------------------

    currentUser =
      await client.getMe();


    $("accountInfo").textContent =
      `✅ وارد شدید

👤 ${currentUser.firstName || ""} ${currentUser.lastName || ""}

🆔 ${currentUser.id}

@${currentUser.username || "بدون یوزرنیم"}`;


    // ------------------------------------------------
    // EVENT
    // ------------------------------------------------

    client.addEventHandler(
      handleMessage,
      new NewMessage({})
    );


    // ------------------------------------------------
    // START SAVED TIMERS
    // ------------------------------------------------

    const groups =
      getGroups();


    for (
      const [
        chatId,
        group
      ] of Object.entries(groups)
    ) {

      if (
        group &&
        group.enabled
      ) {

        startTimer(chatId);

      }

    }


    $("loginBox")
      .classList
      .add("hidden");


    $("botBox")
      .classList
      .remove("hidden");


    setLoginStatus(
      "✅ اتصال برقرار شد."
    );


    setRuntimeStatus(
      "🟢 Userbot فعال است و پیام‌ها را بررسی می‌کند."
    );


    // ------------------------------------------------
    // SAVED MESSAGE
    // ------------------------------------------------

    await sendActivationMessage();

  } catch (error) {

    console.error(error);


    setLoginStatus(
      "❌ خطا:\n" +
      (
        error?.message ||
        String(error)
      )
    );

  }

}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {

  try {

    if (client) {

      try {

        await client.disconnect();

      } catch {}

    }

  } finally {

    client = null;

    currentUser = null;


    timers.forEach(
      timer =>
        clearInterval(timer)
    );


    timers.clear();


    localStorage.removeItem(
      STORAGE.SESSION
    );


    localStorage.removeItem(
      STORAGE.GROUPS
    );


    $("session").value = "";

    $("botBox")
      .classList
      .add("hidden");


    $("loginBox")
      .classList
      .remove("hidden");


    setLoginStatus(
      "Session پاک شد."
    );

  }

}


// ============================================================
// AUTO LOAD
// ============================================================

function loadSaved() {

  $("apiId").value =
    localStorage.getItem(
      STORAGE.API_ID
    ) || "";


  $("apiHash").value =
    localStorage.getItem(
      STORAGE.API_HASH
    ) || "";


  $("phone").value =
    localStorage.getItem(
      STORAGE.PHONE
    ) || "";


  $("session").value =
    localStorage.getItem(
      STORAGE.SESSION
    ) || "";

}


// ============================================================
// EVENTS
// ============================================================

$("loginButton")
  .addEventListener(
    "click",
    login
  );


$("logoutButton")
  .addEventListener(
    "click",
    logout
  );


loadSaved();
