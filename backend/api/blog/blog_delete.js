import express from 'express';
import session from 'express-session';
import Redis from "ioredis";
import RedisStore from "connect-redis";
import dotenv from "dotenv";
import pkg from 'pg';
const { Client } = pkg;
import {
  deleteBlogSchedule,
  getBlogScheduleById,
  parseScheduleDate,
} from '../../component/blogScheduleRepository.js';

const router = express.Router();
const app = express();

// bodyParserの設定
app.use(express.json());

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

// ブログ削除関数
async function deleteBlog(blogId, userId) {
  const client = new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_NAME,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
  });

  try {
    await client.connect();
    
    // トランザクション開始
    await client.query('BEGIN');

    // ブログの所有者を確認
    const checkOwnerQuery = 'SELECT user_id FROM blog WHERE blog_id = $1';
    const ownerResult = await client.query(checkOwnerQuery, [blogId]);
    
    if (ownerResult.rows.length === 0) {
      throw new Error('Blog not found');
    }
    
    if (ownerResult.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    // blogs_blog_tags中間テーブルからの関連レコード削除
    await client.query('DELETE FROM blogs_blog_tags WHERE blog_id = $1', [blogId]);

    // ブログ本体の削除
    const deleteQuery = 'DELETE FROM blog WHERE blog_id = $1 RETURNING *';
    const result = await client.query(deleteQuery, [blogId]);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

// 削除APIエンドポイント
router.post('/blog_delete', async (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'Session object not found' });
  }

  try {
    const sessionData = await redis.get(`sess:${req.sessionID}`);
    if (!sessionData) {
      return res.status(401).json({ error: 'No session data found' });
    }

    const parsedSession = JSON.parse(sessionData);
    if (!parsedSession.username) {
      return res.status(401).json({ error: 'User not logged in' });
    }

    const rawScheduleAt = req.body.blog_schedule_at;
    const scheduleIdFromPayload = req.body.blog_schedule_id;
    const fileId = req.body.file_id;
    const looksLikeScheduleId =
      typeof fileId === 'string' && /^\d{14}$/.test(fileId);

    const hasScheduleIndicator =
      (typeof rawScheduleAt !== 'undefined' &&
        rawScheduleAt !== null &&
        (`${rawScheduleAt}`).trim() !== '') ||
      Boolean(scheduleIdFromPayload) ||
      looksLikeScheduleId;

    if (hasScheduleIndicator) {
      if (
        typeof rawScheduleAt !== 'undefined' &&
        rawScheduleAt !== null &&
        (`${rawScheduleAt}`).trim() !== ''
      ) {
        const parsedScheduleDate = parseScheduleDate(rawScheduleAt);
        if (!parsedScheduleDate) {
          return res.status(400).json({ error: 'blog_schedule_at が不正です' });
        }
      }

      const scheduleId = scheduleIdFromPayload || fileId;
      if (!scheduleId) {
        return res.status(400).json({ error: 'blog_schedule_id が必要です' });
      }

      const existingSchedule = await getBlogScheduleById(scheduleId);
      if (!existingSchedule) {
        return res.status(404).json({ error: '予約投稿が見つかりません' });
      }

      const deletedSchedule = await deleteBlogSchedule(scheduleId);
      return res.status(200).json({
        message: '予約投稿を削除しました',
        deleted_schedule: deletedSchedule,
      });
    }

    const blogId = fileId;
    if (!blogId) {
      return res.status(400).json({ error: 'file_id is required' });
    }
    
    try {
      const deletedBlog = await deleteBlog(blogId, parsedSession.username);
      res.status(200).json({ 
        message: 'Blog deleted successfully',
        deleted_blog: deletedBlog 
      });
    } catch (err) {
      if (err.message === 'Unauthorized') {
        res.status(403).json({ error: 'Not authorized to delete this blog' });
      } else if (err.message === 'Blog not found') {
        res.status(404).json({ error: 'Blog not found' });
      } else {
        res.status(500).json({ error: 'Error deleting blog' });
      }
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('', router);

export default router;
