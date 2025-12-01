import express from 'express';
import session from 'express-session';
import Redis from "ioredis";
import RedisStore from "connect-redis";
import dotenv from "dotenv";
import fs from "fs";
import {
  generateBlogScheduleId,
  insertBlogSchedule,
  parseScheduleDate,
} from '../../component/blogScheduleRepository.js';
import { publishBlogPost } from '../../component/blogPublisher.js';

const router = express.Router();
const app = express();

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

// ブログ作成APIエンドポイント
router.post('/blog_create', async (req, res) => {
  if (!req.session) {
    console.error('Session object is not found.');
    return res.status(401).json({ error: 'Session object not found' });
  }

  // セッションIDを取得
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

    // 環境変数の読み取り
    const envFilePath = './.env';
    if (!fs.existsSync(envFilePath)) {
      console.error('.envファイルが存在しません。');
      return res.status(500).json({ error: '.envファイルが存在しません。' });
    }

    dotenv.config();
    console.log('.envファイルを認識しました。');

    const scheduleAtRaw = req.body.blog_schedule_at;
    const scheduleDate = parseScheduleDate(scheduleAtRaw);
    if (typeof scheduleAtRaw !== 'undefined' && scheduleAtRaw !== null && scheduleAtRaw !== '' && scheduleDate === null) {
      return res.status(400).json({ error: 'blog_schedule_at が不正です' });
    }
    const shouldSchedule = typeof scheduleAtRaw !== 'undefined' && scheduleDate !== null;

    if (shouldSchedule) {
      const scheduleEntry = await insertBlogSchedule(
        {
          blog_schedule_id: generateBlogScheduleId(),
          blog_id: req.body.blog_id || null,
          blog_tags: req.body.blog_tags ?? null,
          blog_text: req.body.blog_text ?? null,
          blog_thumbnail: req.body.blog_thumbnail ?? null,
          blog_title: req.body.blog_title ?? null,
          blog_schedule_at: scheduleDate,
          blog_fixedurl: req.body.blog_fixedurl ?? null,
          blog_file: req.body.blog_file ?? null,
          blog_attitude: req.body.blog_attitude ?? null,
        },
        parsedSession.username
      );

      return res.status(200).json({
        message: 'ブログを予約投稿として登録しました',
        blog_schedule_id: scheduleEntry.blog_schedule_id,
        scheduled_blog: scheduleEntry,
      });
    }

    const { blog: newBlog } = await publishBlogPost({
      blogTitle: req.body.blog_title,
      blogText: req.body.blog_text,
      blogFile: req.body.blog_file,
      blogTags: req.body.blog_tags,
      blogThumbnail: req.body.blog_thumbnail,
      blogFixedUrl: req.body.blog_fixedurl,
      blogAttitude: req.body.blog_attitude || 1,
      username: parsedSession.username,
      userId: parsedSession.username,
    });

    return res.status(200).json({ 
      message: 'ブログが正常に作成されました',
      blog_id: newBlog.blog_id, 
      created_blog: newBlog 
    });

  } catch (error) {
    console.error('Error while creating blog:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
