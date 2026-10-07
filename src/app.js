import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";

// ======================================================
// GLOBAL
// ======================================================

let client = null;
let currentUser = null;
let messageHandler = null;

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
// STORAGE
// ======================================================

// API اطلاعات عمومی این تب‌ها می‌توانند مشترک باشند.
// Session و Schedule فقط مخصوص همان Tab هستند.

const STORAGE = {
  apiId: "tg_api_id",
  apiHash: "tg_api_hash",
  phone: "tg_phone",

  // SESSION STORAGE
  session: "tg_session",
  schedules: "tg_schedules"
};

// ======================================================
// DEBUG / STATUS
// ======================================================

function log(message, type = "info") {
  console.log("[USERBOT]", message);

  if (!statusEl) {
    return;
  }

  const color =
    type === "error"
      ? "#f87171"
      : type === "success"
      ? "#4ade80"
      : "#38bdf8";

  const time =
    new Date().toLocaleTimeString("fa-IR");

  const row =
    document.createElement("div");

  row.style.cssText = `
    margin-bottom:8px;
    padding:8px;
    border-radius:8px;
    background:#020617;
    color:${color};
    direction:rtl;
    text-align:right;
    font-size:13px;
  `;

  row.textContent =
    `[${time}] ${message}`;

  statusEl.prepend(row);
}

function clearStatus() {
  if (statusEl) {
    statusEl.innerHTML = "";
  }
}

// ======================================================
// SESSION / TAB INFO
// ======================================================

function getTabId() {
  let tabId =
    sessionStorage.getItem(
      "tg_tab_id"
    );

  if (!tabId) {
    tabId =
      crypto.randomUUID();

    sessionStorage.setItem(
      "tg_tab_id",
      tabId
    );
  }

  return tabId;
}

const TAB_ID = getTabId();

console.log(
  "[USERBOT] TAB ID:",
  TAB_ID
);

// ======================================================
// STORAGE FUNCTIONS
// ======================================================

function loadSchedules() {
  try {
    return JSON.parse(
      sessionStorage.getItem(
        STORAGE.schedules
      ) || "{}"
    );
  } catch (error) {
    console.error(
      "loadSchedules:",
      error
    );

    return {};
  }
}

function saveSchedules(data) {
  sessionStorage.setItem(
    STORAGE.schedules,
    JSON.stringify(data)
  );
}

function getSchedule(chatId) {
  const schedules =
    loadSchedules();

  return (
    schedules[String(chatId)] ||
    null
  );
}

function setSchedule(
  chatId,
  schedule
) {
  const schedules =
    loadSchedules();

  schedules[String(chatId)] = {
    ...schedule,
    chatId: String(chatId),
    updatedAt: Date.now()
  };

  saveSchedules(schedules);
}

function removeSchedule(chatId) {
  const schedules =
    loadSchedules();

  delete schedules[
    String(chatId)
  ];

  saveSchedules(schedules);
}

// ======================================================
// INPUT STORAGE
// ======================================================

function loadInputs() {
  try {

    // API ID
    if (apiIdInput) {

      apiIdInput.value =
        localStorage.getItem(
          STORAGE.apiId
        ) || "";
    }

    // API HASH
    if (apiHashInput) {

      apiHashInput.value =
        localStorage.getItem(
          STORAGE.apiHash
        ) || "";
    }

    // PHONE
    if (phoneInput) {

      phoneInput.value =
        localStorage.getItem(
          STORAGE.phone
        ) || "";
    }

    // SESSION
    // فقط Session همین تب
    if (sessionInput) {

      sessionInput.value =
        sessionStorage.getItem(
          STORAGE.session
        ) || "";
    }

  } catch (error) {

    log(
      "خطا در خواندن اطلاعات ذخیره‌شده: " +
        error.message,
      "error"
    );
  }
}

function saveInputs() {
  try {

    // این موارد بین تب‌ها قابل استفاده هستند

    localStorage.setItem(
      STORAGE.apiId,
      apiIdInput.value.trim()
    );

    localStorage.setItem(
      STORAGE.apiHash,
      apiHashInput.value.trim()
    );

    localStorage.setItem(
      STORAGE.phone,
      phoneInput.value.trim()
    );

  } catch (error) {

    log(
      "خطا در ذخیره اطلاعات: " +
        error.message,
      "error"
    );
  }
}

// ======================================================
// CHAT HELPERS
// ======================================================

function getChatTitle(chat) {

  if (!chat) {
    return "گروه";
  }

  return (
    chat.title ||
    chat.username ||
    chat.firstName ||
    "گروه"
  );
}

function isGroupChat(chat) {

  if (!chat) {
    return false;
  }

  // Normal groups
  if (
    chat.className === "Chat"
  ) {
    return true;
  }

  // Supergroups
  if (
    chat.className === "Channel" &&
    chat.megagroup === true
  ) {
    return true;
  }

  return false;
}

// ======================================================
// SAVED MESSAGES
// ======================================================

async function isSavedMessages(
  message
) {

  try {

    if (!currentUser) {
      return false;
    }

    const chat =
      await message.getChat();

    if (!chat) {
      return false;
    }

    const chatId =
      String(chat.id);

    const userId =
      String(currentUser.id);

    return (
      chatId === userId
    );

  } catch (error) {

    console.error(
      "Saved Messages detection:",
      error
    );

    return false;
  }
}

// ======================================================
// LOGIN
// ======================================================

async function loginTelegram() {

  clearStatus();

  log(
    "دکمه ورود کلیک شد."
  );

  try {

    // --------------------------------------------------
    // Validate fields
    // --------------------------------------------------

    if (!apiIdInput) {
      throw new Error(
        "فیلد API ID پیدا نشد."
      );
    }

    if (!apiHashInput) {
      throw new Error(
        "فیلد API Hash پیدا نشد."
      );
    }

    if (!phoneInput) {
      throw new Error(
        "فیلد شماره تلفن پیدا نشد."
      );
    }

    const apiId =
      Number(
        apiIdInput.value.trim()
      );

    const apiHash =
      apiHashInput.value.trim();

    const phone =
      phoneInput.value.trim();

    if (!apiId) {
      throw new Error(
        "API ID وارد نشده است."
      );
    }

    if (!apiHash) {
      throw new Error(
        "API Hash وارد نشده است."
      );
    }

    if (!phone) {
      throw new Error(
        "شماره تلفن وارد نشده است."
      );
    }

    saveInputs();

    // --------------------------------------------------
    // Session
    // --------------------------------------------------

    // فقط Session همین تب
    const savedSession =
      sessionInput?.value.trim() ||
      sessionStorage.getItem(
        STORAGE.session
      ) ||
      "";

    log(
      savedSession
        ? "Session همین تب پیدا شد."
        : "برای این تب Session وجود ندارد."
    );

    // --------------------------------------------------
    // Telegram Client
    // --------------------------------------------------

    const session =
      new StringSession(
        savedSession
      );

    log(
      "در حال ساخت Telegram Client..."
    );

    client =
      new TelegramClient(
        session,
        apiId,
        apiHash,
        {
          connectionRetries: 5
        }
      );

    // --------------------------------------------------
    // Existing Session
    // --------------------------------------------------

    if (savedSession) {

      log(
        "در حال اتصال با Session همین تب..."
      );

      await client.connect();

      log(
        "اتصال برقرار شد.",
        "success"
      );

    }

    // --------------------------------------------------
    // New Login
    // --------------------------------------------------

    else {

      log(
        "ورود جدید برای این تب شروع شد."
      );

      await client.start({

        phoneNumber:
          async () => {

            log(
              "شماره تلفن ارسال شد."
            );

            return phone;
          },

        phoneCode:
          async () => {

            const code =
              prompt(
                "کد ورود تلگرام را وارد کنید:"
              );

            if (!code) {

              throw new Error(
                "کد ورود وارد نشد."
              );
            }

            return code.trim();
          },

        password:
          async () => {

            const password =
              prompt(
                "رمز دو مرحله‌ای تلگرام را وارد کنید:"
              );

            if (!password) {

              throw new Error(
                "رمز دو مرحله‌ای وارد نشد."
              );
            }

            return password;
          },

        onError:
          (error) => {

            console.error(
              "Telegram login error:",
              error
            );

            log(
              "خطای ورود: " +
                (
                  error?.message ||
                  String(error)
                ),
              "error"
            );
          }
      });

      log(
        "ورود با موفقیت انجام شد.",
        "success"
      );
    }

    // --------------------------------------------------
    // Connection Check
    // --------------------------------------------------

    if (!client.connected) {

      await client.connect();
    }

    // --------------------------------------------------
    // Get User
    // --------------------------------------------------

    currentUser =
      await client.getMe();

    const username =
      currentUser.username
        ? "@" +
          currentUser.username
        : currentUser.firstName ||
          "کاربر";

    log(
      "حساب شناسایی شد: " +
        username,
      "success"
    );

    // --------------------------------------------------
    // Save Session
    // --------------------------------------------------

    const newSession =
      client.session.save();

    // مهم:
    // Session فقط در همین Tab ذخیره می‌شود
    sessionStorage.setItem(
      STORAGE.session,
      newSession
    );

    if (sessionInput) {

      sessionInput.value =
        newSession;
    }

    log(
      "Session این تب ذخیره شد.",
      "success"
    );

    // --------------------------------------------------
    // Setup Listener
    // --------------------------------------------------

    await setupMessageListener();

    // --------------------------------------------------
    // Restore Timers
    // --------------------------------------------------

    await restoreSchedules();

    // --------------------------------------------------
    // UI
    // --------------------------------------------------

    if (loginSection) {

      loginSection.style.display =
        "none";
    }

    if (botPanel) {

      botPanel.style.display =
        "block";
    }

    // --------------------------------------------------
    // Activation Message
    // --------------------------------------------------

    await sendActivationMessage();

    log(
      "🟢 Userbot کاملاً فعال شد.",
      "success"
    );

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    log(
      "❌ " +
        (
          error?.message ||
          String(error)
        ),
      "error"
    );
  }
}

// ======================================================
// MESSAGE LISTENER
// ======================================================

async function setupMessageListener() {

  if (!client) {

    throw new Error(
      "Telegram Client وجود ندارد."
    );
  }

  // Remove previous handler
  if (messageHandler) {

    try {

      client.removeEventHandler(
        messageHandler
      );

    } catch (error) {

      console.warn(
        "Old handler remove error:",
        error
      );
    }
  }

  // New handler
  messageHandler =
    async (event) => {

      try {

        await handleIncomingMessage(
          event
        );

      } catch (error) {

        console.error(
          "Message handler error:",
          error
        );

        log(
          "خطای Listener: " +
            error.message,
          "error"
        );
      }
    };

  client.addEventHandler(
    messageHandler,
    new NewMessage({})
  );

  log(
    "Listener تلگرام فعال شد.",
    "success"
  );
}

// ======================================================
// INCOMING MESSAGE
// ======================================================

async function handleIncomingMessage(
  event
) {

  if (
    !event ||
    !event.message
  ) {
    return;
  }

  const message =
    event.message;

  const text =
    (
      message.message ||
      ""
    ).trim();

  if (!text) {
    return;
  }

  console.log(
    "[USERBOT] MESSAGE:",
    text
  );

  const chat =
    await message.getChat();

  if (!chat) {
    return;
  }

  const chatTitle =
    getChatTitle(chat);

  console.log(
    "[USERBOT] CHAT:",
    chatTitle,
    chat.className
  );

  // ====================================================
  // SAVED MESSAGES
  // ====================================================

  if (
    await isSavedMessages(
      message
    )
  ) {

    console.log(
      "Saved Message:",
      text
    );

    // .list
    if (
      text.toLowerCase() ===
      ".list"
    ) {

      await sendScheduleList();

      return;
    }

    // .stopall
    if (
      text.toLowerCase() ===
      ".stopall"
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
  // GROUP
  // ====================================================

  if (
    !isGroupChat(chat)
  ) {
    return;
  }

  // ====================================================
  // PARSE COMMAND
  // ====================================================

  const parsed =
    parseCommand(text);

  if (!parsed) {
    return;
  }

  const chatId =
    String(chat.id);

  const title =
    getChatTitle(chat);

  // ====================================================
  // OFF
  // ====================================================

  if (
    parsed.action === "off"
  ) {

    stopTimer(chatId);

    removeSchedule(chatId);

    await client.sendMessage(
      chat,
      {
        message:
          "🛑 ارسال خودکار برای این گروه متوقف شد."
      }
    );

    log(
      `زمان‌بندی گروه "${title}" متوقف شد.`,
      "success"
    );

    return;
  }

  // ====================================================
  // ON / EDIT
  // ====================================================

  if (
    parsed.action === "on" ||
    parsed.action === "edit"
  ) {

    // Stop previous timer
    stopTimer(chatId);

    const schedule = {

      chatId,

      title,

      text:
        parsed.text,

      minutes:
        parsed.minutes,

      intervalMs:
        parsed.minutes *
        60 *
        1000,

      active: true,

      createdAt:
        Date.now()
    };

    // Group link
    try {

      if (
        chat.username
      ) {

        schedule.link =
          "https://t.me/" +
          chat.username;
      }

    } catch {}

    // Save
    setSchedule(
      chatId,
      schedule
    );

    // Start
    startTimer(
      chatId,
      schedule
    );

    // Confirmation
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

    log(
      `زمان‌بندی "${title}" فعال شد.`,
      "success"
    );

    return;
  }
}

// ======================================================
// COMMAND PARSER
// ======================================================

function parseCommand(text) {

  // ----------------------------------------------------
  // WORD OFF
  // ----------------------------------------------------

  if (
    /^word\s+off$/i.test(text)
  ) {

    return {
      action: "off"
    };
  }

  // ----------------------------------------------------
  // WORD=TEXT TIME=NUMBER ON/EDIT
  // ----------------------------------------------------

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

    text:
      word,

    minutes:
      minutes,

    action:
      action
  };
}

// ======================================================
// TIMER
// ======================================================

function startTimer(
  chatId,
  schedule
) {

  // Stop old timer
  stopTimer(chatId);

  const interval =
    Number(
      schedule.intervalMs
    );

  if (
    !Number.isFinite(interval) ||
    interval <= 0
  ) {

    console.error(
      "Invalid interval:",
      interval
    );

    return;
  }

  const timer =
    setInterval(
      async () => {

        try {

          if (!client) {
            return;
          }

          // Reconnect
          if (
            !client.connected
          ) {

            try {

              await client.connect();

            } catch (error) {

              console.error(
                "Reconnect error:",
                error
              );

              return;
            }
          }

          // Check schedule still exists
          const current =
            getSchedule(
              chatId
            );

          if (
            !current ||
            current.active !== true
          ) {

            stopTimer(chatId);

            return;
          }

          // Send
          await client.sendMessage(
            Number(chatId),
            {
              message:
                current.text
            }
          );

          console.log(
            "Scheduled message sent:",
            chatId,
            current.text
          );

        } catch (error) {

          console.error(
            "Timer send error:",
            error
          );

          log(
            "❌ خطا در ارسال زمان‌بندی: " +
              (
                error?.message ||
                String(error)
              ),
            "error"
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
    `Timer started: ${chatId}`
  );
}

// ======================================================
// STOP TIMER
// ======================================================

function stopTimer(chatId) {

  const key =
    String(chatId);

  const timer =
    timers.get(key);

  if (timer) {

    clearInterval(timer);

    timers.delete(key);

    console.log(
      "Timer stopped:",
      key
    );
  }
}

// ======================================================
// RESTORE SCHEDULES
// ======================================================

async function restoreSchedules() {

  const schedules =
    loadSchedules();

  const ids =
    Object.keys(
      schedules
    );

  if (
    ids.length === 0
  ) {

    log(
      "هیچ زمان‌بندی ذخیره‌شده‌ای برای این تب وجود ندارد."
    );

    return;
  }

  let restored = 0;

  for (
    const chatId of ids
  ) {

    const schedule =
      schedules[chatId];

    if (
      !schedule ||
      schedule.active !== true
    ) {
      continue;
    }

    if (
      !schedule.text ||
      !schedule.minutes
    ) {
      continue;
    }

    schedule.intervalMs =
      Number(
        schedule.minutes
      ) *
      60 *
      1000;

    startTimer(
      chatId,
      schedule
    );

    restored++;
  }

  log(
    `${restored} زمان‌بندی این تب بازیابی شد.`,
    "success"
  );
}

// ======================================================
// LIST
// ======================================================

async function sendScheduleList() {

  if (!client) {
    return;
  }

  const schedules =
    loadSchedules();

  const active =
    Object.values(
      schedules
    ).filter(
      (item) =>
        item &&
        item.active === true
    );

  // No schedules
  if (
    active.length === 0
  ) {

    await client.sendMessage(
      "me",
      {
        message:
          "📋 هیچ زمان‌بندی فعالی در این تب وجود ندارد."
      }
    );

    return;
  }

  let output =
    "📋 زمان‌بندی‌های فعال این تب\n\n";

  let index = 1;

  for (
    const schedule of active
  ) {

    let link =
      schedule.link || "";

    try {

      const entity =
        await client.getEntity(
          Number(
            schedule.chatId
          )
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

      schedule.link =
        link;

      setSchedule(
        schedule.chatId,
        schedule
      );

    } catch (error) {

      console.warn(
        "Entity refresh error:",
        error
      );
    }

    output +=
      `${index}. ${
        schedule.title ||
        "گروه"
      }\n`;

    output +=
      `📝 متن: ${
        schedule.text
      }\n`;

    output +=
      `⏱ هر ${
        schedule.minutes
      } دقیقه\n`;

    output +=
      `🆔 ${
        schedule.chatId
      }\n`;

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
      message:
        output.trim()
    }
  );
}

// ======================================================
// STOP ALL
// ======================================================

async function stopAllSchedules() {

  const schedules =
    loadSchedules();

  for (
    const chatId of
    Object.keys(schedules)
  ) {

    stopTimer(chatId);
  }

  // فقط زمان‌بندی همین تب
  sessionStorage.removeItem(
    STORAGE.schedules
  );

  log(
    "تمام زمان‌بندی‌های این تب متوقف شدند.",
    "success"
  );
}

// ======================================================
// ACTIVATION MESSAGE
// ======================================================

async function sendActivationMessage() {

  try {

    await client.sendMessage(
      "me",
      {
        message:
`🟢 Userbot فعال شد.

🆔 شناسه تب:
${TAB_ID}

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

⚠️ این تب Session مستقل خودش را دارد.
⚠️ برای اجرای Userbot باید صفحه باز و اتصال تلگرام فعال باشد.`
      }
    );

  } catch (error) {

    console.error(
      "Activation message error:",
      error
    );

    log(
      "خطا در ارسال پیام فعال‌سازی: " +
        (
          error?.message ||
          String(error)
        ),
      "error"
    );
  }
}

// ======================================================
// LOGOUT
// ======================================================

async function logoutTelegram() {

  try {

    // Stop timers
    for (
      const chatId of
      Array.from(
        timers.keys()
      )
    ) {

      stopTimer(chatId);
    }

    // Disconnect
    if (client) {

      try {

        await client.disconnect();

      } catch {}

      client = null;
    }

    currentUser = null;

    messageHandler = null;

    // فقط Session همین تب پاک می‌شود
    sessionStorage.removeItem(
      STORAGE.session
    );

    // فقط Schedule همین تب پاک می‌شود
    sessionStorage.removeItem(
      STORAGE.schedules
    );

    if (sessionInput) {

      sessionInput.value = "";
    }

    if (botPanel) {

      botPanel.style.display =
        "none";
    }

    if (loginSection) {

      loginSection.style.display =
        "block";
    }

    log(
      "از حساب این تب خارج شدید.",
      "success"
    );

  } catch (error) {

    log(
      "خطا هنگام خروج: " +
        error.message,
      "error"
    );
  }
}

// ======================================================
// BUTTON EVENTS
// ======================================================

if (loginBtn) {

  loginBtn.addEventListener(
    "click",
    async (event) => {

      event.preventDefault();

      await loginTelegram();
    }
  );

} else {

  console.error(
    "loginBtn not found!"
  );
}

if (logoutBtn) {

  logoutBtn.addEventListener(
    "click",
    async (event) => {

      event.preventDefault();

      await logoutTelegram();
    }
  );
}

// ======================================================
// GLOBAL ERRORS
// ======================================================

window.addEventListener(
  "error",
  (event) => {

    console.error(
      "Global JS Error:",
      event.error
    );

    log(
      "❌ خطای JavaScript: " +
        (
          event.message ||
          "Unknown error"
        ),
      "error"
    );
  }
);

window.addEventListener(
  "unhandledrejection",
  (event) => {

    console.error(
      "Unhandled Promise:",
      event.reason
    );

    log(
      "❌ خطای Promise: " +
        (
          event.reason?.message ||
          String(event.reason)
        ),
      "error"
    );
  }
);

// ======================================================
// INITIAL
// ======================================================

loadInputs();

log(
  "Userbot آماده است."
);

console.log(
  "Telegram MTProto Userbot loaded."
);

console.log(
  "Tab Session Mode: ENABLED"
);

console.log(
  "TAB ID:",
  TAB_ID
);
