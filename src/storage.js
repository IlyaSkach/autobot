const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');

async function readArray(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content || '[]');
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(filePath, '[]', 'utf8');
      return [];
    }
    throw error;
  }
}

async function writeArray(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function appendRecord(fileName, record) {
  const list = await readArray(fileName);
  list.push(record);
  await writeArray(fileName, list);
}

async function saveRequest(data) {
  await appendRecord('requests.json', {
    ...data,
    createdAt: new Date().toISOString(),
  });
}

async function saveManagerMessage(data) {
  await appendRecord('messages.json', {
    ...data,
    createdAt: new Date().toISOString(),
  });
}

async function trackVisitor(user, extra = {}) {
  const list = await readArray('visitors.json');
  const index = list.findIndex((item) => item.telegramId === user.id);
  const now = new Date().toISOString();
  const payload = {
    telegramId: user.id,
    username: user.username ?? null,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    languageCode: user.language_code ?? null,
    ...extra,
  };

  if (index >= 0) {
    const existing = list[index];
    const updated = {
      ...existing,
      ...payload,
      firstSeen: existing.firstSeen,
      lastActive: now,
    };
    list[index] = updated;
    await writeArray('visitors.json', list);
    return { status: 'updated', record: updated };
  }

  const record = {
    ...payload,
    firstSeen: now,
    lastActive: now,
  };
  list.push(record);
  await writeArray('visitors.json', list);
  return { status: 'new', record };
}

module.exports = {
  saveRequest,
  saveManagerMessage,
  trackVisitor,
};

