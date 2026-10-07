import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

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
// Telegram
// ======================================================

let client = null;
let currentUser = null;

// ======================================================
// Debug Logger
// ======================================================

function log(message, type = "info") {
  if (!statusEl) return;

  const time = new Date().toLocaleTimeString();

  statusEl.innerHTML =
    `<div style="
      margin-bottom:8px;
      padding:8px;
      border-radius:8px;
      background:#020617;
      color:${
        type === "error"
          ? "#f87171"
          : type === "success"
          ? "#4ade80"
          : "#38bdf8"
      };
    ">
      [${time}] ${escapeHtml(message)}
    </div>` +
    statusEl.innerHTML;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ======================================================
// Check Page
// ======================================================

console.log(
  "Telegram Userbot app.js loaded."
);

if (!loginBtn) {
  console.error(
    "loginBtn not found!"
  );
} else {
  console.log(
    "loginBtn found."
  );
}

// ======================================================
// Storage
// ======================================================

const STORAGE = {
  apiId: "tg_api_id",
  apiHash: "tg_api_hash",
  phone: "tg_phone",
  session: "tg_session"
};

function loadInputs() {
  try {
    if (apiIdInput) {
      apiIdInput.value =
        localStorage.getItem(
          STORAGE.apiId
        ) || "";
    }

    if (apiHashInput) {
      apiHashInput.value =
        localStorage.getItem(
          STORAGE.apiHash
        ) || "";
    }

    if (phoneInput) {
      phoneInput.value =
        localStorage.getItem(
          STORAGE.phone
        ) || "";
    }

    if (sessionInput) {
      sessionInput.value =
        localStorage.getItem(
          STORAGE.session
        ) || "";
    }

    log(
      "اطلاعات ذخیره‌شده خوانده شد."
    );

  } catch (error) {
    log(
      "خطا در خواندن اطلاعات: " +
        error.message,
      "error"
    );
  }
}

// ======================================================
// Save Inputs
// ======================================================

function saveInputs() {
  try {
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
// Login
// ======================================================

async function loginTelegram() {

  log(
    "دکمه ورود کلیک شد."
  );

  try {

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

    log(
      "اطلاعات ورود معتبر است.",
      "success"
    );

    // ==================================================
    // Session
    // ==================================================

    const savedSession =
      sessionInput?.value.trim() ||
      localStorage.getItem(
        STORAGE.session
      ) ||
      "";

    log(
      savedSession
        ? "Session قبلی پیدا شد."
        : "Session وجود ندارد؛ ورود جدید شروع می‌شود."
    );

    const session =
      new StringSession(
        savedSession
      );

    // ==================================================
    // Create Client
    // ==================================================

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

    log(
      "Telegram Client ساخته شد.",
      "success"
    );

    // ==================================================
    // Existing Session
    // ==================================================

    if (savedSession) {

      log(
        "در حال اتصال با Session..."
      );

      await client.connect();

      log(
        "اتصال با Session برقرار شد.",
        "success"
      );

    }

    // ==================================================
    // New Login
    // ==================================================

    else {

      log(
        "ورود جدید شروع شد."
      );

      await client.start({

        phoneNumber: async () => {

          log(
            "شماره تلفن درخواست شد."
          );

          return phone;
        },

        phoneCode: async () => {

          log(
            "کد ورود تلگرام را وارد کنید."
          );

          const code =
            prompt(
              "کد ورود تلگرام:"
            );

          if (!code) {
            throw new Error(
              "کد ورود وارد نشد."
            );
          }

          log(
            "کد ورود دریافت شد."
          );

          return code;
        },

        password: async () => {

          log(
            "رمز دو مرحله‌ای درخواست شد."
          );

          const password =
            prompt(
              "رمز دو مرحله‌ای تلگرام:"
            );

          if (!password) {
            throw new Error(
              "رمز دو مرحله‌ای وارد نشد."
            );
          }

          return password;
        },

        onError: (error) => {

          console.error(
            "Telegram login error:",
            error
          );

          log(
            "خطای Telegram: " +
              (error?.message ||
                String(error)),
            "error"
          );
        }

      });

      log(
        "ورود به تلگرام با موفقیت انجام شد.",
        "success"
      );
    }

    // ==================================================
    // Get User
    // ==================================================

    log(
      "در حال دریافت اطلاعات حساب..."
    );

    currentUser =
      await client.getMe();

    log(
      "حساب شناسایی شد: " +
        (
          currentUser.username
            ? "@" +
              currentUser.username
            : currentUser.firstName ||
              "کاربر"
        ),
      "success"
    );

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

    log(
      "Session String ساخته و ذخیره شد.",
      "success"
    );

    // ==================================================
    // Show Panel
    // ==================================================

    if (loginSection) {
      loginSection.style.display =
        "none";
    }

    if (botPanel) {
      botPanel.style.display =
        "block";
    }

    log(
      "ورود کامل شد.",
      "success"
    );

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    log(
      "❌ خطا: " +
        (
          error?.message ||
          String(error)
        ),
      "error"
    );

  }
}

// ======================================================
// Logout
// ======================================================

async function logoutTelegram() {

  try {

    log(
      "در حال خروج..."
    );

    if (client) {

      try {
        await client.disconnect();
      } catch {}

      client = null;
    }

    currentUser = null;

    localStorage.removeItem(
      STORAGE.session
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
      "از حساب خارج شدید.",
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
// Event Listeners
// ======================================================

if (loginBtn) {

  loginBtn.addEventListener(
    "click",
    async (event) => {

      event.preventDefault();

      await loginTelegram();

    }
  );

  log(
    "دکمه ورود آماده است.",
    "success"
  );

} else {

  console.error(
    "ERROR: loginBtn does not exist."
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
// Global Error Handler
// ======================================================

window.addEventListener(
  "error",
  (event) => {

    console.error(
      "GLOBAL ERROR:",
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
      "PROMISE ERROR:",
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
// Start
// ======================================================

loadInputs();

log(
  "Userbot آماده است."
);
