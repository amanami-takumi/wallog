import express from 'express';
import session from 'express-session';
import Redis from "ioredis";
import RedisStore from "connect-redis";
import pkg from 'pg';
const { Client } = pkg;
const router = express.Router();
const app = express();
import { markdownToHtml } from './blog_purse.js';
import { extractDescriptionFromHtml } from './blog_helper.js';
import {
  getBlogScheduleById,
  parseScheduleDate,
  updateBlogSchedule,
} from '../../component/blogScheduleRepository.js';

// Redisクライアント作成
const redis = new Redis({
  port: 6379,
  host: "redis",
});

// express-sessionの設定
router.use(
  session({
    store: new RedisStore({ client: redis }),
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 1440 * 60 * 1000,
      httpOnly: true,
      secure: false,
    },
    rolling: true,
  })
);

// ブログ投稿を更新する関数
async function updateBlog(blogId, blogData, userId) {
  const client = new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_NAME,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
  });

  try {
    await client.connect();
    await client.query('BEGIN');

    // まず、ブログの所有者を確認
    const checkOwnerQuery = 'SELECT user_id FROM blog WHERE blog_id = $1';
    const ownerResult = await client.query(checkOwnerQuery, [blogId]);

    if (ownerResult.rows.length === 0) {
      throw new Error('Blog not found');
    }
    if (ownerResult.rows[0].user_id !== userId) {
      throw new Error('Unauthorized to update this blog');
    }

    // ブログテキストをパース
    const parsedText = markdownToHtml(blogData.blog_text);
    const description = extractDescriptionFromHtml(parsedText);

    // ブログ記事の更新
    const updateQuery = `
      UPDATE blog 
      SET 
        blog_title = $1,
        blog_text = $2,
        blog_pursed_text = $3,
        blog_tag = $4,
        blog_updateat = CURRENT_TIMESTAMP,
        blog_file = $5,
        blog_thumbnail = $6,
        blog_attitude = $7,
        blog_fixedurl = $8,
        blog_description = $9
      WHERE blog_id = $10
      RETURNING *;
    `;

    const updateValues = [
      blogData.blog_title,
      blogData.blog_text,
      parsedText,
      blogData.blog_tag,
      blogData.blog_file,
      blogData.blog_thumbnail,
      blogData.blog_attitude || 1,
      blogData.blog_fixedurl,
      description,
      blogId
    ];

    const result = await client.query(updateQuery, updateValues);
    await client.query('COMMIT');
    return result.rows[0];

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

// ブログ更新エンドポイント - セッション認証を強化
router.put('/blog_update/:blogId', async (req, res) => {
  if (!req.session) {
    console.error('Session object is not found.');
    return res.status(401).json({ error: 'Session object not found' });
  }

  const sessionId = req.sessionID;
  console.log(`Session ID: ${sessionId}`);

  try {
    // Redisからセッション情報を取得
    const sessionData = await redis.get(`sess:${sessionId}`);

    if (!sessionData) {
      console.warn('No session data found in Redis for this session ID.');
      return res.status(401).json({ error: 'No session data found' });
    }

    // セッションデータをパースしてusernameを確認
    const parsedSession = JSON.parse(sessionData);

    if (!parsedSession.username) {
      console.warn('Session exists, but username is not set.');
      return res.status(401).json({ error: 'User not logged in' });
    }

    console.log(`Session check successful: username = ${parsedSession.username}`);

    const rawScheduleAt = req.body.blog_schedule_at;
    const hasScheduleInput =
      typeof rawScheduleAt !== 'undefined' &&
      rawScheduleAt !== null &&
      (`${rawScheduleAt}`).trim() !== '';

    if (hasScheduleInput) {
      const scheduleDate = parseScheduleDate(rawScheduleAt);
      if (!scheduleDate) {
        return res.status(400).json({ error: 'blog_schedule_at が不正です' });
      }

      const scheduleId = req.params.blogId;
      const existing = await getBlogScheduleById(scheduleId);

      if (!existing) {
        return res.status(404).json({ error: '予約投稿が見つかりません' });
      }

      const updatedSchedule = await updateBlogSchedule(
        scheduleId,
        {
          ...req.body,
          blog_schedule_at: scheduleDate,
        },
        parsedSession.username
      );

      return res.status(200).json({
        message: '予約投稿を更新しました',
        blog_schedule: updatedSchedule,
      });
    }

    const blogId = req.params.blogId;
    const updatedBlog = await updateBlog(blogId, req.body, parsedSession.username);
    
    res.status(200).json({
      message: 'Blog updated successfully',
      blog: updatedBlog
    });

  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(error.message.includes('Unauthorized') ? 403 : 500)
      .json({ error: error.message || 'Internal server error' });
  }
});

app.use('', router);

export default router;
