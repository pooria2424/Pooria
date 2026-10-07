import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";


// ============================================================
// STORAGE
// ============================================================

const STORAGE = {

  API_ID: "mtproto_api_id",

  API_HASH: "mtproto_api_hash",

  PHONE: "mtproto_phone",

  SESSION: "mtproto_session",

  GROUPS: "mtproto_groups"

};


// ============================================================
// GLOBALS
// ============================================================

let client = null;

let currentUser = null;

const timers = new Map();


// ============================================================
// HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}


function setLoginStatus(text) {

  $("loginStatus").textContent = text;

}


function setRuntimeStatus(text) {

  $("runtimeStatus").textContent = text;

}


function getGroups() {

  try {

    return JSON.parse(
      localStorage.getItem(STORAGE.GROUPS) || "{}"
    );

  } catch {

    return {};

  }

}


function saveGroups(groups) {

  localStorage.setItem(
    STORAGE.GROUPS,
    JSON.stringify(groups)
  );

}


function normalizeId(id) {

  return String(id);

}


// ============================================================
// COMMAND PARSER
// ============================================================

function parseCommand(text) {

  text = text.trim();


  // ------------------------------
  // OFF
  // ------------------------------

  if (
    /^word\s+off$/i.test(text)
  ) {

    return {
      type: "off"
    };

  }


  // ------------------------------
  // ON / EDIT
  // ------------------------------

  const match = text.match(
    /^word\s*=\s*(.*?)\s+time\s*=\s*(\d+(?:\.\d+)?)\s+(on|edit)$/i
  );


  if (!match) {

    return null;

  }


  const word = match[1].trim();

  const minutes = Number(match[2]);

  const type = match[3].toLowerCase();


  if (!word) {

    return null;

  }


  if (
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    minutes > 1440
  ) {

    return null;

  }


  return {

    type,

    word,

    minutes

  };

}


// ============================================================
// GROUP CHECK
// ============================================================

function isGroup(entity) {

  if (!entity) {

    return false;

  }


  if (
    entity.className === "Chat"
  ) {

    return true;

  }


  if (
    entity.className === "Channel" &&
    entity.megagroup === true
  ) {

    return true;

  }


  return false;

}


// ============================================================
// GROUP LINK
// ============================================================

function getGroupLink(entity, chatId) {

  if (
    entity &&
    entity.username
  ) {

    return (
      "https://t.me/" +
      entity.username
    );

  }


  const id = String(chatId);


  if (
    id.startsWith("-100")
  ) {

    return (
      "https://t.me/c/" +
      id.substring(4)
    );

  }


  return "لینک عمومی ندارد";

}


// ============================================================
// TIMER
// ============================================================

function stopTimer(chatId) {

  const key = normalizeId(chatId);

  const timer = timers.get(key);


  if (timer) {

    clearInterval(timer);

  }


  timers.delete(key);

}


// ============================================================

function startTimer(chatId) {

  const key = normalizeId(chatId);


  stopTimer(key);


  const groups = getGroups();

  const group = groups[key];


  if (
    !group ||
    !group.enabled
  ) {

    return;

  }


  const milliseconds =
    group.minutes * 60 * 1000;


  const timer = setInterval(
    async () => {

      try {

        await client.sendMessage(
          chatId,
          {
            message: group.word
          }
        );

      } catch (error) {

        console.error(
          "Send error:",
          error
        );

      }

    },
    milliseconds
  );


  timers.set(
    key,
    timer
  );

}


// ============================================================
// ACTIVATE
// ============================================================

async function activateGroup(
  chatId,
  word,
  minutes
) {

  const key = normalizeId(chatId);

  const groups = getGroups();


  let entity = null;


  try {

    entity =
      await client.getEntity(chatId);

  } catch {

    entity = null;

  }


  groups[key] = {

    enabled: true,

    word,

    minutes,

    title:
      entity?.title ||
      entity?.name ||
      "Unknown",

    username:
      entity?.username ||
      "",

    link:
      getGroupLink(
        entity,
        chatId
      ),

    updatedAt:
      Date.now()

  };


  saveGroups(groups);


  startTimer(chatId);

}


// ============================================================
// DEACTIVATE
// ============================================================

function deactivateGroup(chatId) {

  const key =
    normalizeId(chatId);


  const groups =
    getGroups();


  if (groups[key]) {

    groups[key].enabled =
      false;

    saveGroups(groups);

  }


  stopTimer(chatId);

}


// ============================================================
// LIST
// ============================================================

async function sendList() {

  const groups =
    getGroups();


  const active =
    Object.entries(groups)
      .filter(
        ([, value]) =>
          value &&
          value.enabled
      );


  if (!active.length) {

    await client.sendMessage(
      "me",
      {
        message:
          "📋 هیچ گروه فعالی وجود ندارد."
      }
    );

    return;

  }


  let output =
    "📋 لیست گروه‌های فعال\n\n";


  let number = 1;


  for (
    const [
      chatId,
      group
    ] of active
  ) {

    output +=
      `${number}. ${group.title}\n`;

    output +=
      `🔗 ${group.link}\n`;

    output +=
      `📝 متن: ${group.word}\n`;

    output +=
      `⏱ زمان: هر ${group.minutes} دقیقه\n`;

    output +=
      `🆔 ${chatId}\n\n`;


    number++;

  }


  await client.sendMessage(
    "me",
    {
      message: output
    }
  );

}


// ============================================================
// SAVE MESSAGE
// ============================================================

async function sendActivationMessage() {

  const text = `

✅ Userbot با موفقیت فعال شد.

━━━━━━━━━━━━━━

📚 آموزش استفاده

برای فعال کردن ارسال خودکار در یک گروه:

word=سلام time=4 on

یعنی:

هر ۴ دقیقه
کلمه «سلام» ارسال می‌شود.

━━━━━━━━━━━━━━

✏️ تغییر متن و زمان:

word=هی time=2 edit

از این به بعد هر ۲ دقیقه
«هی» ارسال می‌شود.

━━━━━━━━━━━━━━

🛑 خاموش کردن:

Word off

ارسال خودکار همان گروه متوقف می‌شود.

━━━━━━━━━━━━━━

📋 مشاهده گروه‌های فعال:

در Saved Messages بنویس:

.list

━━━━━━━━━━━━━━

⚠️ صفحه Userbot باید باز و متصل باشد.

`;


  await client.sendMessage(
    "me",
    {
      message: text
    }
  );

}


// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(event) {

  try {

    const message =
      event.message;


    if (!message) {

      return;

    }


    const text =
      message.message || "";


    if (!text) {

      return;

    }


    // ----------------------------------
    // Saved Messages .list
    // ----------------------------------

    if (
      message.isPrivate
    ) {

      try {

        const sender =
          await message.getSender();


        if (
          sender &&
          currentUser &&
          String(sender.id) ===
          String(currentUser.id) &&
          text.trim() === ".list"
        ) {

          await sendList();

          return;

        }

      } catch {}

    }


    // ----------------------------------
    // Group commands
    // ----------------------------------

    const chat =
      await message.getChat();


    if (!isGroup(chat)) {

      return;

    }


    // فقط دستورهایی که خود اکانت نوشته
    const sender =
      await message.getSender();


    if (
      !sender ||
      !currentUser ||
      String(sender.id) !==
      String(currentUser.id)
    ) {

      return;

    }


    const command =
      parseCommand(text);


    if (!command) {

      return;

    }


    const chatId =
      message.chatId;


    // ----------------------------------
    // OFF
    // ----------------------------------

    if (
      command.type === "off"
    ) {

      deactivateGroup(chatId);

      await client.sendMessage(
        chatId,
        {
          message:
            "🛑 ارسال خودکار در این گروه خاموش شد."
        }
      );

      return;

    }


    // ----------------------------------
    // ON
    // ----------------------------------

    if (
      command.type === "on"
    ) {

      await activateGroup(
        chatId,
        command.word,
        command.minutes
      );


      await client.sendMessage(
        chatId,
        {
          message:
            `✅ فعال شد.\n\n📝 ${command.word}\n⏱ هر ${command.minutes} دقیقه`
        }
      );


      return;

    }


    // ----------------------------------
    // EDIT
    // ----------------------------------

    if (
      command.type === "edit"
    ) {

      const groups =
        getGroups();


      const key =
        normalizeId(chatId);


      if (
        !groups[key] ||
        !groups[key].enabled
      ) {

        await client.sendMessage(
          chatId,
          {
            message:
              "⚠️ ابتدا Userbot را با دستور on فعال کن."
          }
        );

        return;

      }


      await activateGroup(
        chatId,
        command.word,
        command.minutes
      );


      await client.sendMessage(
        chatId,
        {
          message:
            `✏️ تنظیمات تغییر کرد.\n\n📝 ${command.word}\n⏱ هر ${command.minutes} دقیقه`
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
