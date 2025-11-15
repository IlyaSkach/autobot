require("dotenv").config();

const { Telegraf, Scenes, session, Markup } = require("telegraf");
const { saveRequest, saveManagerMessage, trackVisitor } = require("./storage");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MANAGER_USERNAME = process.env.MANAGER_USERNAME;
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

if (!BOT_TOKEN) {
  console.error("Ошибка: переменная окружения BOT_TOKEN не задана.");
  process.exit(1);
}

const MENU = {
  request: "🚗 Заказать автомобиль",
  about: "ℹ️ О компании",
  faq: "❓ Вопросы и ответы",
  manager: "✉️ Написать менеджеру",
};

const CONTACT_OPTIONS = [
  { title: "Телефон", value: "phone" },
  { title: "What's App", value: "whatsapp" },
  { title: "Telegram", value: "telegram" },
];

const CONTACT_LABELS = CONTACT_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.title;
  return acc;
}, {});

const FAQ_ITEMS = [
  {
    key: "company",
    question: "Чем занимается компания",
    answer: [
      "Наша компания занимается импортом автомобилей из Японии, Кореи и Китая.",
      "",
      "✔️ Поставка новых и б/у автомобилей из Японии, включая санкционные модели.",
      "✔️ Поставка новых и б/у автомобилей из Южной Кореи, включая санкционные модели объемом свыше 2 литров.",
      "✔️ Поставка новых и б/у автомобилей из Китая.",
      "",
      "Несколько фактов о нас:",
      "🏎️ Подбор авто по индивидуальным параметрам.",
      "💸 Выгода от 300 000 рублей относительно рынка РФ.",
      "🛡 Срок 15–45 дней и гарантия прозрачной сделки.",
      "",
      "Наша цель — сделать покупку автомобиля простой, удобной и безопасной в любой точке мира, обеспечивая высокий уровень сервиса и индивидуальный подход.",
      "Доверьте покупку авто профессионалам и будьте спокойны на всех этапах сделки.",
    ].join("\n"),
  },
  {
    key: "order",
    question: "Как заказать автомобиль",
    answer: [
      "Заказ автомобиля проходит в несколько этапов:",
      "1️⃣ Заключаем договор с характеристиками и конечной стоимостью авто.",
      "2️⃣ Вносите депозит 100 000 или 150 000 ₽ на расчетный счет компании (зависит от стоимости авто, входит в конечную цену и полностью возвратен до покупки/бронирования).",
      "3️⃣ Менеджер ежедневно присылает варианты: аукционы Японии с фото и переводом листа, выездная диагностика по Корее, аналогичный подход по Китаю. После проверки состояния вы решаете, подходит ли вариант.",
      "4️⃣ После покупки оплачиваете инвойс (стоимость, страховку и доставку во Владивосток).",
      "5️⃣ По прибытию во Владивосток/Уссурийск оплачиваете пошлину и оформление (до 10 дней).",
      "6️⃣ Проходим лабораторию для получения ЭПТС и СБКТС.",
      "7️⃣ Авто едет на нашу стоянку и готовится к выдаче/отправке в ваш город.",
      "8️⃣ Оплачиваете комиссию компании и делитесь впечатлениями. Полный цикл занимает около 30 дней.",
    ].join("\n"),
  },
  {
    key: "payment",
    question: "Как производится оплата",
    answer: [
      "Оплата может проходить тремя способами:",
      "1️⃣ Предоплата и комиссия перечисляются на расчетный счет компании (работаем с физлицами, ООО и ИП).",
      "2️⃣ Инвойс (стоимость авто и доставка) оплачивается самостоятельно в банке.",
      "3️⃣ Пошлина оплачивается лично тем, на кого оформляется авто: в отделении банка или через приложение по реквизитам таможни.",
    ].join("\n"),
  },
  {
    key: "warranty",
    question: "Какие гарантии",
    answer: [
      "1️⃣ Заключение договора — характеристики и стоимость фиксируются документально, условия неизменны без вашего согласия.",
      "2️⃣ Прозрачность — все документы оформляются «в белую» на ваши ФИО.",
      "3️⃣ Самостоятельный выбор — аукционы Японии и предложения из Кореи/Китая доступны, без вашего одобрения ничего не покупаем.",
      "4️⃣ Возврат депозита — до покупки вернем всю сумму в течение 3 рабочих дней.",
      "5️⃣ Сохранность — авто приходит в том состоянии и комплектации, что на аукционе, весь путь застрахован.",
    ].join("\n"),
  },
  {
    key: "delivery",
    question: "Доставка по России",
    answer:
      "Доставляем авто от Камчатки до Калининграда и в страны СНГ, работаем только с проверенными транспортными компаниями. Авто страхуется на всём пути, при желании можете выбрать собственную ТК.",
  },
  {
    key: "commission",
    question: "Какая комиссия компании",
    answer: [
      "Комиссия за полный цикл сделки:",
      "🇯🇵 Япония:",
      "- 40 000 ₽ до 2 л (не санкц.).",
      "- 80 000 ₽ свыше 2 л (санкц.).",
      "🇰🇷 Корея:",
      "- 50 000 ₽ до 2 л (не санкц.).",
      "- 65 000 ₽ свыше 2 л (санкц.).",
      "🇨🇳 Китай:",
      "- 70 000 ₽ за б/у.",
      "- 100 000 ₽ за новые авто.",
      "*Для новых авто и машин дороже 5 000 000 ₽ — 10 000 000 ₽.",
      "Дополнительно можем обслужить авто, купить доп. оборудование, помочь с постановкой на учет, сделать русификацию или чип-тюнинг.",
    ].join("\n"),
  },
  {
    key: "documents",
    question: "Документы для оформления авто на таможне",
    answer: [
      "Понадобятся:",
      "1) Скан заверенной копии паспорта РФ с пропиской.",
      "2) Скан СНИЛС.",
      "3) Скан свидетельства ИНН.",
      "4) Контактный телефон (таможня может позвонить).",
      "5) Инвойс.",
      "6) Чек из банка об оплате автомобиля.",
      "7) Контракт.",
    ].join("\n"),
  },
];

const bot = new Telegraf(BOT_TOKEN);

function normalizeManagerUsername(username) {
  if (!username) {
    return null;
  }
  const trimmed = username.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function normalizeManagerChatId(chatId) {
  if (!chatId) {
    return null;
  }
  const trimmed = chatId.trim();
  if (!trimmed) {
    return null;
  }
  // Убираем возможный префикс @ и пробелы
  const sanitized = trimmed.replace(/^@+/, "");
  return sanitized;
}

function resolveManagerTarget() {
  const chatId = normalizeManagerChatId(MANAGER_CHAT_ID);
  if (chatId) {
    return chatId;
  }
  return normalizeManagerUsername(MANAGER_USERNAME);
}

async function notifyManager(message) {
  const target = resolveManagerTarget();
  if (!target) {
    return;
  }
  try {
    await bot.telegram.sendMessage(target, message);
  } catch (error) {
    console.error("Не удалось отправить уведомление менеджеру:", error);
  }
}

function formatUserReference(user) {
  if (!user) {
    return "неизвестный пользователь";
  }
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const username = user.username ? `@${user.username}` : null;
  if (fullName && username) {
    return `${fullName} (${username})`;
  }
  if (fullName) {
    return `${fullName} (ID: ${user.id})`;
  }
  if (username) {
    return `${username} (ID: ${user.id})`;
  }
  return `ID: ${user.id}`;
}

function mainMenu() {
  return Markup.keyboard([
    [MENU.request, MENU.about],
    [MENU.faq, MENU.manager],
  ])
    .resize()
    .oneTime(false);
}

function contactOptionsKeyboard() {
  return Markup.keyboard(CONTACT_OPTIONS.map((option) => option.title))
    .oneTime()
    .resize();
}

function validateBudget(input) {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > 0;
}

function validatePhone(input) {
  return /^[\d+\-\s()]{6,20}$/.test(input.trim());
}

function validateEmail(input) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

const requestWizard = new Scenes.WizardScene(
  "requestWizard",
  async (ctx) => {
    ctx.wizard.state.form = {
      userId: ctx.from?.id ?? null,
      username: ctx.from?.username ?? null,
    };
    await ctx.reply(
      "Введите марку и модель интересующего автомобиля:",
      Markup.removeKeyboard()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply(
        "Пожалуйста, отправьте текстовое сообщение с маркой и моделью."
      );
      return;
    }
    ctx.wizard.state.form.car = text;
    await ctx.reply("Укажите желаемый бюджет (например, 2 500 000 ₽):");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text || !validateBudget(text)) {
      await ctx.reply(
        "Пожалуйста, введите бюджет в свободной форме, например: 2 500 000 ₽"
      );
      return;
    }
    ctx.wizard.state.form.budget = text;
    await ctx.reply("В какой город нужно доставить автомобиль?");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply("Укажите, пожалуйста, город доставки.");
      return;
    }
    ctx.wizard.state.form.deliveryCity = text;
    await ctx.reply("Как вас зовут?");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply("Пожалуйста, укажите ваше имя.");
      return;
    }
    ctx.wizard.state.form.fullName = text;
    await ctx.reply("Оставьте номер телефона для связи:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text || !validatePhone(text)) {
      await ctx.reply(
        "Введите номер телефона (можно в международном формате, например +7 999 123-45-67)."
      );
      return;
    }
    ctx.wizard.state.form.phone = text;
    await ctx.reply("Укажите электронную почту:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text || !validateEmail(text)) {
      await ctx.reply(
        "Введите корректный адрес электронной почты (пример: name@example.com)."
      );
      return;
    }
    ctx.wizard.state.form.email = text;
    await ctx.reply(
      "Выберите предпочитаемую форму связи:",
      contactOptionsKeyboard()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply(
        "Пожалуйста, выберите один из вариантов: Телефон, What's App или Telegram."
      );
      return;
    }
    const selected = CONTACT_OPTIONS.find(
      (option) => option.title.toLowerCase() === text.toLowerCase()
    );
    if (!selected) {
      await ctx.reply(
        "Используйте кнопки на клавиатуре: Телефон, What's App или Telegram."
      );
      return;
    }

    ctx.wizard.state.form.preferredContact = selected.value;

    await saveRequest(ctx.wizard.state.form);
    await notifyManager(
      [
        "🔔 Новая заявка на автомобиль",
        `- Пользователь: ${formatUserReference(ctx.from)}`,
        `- Авто: ${ctx.wizard.state.form.car}`,
        `- Бюджет: ${ctx.wizard.state.form.budget}`,
        `- Город доставки: ${ctx.wizard.state.form.deliveryCity}`,
        `- Имя: ${ctx.wizard.state.form.fullName}`,
        `- Телефон: ${ctx.wizard.state.form.phone}`,
        `- Email: ${ctx.wizard.state.form.email}`,
        `- Связь: ${CONTACT_LABELS[ctx.wizard.state.form.preferredContact]}`,
      ].join("\n")
    );
    await ctx.reply(
      "Спасибо! Мы получили вашу заявку и свяжемся с вами в ближайшее время.",
      mainMenu()
    );
    return ctx.scene.leave();
  }
);

const managerWizard = new Scenes.WizardScene(
  "managerWizard",
  async (ctx) => {
    ctx.wizard.state.payload = {
      userId: ctx.from?.id ?? null,
      username: ctx.from?.username ?? null,
    };
    await ctx.reply(
      "Опишите ваш вопрос или сообщение для менеджера:",
      Markup.removeKeyboard()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply("Пожалуйста, отправьте текстовое сообщение.");
      return;
    }
    ctx.wizard.state.payload.message = text;
    await ctx.reply(
      "Выберите удобный способ обратной связи:",
      contactOptionsKeyboard()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply(
        "Используйте кнопки на клавиатуре: Телефон, What's App или Telegram."
      );
      return;
    }
    const selected = CONTACT_OPTIONS.find(
      (option) => option.title.toLowerCase() === text.toLowerCase()
    );
    if (!selected) {
      await ctx.reply(
        "Пожалуйста, выберите вариант из списка: Телефон, What's App или Telegram."
      );
      return;
    }
    ctx.wizard.state.payload.preferredContact = selected.value;

    await saveManagerMessage(ctx.wizard.state.payload);
    await notifyManager(
      [
        "✉️ Сообщение для менеджера",
        `- Пользователь: ${formatUserReference(ctx.from)}`,
        `- Сообщение: ${ctx.wizard.state.payload.message}`,
        `- Предпочтительный контакт: ${
          CONTACT_LABELS[ctx.wizard.state.payload.preferredContact]
        }`,
      ].join("\n")
    );
    await ctx.reply(
      "Спасибо! Мы передали ваше сообщение менеджеру. Он свяжется с вами как можно скорее.",
      mainMenu()
    );
    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage([requestWizard, managerWizard]);

bot.use(session());

bot.use(async (ctx, next) => {
  if (ctx.from) {
    const visitorInfo = await trackVisitor(ctx.from, {
      lastInteraction: new Date().toISOString(),
    });
    if (visitorInfo?.status === "new") {
      await notifyManager(
        [
          "👋 Новый посетитель бота",
          `- Пользователь: ${formatUserReference(ctx.from)}`,
          `- Язык интерфейса: ${ctx.from.language_code ?? "не указан"}`,
          `- Telegram ID: ${ctx.from.id}`,
        ].join("\n")
      );
    }
  }
  return next();
});

bot.use(stage.middleware());

bot.start(async (ctx) => {
  await ctx.reply(
    "Здравствуйте! Я помогу оформить заказ на автомобиль и отвечу на ваши вопросы.",
    mainMenu()
  );
});

bot.hears(MENU.request, async (ctx) => {
  await ctx.scene.enter("requestWizard");
});

bot.hears(MENU.about, async (ctx) => {
  const aboutText = [
    "Наша компания занимается импортом автомобилей из Японии, Кореи и Китая.",
    "",
    "✔️ Поставка новых и б/у автомобилей из Японии, в том числе санкционных моделей.",
    "✔️ Поставка новых и б/у автомобилей из Южной Кореи, включая санкционные модели объемом свыше 2 литров.",
    "✔️ Поставка новых и б/у автомобилей из Китая.",
    "",
    "Несколько фактов:",
    "🏎️ Подбор авто по индивидуальным параметрам.",
    "💸 Выгода от 300 000 ₽ относительно рынка РФ.",
    "🛡 Срок 15–45 дней, гарантия прозрачной сделки.",
    "",
    "Наша цель — сделать покупку автомобиля простой, удобной и безопасной в любой точке мира, обеспечивая высокий уровень сервиса и индивидуальный подход.",
    "Доверьте покупку авто профессионалам и будьте спокойны на всех этапах сделки.",
  ].join("\n");
  await ctx.reply(aboutText);
});

bot.hears(MENU.faq, async (ctx) => {
  await ctx.reply(
    "Выберите интересующий вопрос:",
    Markup.inlineKeyboard(
      FAQ_ITEMS.map((item) => [
        Markup.button.callback(item.question, `faq:${item.key}`),
      ])
    )
  );
});

bot.action(/^faq:(.+)$/, async (ctx) => {
  const key = ctx.match[1];
  const item = FAQ_ITEMS.find((faqItem) => faqItem.key === key);
  if (item) {
    await ctx.answerCbQuery();
    await ctx.reply(`${item.question}:\n\n${item.answer}`);
  } else {
    await ctx.answerCbQuery("Ответ не найден", { show_alert: true });
  }
});

bot.hears(MENU.manager, async (ctx) => {
  await ctx.scene.enter("managerWizard");
});

bot.on("message", async (ctx) => {
  // Если сообщение не обработано сценой или командами, подскажем про меню.
  if (!ctx.scene?.current) {
    await ctx.reply("Выберите действие из меню ниже.", mainMenu());
  }
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
