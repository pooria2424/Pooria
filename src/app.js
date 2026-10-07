import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";

// ======================================================
// Global
// ======================================================

let client = null;
let session = null;

let apiId = null;
let apiHash = "";
let phoneNumber = "";

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
// Storage
// ======================================================

const STORAGE = {
  apiId: "tg_api_id",
  apiHash: "tg_api_hash",
  phone: "tg_phone",
  session: "tg_session",
  schedules: "tg_schedules"
};

// ======================================================
// Schedule Storage
// ======================================================

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
  } catch (error) {
    console.error("Load schedules error:", error);
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
// Inputs
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
// Chat Helpers
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

  // Normal Telegram group
  if (chat.className === "Chat") {
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
// Saved Messages Detection
// ======================================================

async function isSavedMessages(message) {
  try {
    const chat = await message.getChat();

    if (!chat || !currentUser) {
      return false;
    }

    return (
      String(chat.id) ===
      String(currentUser.id)
    );
  } catch (error) {
    console.error(
      "Saved Messages detection error:",
      error
    );

    return false;
  }
}

// ======================================================
// Telegram Login
// ======================================================

async function loginTelegram() {
  try {
    apiId = Number(
      apiIdInput?.value.trim()
    );

    apiHash =
      apiHashInput?.value.trim() || "";

    phoneNumber =
      phoneInput?.value.trim() || "";

    if (!apiId || !apiHash) {
      throw new Error(
        "API ID و API Hash را وارد کنید."
      );
    }

    saveInputs();

    const savedSession =
      sessionInput?.value.trim() ||
      localStorage.getItem(
        STORAGE.session
      ) ||
      "";

    session = new StringSession(
      savedSession
    );

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

    // ==================================================
    // Existing Session
    // ==================================================

    if (savedSession) {
      await client.connect();
    }

    // ==================================================
    // First Login
    // ==================================================

    else {
      if (!phoneNumber) {
        throw new Error(
          "شماره تلفن را وارد کنید."
        );
      }

      await client.start({
        phoneNumber: async () => {
          return phoneNumber;
        },

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

        onError: (error) => {
          console.error(
            "Telegram login error:",
            error
          );

          setStatus(
            "خطا در ورود: " +
              (error?.message ||
                String(error)),
            "error"
          );
        }
      });
    }

    // ==================================================
    // Connection Check
    // ==================================================

    if (!client.connected) {
      await client.connect();
    }

    // ==================================================
    // Get Current User
    // ==================================================

    currentUser =
      await client.getMe();

    // ==================================================
    // Save Session
    // ==================================================

    const newSession =
      client.session.save();

    localStorage.setItem(
      STORAGE.session,
      newSession
    );

    if (sessionInput) {
      sessionInput.value =
        newSession;
    }

    // ==================================================
    // UI
    // ==================================================

    const username =
      currentUser?.username
        ? "@" +
          currentUser.username
        : currentUser?.firstName ||
          "کاربر";

    setStatus(
      "وارد شدید: " + username,
      "success"
    );

    showPanel();

    // ==================================================
    // Message Listener
    // ==================================================

    await setupMessageListener();

    // ==================================================
    // Restore Timers
    // ==================================================

    await restoreSchedules();

    // ==================================================
    // Activation Message
    // ==================================================

    await sendActivationMessage();

  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    setStatus(
      "خطا: " +
        (error?.message ||
          String(error)),
      "error"
    );
  }
}

// ======================================================
// Message Listener
// ======================================================

async function setupMessageListener() {
  if (!client) {
    return;
  }

  // Remove old listener
  if (messageHandler) {
    try {
      client.removeEventHandler(
        messageHandler
      );
    } catch (error) {
      console.warn(
        "Could not remove old handler:",
        error
      );
    }
  }

  messageHandler = async (event) => {
    try {
      await handleIncomingMessage(
        event
      );
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

  console.log(
    "Telegram message listener started."
  );
}

// ======================================================
// Incoming Message
// ======================================================

async function handleIncomingMessage(
  event
) {
  if (!event || !event.message) {
    return;
  }

  const message =
    event.message;

  const rawText =
    message.message || "";

  const text =
    rawText.trim();

  if (!text) {
    return;
  }

  const chat =
    await message.getChat();

  if (!chat) {
    return;
  }

  // ====================================================
  // Saved Messages
  // ====================================================

  if (
    await isSavedMessages(message)
  ) {
    const command =
      text.toLowerCase();

    // .list
    if (command === ".list") {
      await sendScheduleList();
      return;
    }

    // .stopall
    if (command === ".stopall") {
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
  // Only Groups
  // ====================================================

  if (!isGroupChat(chat)) {
    return;
  }

  // ====================================================
  // Parse Command
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
      chatId: chatId,

      title: title,

      text: parsed.text,

      minutes: parsed.minutes,

      intervalMs:
        parsed.minutes *
        60 *
        1000,

      active: true,

      createdAt: Date.now()
    };

    // ==================================================
    // Group Link
    // ==================================================

    try {
      if (chat.username) {
        schedule.link =
          "https://t.me/" +
          chat.username;
      }
    } catch (error) {
      console.warn(
        "Could not get group link:",
        error
      );
    }

    // ==================================================
    // Save
    // ==================================================

    setSchedule(
      chatId,
      schedule
    );

    // ==================================================
    // Start Timer
    // ==================================================

    startTimer(
      chatId,
      schedule
    );

    // ==================================================
    // Confirmation
    // ==================================================

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
// Command Parser
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
    text: word,
    minutes: minutes,
    action: action
  };
}

// ======================================================
// Start Timer
// ======================================================

function startTimer(
  chatId,
  schedule
) {
  // Stop previous
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
      "Invalid timer interval:",
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

          // Reconnect if needed
          if (!client.connected) {
            try {
              await client.connect();
            } catch (error) {
              console.error(
                "Reconnect failed:",
                error
              );

              return;
            }
          }

          // Send message
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

// ======================================================
// Stop Timer
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
// Restore Saved Schedules
// ======================================================

async function restoreSchedules() {
  const schedules =
    loadSchedules();

  for (
    const chatId of
    Object.keys(schedules)
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
  }

  console.log(
    "Saved schedules restored."
  );
}

// ======================================================
// Schedule List
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

  // ====================================================
  // No Schedule
  // ====================================================

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

  // ====================================================
  // Build List
  // ====================================================

  let output =
    "📋 زمان‌بندی‌های فعال\n\n";

  let index = 1;

  for (
    const schedule of active
  ) {
    let link =
      schedule.link || "";

    // ==================================================
    // Refresh Group Info
    // ==================================================

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
        "Could not refresh group:",
        schedule.chatId,
        error
      );
    }

    // ==================================================
    // Add To Output
    // ==================================================

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

  // ====================================================
  // Send
  // ====================================================

  await client.sendMessage(
    "me",
    {
      message:
        output.trim()
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
    const chatId of
    Object.keys(schedules)
  ) {
    stopTimer(chatId);
  }

  localStorage.removeItem(
    STORAGE.schedules
  );

  console.log(
    "All schedules stopped."
  );
}

// ======================================================
// Activation Message
// ======================================================

async function sendActivationMessage() {
  if (!client) {
    return;
  }

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

    // --------------------------------------------------
    // Stop Timers
    // --------------------------------------------------

    for (
      const chatId of
      timers.keys()
    ) {
      stopTimer(chatId);
    }

    // --------------------------------------------------
    // Disconnect
    // --------------------------------------------------

    if (client) {
      try {
        await client.disconnect();
      } catch (error) {
        console.warn(
          "Disconnect error:",
          error
        );
      }

      client = null;
    }

    // --------------------------------------------------
    // Reset
    // --------------------------------------------------

    currentUser = null;
    messageHandler = null;

    localStorage.removeItem(
      STORAGE.session
    );

    if (sessionInput) {
      sessionInput.value = "";
    }

    showLogin();

    setStatus(
      "از حساب خارج شدید.",
      "success"
    );

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );

    setStatus(
      "خطا هنگام خروج: " +
        (error?.message ||
          String(error)),
      "error"
    );
  }
}

// ======================================================
// Buttons
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
);
