import express from 'express';
import session from 'express-session';
import Redis from 'ioredis';
import RedisStore from 'connect-redis';
import { listBlogSchedules } from '../../component/blogScheduleRepository.js';

const router = express.Router();
const redis = new Redis({
  port: 6379,
  host: 'redis',
});

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

router.get('/blog_schedule_list', async (req, res) => {
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

    const schedules = await listBlogSchedules();
    return res.status(200).json({ blog_schedules: schedules });
  } catch (error) {
    console.error('Error fetching blog schedule list:', error);
    return res.status(500).json({ error: 'Failed to fetch blog schedules' });
  }
});

export default router;
