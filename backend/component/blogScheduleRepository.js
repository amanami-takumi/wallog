import pkg from 'pg';
const { Client } = pkg;

let blogScheduleColumnsCache = null;

function createClient() {
  return new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_NAME,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
  });
}

export function generateBlogScheduleId(now = new Date()) {
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const hh = now.getHours().toString().padStart(2, '0');
  const mi = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

export function parseScheduleDate(rawDate) {
  if (!rawDate && rawDate !== 0) return null;
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : rawDate;
  }
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(rawDate);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function serializeBlogTags(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function deserializeBlogTags(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return parsed;
  } catch (err) {
    return value;
  }
}

async function ensureBlogScheduleColumns(client) {
  if (blogScheduleColumnsCache) {
    return blogScheduleColumnsCache;
  }
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'blog_schedule'
    `
  );
  blogScheduleColumnsCache = result.rows.map((row) => row.column_name);
  return blogScheduleColumnsCache;
}

async function withClient(callback) {
  const client = createClient();
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end();
  }
}

function buildColumnAssignment(columns, payload, options = { includeId: false }) {
  const { includeId } = options;
  const assignments = [];
  const values = [];
  let index = 1;

  for (const [key, rawValue] of Object.entries(payload)) {
    if (!columns.includes(key)) continue;
    if (!includeId && key === 'blog_schedule_id') continue;

    let value = rawValue;
    if (key === 'blog_tags') {
      value = serializeBlogTags(rawValue);
    } else if (key === 'blog_schedule_at') {
      value = rawValue instanceof Date ? rawValue : parseScheduleDate(rawValue);
    }

    assignments.push({ key, placeholder: `$${index}` });
    values.push(value);
    index += 1;
  }

  return { assignments, values };
}

function normalizeRow(row) {
  if (!row) return row;
  const normalized = { ...row };
  if (Object.prototype.hasOwnProperty.call(normalized, 'blog_tags')) {
    normalized.blog_tags = deserializeBlogTags(normalized.blog_tags);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'blog_schedule_at')) {
    const value = normalized.blog_schedule_at;
    if (value instanceof Date) {
      normalized.blog_schedule_at = value.toISOString();
    } else if (typeof value === 'string') {
      const date = new Date(value);
      normalized.blog_schedule_at = isNaN(date.getTime()) ? value : date.toISOString();
    }
  }
  return normalized;
}

export async function insertBlogSchedule(payload, username) {
  return withClient(async (client) => {
    const columns = await ensureBlogScheduleColumns(client);
    const schedulePayload = {
      ...payload,
      blog_schedule_id: payload.blog_schedule_id || generateBlogScheduleId(),
    };

    if (columns.includes('user_id')) {
      schedulePayload.user_id = username;
    }

    const { assignments, values } = buildColumnAssignment(columns, schedulePayload, {
      includeId: true,
    });

    if (assignments.length === 0) {
      throw new Error('No valid columns found for blog_schedule insert.');
    }

    const columnList = assignments.map((entry) => entry.key).join(', ');
    const placeholderList = assignments.map((entry) => entry.placeholder).join(', ');
    const query = `
      INSERT INTO blog_schedule (${columnList})
      VALUES (${placeholderList})
      RETURNING *;
    `;

    const result = await client.query(query, values);
    return normalizeRow(result.rows[0]);
  });
}

export async function listBlogSchedules() {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM blog_schedule
        ORDER BY blog_schedule_at ASC, blog_schedule_id ASC;
      `
    );
    return result.rows.map(normalizeRow);
  });
}

export async function getBlogScheduleById(scheduleId) {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM blog_schedule
        WHERE blog_schedule_id = $1
        LIMIT 1;
      `,
      [scheduleId]
    );
    return normalizeRow(result.rows[0]);
  });
}

export async function updateBlogSchedule(scheduleId, payload, username) {
  return withClient(async (client) => {
    const columns = await ensureBlogScheduleColumns(client);
    const schedulePayload = { ...payload };

    if (columns.includes('user_id') && username) {
      schedulePayload.user_id = username;
    }

    const { assignments, values } = buildColumnAssignment(columns, schedulePayload, {
      includeId: false,
    });

    if (assignments.length === 0) {
      const current = await client.query(
        `
          SELECT *
          FROM blog_schedule
          WHERE blog_schedule_id = $1
          LIMIT 1;
        `,
        [scheduleId]
      );
      return normalizeRow(current.rows[0]);
    }

    const setClause = assignments.map((entry) => `${entry.key} = ${entry.placeholder}`).join(', ');
    const query = `
      UPDATE blog_schedule
      SET ${setClause}
      WHERE blog_schedule_id = $${assignments.length + 1}
      RETURNING *;
    `;

    const result = await client.query(query, [...values, scheduleId]);
    return normalizeRow(result.rows[0]);
  });
}

export async function deleteBlogSchedule(scheduleId) {
  return withClient(async (client) => {
    const result = await client.query(
      `
        DELETE FROM blog_schedule
        WHERE blog_schedule_id = $1
        RETURNING *;
      `,
      [scheduleId]
    );
    return normalizeRow(result.rows[0]);
  });
}

export async function fetchDueBlogSchedules(referenceDate = new Date()) {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT *
        FROM blog_schedule
        WHERE blog_schedule_at <= $1
        ORDER BY blog_schedule_at ASC, blog_schedule_id ASC;
      `,
      [referenceDate]
    );
    return result.rows.map(normalizeRow);
  });
}
