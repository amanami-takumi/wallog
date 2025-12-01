import express from 'express';
import session from 'express-session';
import cors from 'cors';
import http from 'http';
import post_wsRoute from './api/post/post_ws.js';
import fs from 'fs' ;
import dotenv from 'dotenv';
// ActivityPub機能をインポート
import * as activityPub from './activitypub/index.js';

const app = express();
const port = 5000;
const envFilePath = './.env';
const REACT_APP_SITE_DOMAIN = 'https://wallog.seiteidan.com'

// ActivityPub用のCORS設定
const corsOptions = {
  origin: function (origin, callback) {
    // フロントエンドのオリジンを許可
    if ([REACT_APP_SITE_DOMAIN, 'http://192.168.1.148:13001'].includes(origin) || !origin) {
      callback(null, true);
    } else {
      // ActivityPubリクエストの場合も許可
      const isActivityPubRequest = 
        origin && (
          // Accept ヘッダーに application/activity+json が含まれる場合
          // または、パスが ActivityPub 関連エンドポイントの場合
          origin.includes('.well-known') || 
          origin.includes('/users/') || 
          origin.includes('/inbox') || 
          origin.includes('/objects/')
        );
      
      if (isActivityPubRequest) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'User-Agent']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// bodyParserが必要な場合
app.use(express.json());

// ActivityPub用のレスポンスヘッダーミドルウェア
app.use((req, res, next) => {
    // ActivityPub関連のパスへのリクエストの場合、追加のヘッダーを設定
    if (req.path.includes('/objects/') || 
        req.path.includes('/users/') || 
        req.path.includes('/.well-known/') ||
        req.path.includes('/inbox')) {
        
        // Access-Control-Allow-Origin を設定
        res.setHeader('Access-Control-Allow-Origin', '*');
        // リクエストタイプがActivityPubの場合、適切なContent-Typeを設定
        if (req.headers.accept && 
            (req.headers.accept.includes('application/activity+json') || 
             req.headers.accept.includes('application/ld+json'))) {
            res.setHeader('Content-Type', 'application/activity+json; charset=utf-8');
        }
    }
    
    next();
});

// リクエストログミドルウェア
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ルートの定義
import fileCreateRoute from './api/drive/file_create.js';  // 変更: インポート名を変更
import fileListRoute from './api/drive/file_list.js';  // 変更: インポート名を変更
import fileReadRoute from './api/drive/file_read.js';  // 変更: インポート名を変更
import fileUpdateRoute from './api/drive/file_update.js';  // 変更: インポート名を変更
import fileDeleteRoute from './api/drive/file_delete.js';  // 変更: インポート名を変更
import post_createRoute from './api/post/post_create.js';
import post_deleteRoute from './api/post/post_delete.js';
import post_sseRoute from './api/post/post_sse.js';
import post_listRoute from './api/post/post_list.js';
import post_readRoute from './api/post/post_read.js';
import loginRoute from './api/user/login.js';
import logoutRoute from './api/user/logout.js';
import login_checkRoute from './api/user/login_check.js';
import user_readRoute from './api/user/user_read.js';
import user_updateRoute from './api/user/user_update.js';
import test1Route from './api/test/test1.js';
import test2Route from './api/test/test2.js';
import test3Route from './api/test/test3.js';
import test4Route from './api/test/test4.js';
import settings_readRoute from './api/settings/settings_read.js';
import settings_updateRoute from './api/settings/settings_update.js';
import settings_writeRoute from './api/settings/settings_write.js';
import sticky_note_createRoute from './api/sticky-note/sticky-note_create.js';
import sticky_note_readRoute from './api/sticky-note/sticky-note_read.js';
import sticky_note_updateRoute from './api/sticky-note/sticky-note_update.js';
import sticky_note_deleteRoute from './api/sticky-note/sticky-note_delete.js';
import blog_createRoute from './api/blog/blog_create.js';
import blog_readRoute from './api/blog/blog_read.js';
import blog_updateRoute from './api/blog/blog_update.js';
import blog_deleteRoute from './api/blog/blog_delete.js';
import blog_listRoute from './api/blog/blog_list.js';
import blog_scheduleListRoute from './api/blog/blog_schedule_list.js';
import hashtagRankRoute from './api/hashtag/hashtag_rank.js';
import sitecardGetRoute from './api/sitecard/sitecard_get.js'; // New: サイトカード取得ルート
import sitecardUpdateRoute from './api/sitecard/sitecard_update.js'; // New: サイトカード更新ルート
import { startMaintenanceScheduler } from './maintenance/maintenanceScheduler.js';
import logs_readRoute from './api/logs/logs_read.js';
import logs_createRoute from './api/logs/logs_create.js';
import all_search from './api/search/all_search.js';
import todo_createRoute from './api/todo/todo_create.js'; // New: TODO作成ルート追加
import todo_updateRoute from './api/todo/todo_update.js'; // New: TODO更新ルート追加
import todo_deleteRoute from './api/todo/todo_delete.js'; // New: TODO削除ルート追加
import todo_listRoute from './api/todo/todo_list.js'; // New: TODOリスト取得ルート追加

// blog2のtest
// スケジューラーを実際に起動
startMaintenanceScheduler();

// ファイルアップロードルートの設定（file_create.js を使用）
app.use('/api/drive', fileCreateRoute, fileListRoute, fileReadRoute, fileDeleteRoute, fileUpdateRoute);  // 変更: useメソッドを使用
app.use('/api/post', post_createRoute, post_deleteRoute, post_readRoute,  post_listRoute, post_sseRoute);
app.use('/api/user', loginRoute, logoutRoute, login_checkRoute, user_readRoute, user_updateRoute);
app.use('/api/test', test1Route, test2Route, test3Route, test4Route);
app.use('/api/settings', settings_readRoute, settings_updateRoute, settings_writeRoute);
app.use('/api/sticky_note', sticky_note_createRoute, sticky_note_readRoute, sticky_note_updateRoute, sticky_note_deleteRoute);
app.use('/api/blog', blog_createRoute, blog_readRoute, blog_updateRoute, blog_deleteRoute, blog_listRoute, blog_scheduleListRoute);
app.use('/api/hashtag', hashtagRankRoute); 
app.use('/api/logs', logs_readRoute, logs_createRoute);
app.use('/api/search', all_search);
app.use('/api/sitecard', sitecardGetRoute, sitecardUpdateRoute); // New: サイトカードAPIのルートを追加
app.use('/api/todo', todo_createRoute, todo_updateRoute, todo_deleteRoute, todo_listRoute); // TODOリスト取得ルートを追加

// ActivityPub関連のエンドポイントを初期化
if (process.env.ACTIVITYPUB_ENABLED === 'true') {
  console.log('ActivityPub機能を有効化しています...');
  activityPub.setup(app);
} else {
  console.log('ActivityPub機能は無効化されています');
}

// サイトマップへのアクセスを処理
app.get('/sitemap.xml', (req, res) => {
    // サイトマップファイルのパスを指定
    const sitemapPath = './public/sitemap/sitemap.xml';
    
    // ファイルが存在するか確認
    fs.access(sitemapPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] Sitemap file not found:`, err);
        return res.status(404).send('Sitemap not found');
      }
      
      // Content-Typeを設定してファイルを送信
      res.setHeader('Content-Type', 'application/xml');
      res.sendFile(sitemapPath, { root: process.cwd() });
    });
  });

// DiaryのRSSへのアクセスを処理
app.get('/diary/feed.xml', (req, res) => {
  // サイトマップファイルのパスを指定
  const sitemapPath = './public/rss/diary/feed.xml';
  
  // ファイルが存在するか確認
  fs.access(sitemapPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`[${new Date().toISOString()}] feed file not found:`, err);
      return res.status(404).send('diary_feed not found');
    }
    
    // Content-Typeを設定してファイルを送信
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(sitemapPath, { root: process.cwd() });
  });
});


// BlogのRSSへのアクセスを処理
app.get('/blog/feed.xml', (req, res) => {
  // サイトマップファイルのパスを指定
  const sitemapPath = './public/rss/blog/feed.xml';
  
  // ファイルが存在するか確認
  fs.access(sitemapPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`[${new Date().toISOString()}] feed file not found:`, err);
      return res.status(404).send('blog_feed not found');
    }
    
    // Content-Typeを設定してファイルを送信
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(sitemapPath, { root: process.cwd() });
  });
});

// robots.txtへのアクセスを処理
app.get('/robots.txt', (req, res) => {
    // robots.txtファイルのパスを指定
    const robotsPath = './public/robots/robots.txt';
    
    // ファイルが存在するか確認
    fs.access(robotsPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`[${new Date().toISOString()}] robots.txt file not found:`, err);
        return res.status(404).send('robots.txt not found');
      }
      
      // Content-Typeを設定してファイルを送信
      res.setHeader('Content-Type', 'text/plain');
      res.sendFile(robotsPath, { root: process.cwd() });
    });
});

// 404エラーハンドリング
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).send('404 Not Found');
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] Error:`, err);
    res.status(500).send('Internal Server Error');
});

const server = http.createServer(app);

// WebSocketサーバーを設定
post_wsRoute(server);

server.listen(port, () => {
    console.log(`Express app listening on port ${port}`);

    // サーバー起動後にスケジューラーを開始
});
