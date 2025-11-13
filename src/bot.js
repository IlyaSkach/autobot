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
    answer:
      "Мы специализируемся на подборе, покупке и доставке автомобилей под заказ из проверенных источников.",
  },
  {
    key: "order",
    question: "Как заказать автомобиль",
    answer:
      "Оставьте заявку в боте или свяжитесь с менеджером. Мы уточним требования, подберем авто и согласуем условия.",
  },
  {
    key: "payment",
    question: "Как производится оплата",
    answer:
      "Оплата проходит поэтапно: предоплата за подбор, далее — оплата автомобиля и услуг доставки по договору.",
  },
  {
    key: "warranty",
    question: "Какие гарантии",
    answer:
      "Мы заключаем официальный договор, предоставляем прозрачные фотографии и отчеты, а также сопровождаем сделку до передачи авто.",
  },
  {
    key: "delivery",
    question: "Доставка по России",
    answer:
      "Организуем доставку в любой регион России с привлечением проверенных логистических партнеров.",
  },
  {
    key: "commission",
    question: "Какая комиссия компании",
    answer:
      "Комиссия рассчитывается индивидуально и фиксируется в договоре. Обычно она зависит от стоимости автомобиля и набора услуг.",
  },
  {
    key: "documents",
    question: "Документы для оформления авто на таможне",
    answer:
      "Мы готовим полный пакет документов: договор, инвойс, транспортные документы и таможенную декларацию.",
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
    await ctx.reply("Введите марку и модель интересующего автомобиля:");
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
    await ctx.reply("Опишите ваш вопрос или сообщение для менеджера:");
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
  await ctx.reply(
    "Мы — компания, которая сопровождает полный цикл подбора, покупки, доставки и оформления автомобиля под заказ."
  );
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
