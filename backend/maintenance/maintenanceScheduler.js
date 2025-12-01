import schedule from 'node-schedule';
import { runSetup } from '../setup/setup.js';
import { runMaintenance } from '../setup/maintenance.js';
import { runMinioMaintenance } from '../setup/minio_maintenance.js';
import { generateAndSaveSitemap } from '../setup/sitemap_generator.js';
import { generateAndSaveRssFeeds } from '../setup/rss_generator.js';
import { runDiscordAnnounce, runDiscordWakeupAnnounce } from './discord_announce.js';
import { fetchDueBlogSchedules, deleteBlogSchedule } from '../component/blogScheduleRepository.js';
import { publishBlogPost } from '../component/blogPublisher.js';

/**
 * メンテナンス処理の重複実行を防ぐためのフラグ
 * 各処理が実行中かどうかを追跡する
 */
let isMaintenanceRunning = false;
let isSitemapGenerationRunning = false;
let isRssGenerationRunning = false;
let isDiscordAnnounceRunning = false;
let isBlogScheduleProcessing = false;

const resolveScheduleUsername = (schedule) => {
  return (
    schedule?.user_id ||
    schedule?.blog_user_id ||
    process.env.BLOG_DEFAULT_USER ||
    process.env.DEFAULT_BLOG_USER ||
    process.env.POST_DEFAULT_USER ||
    null
  );
};

const executeBlogSchedulePosting = async () => {
  if (isBlogScheduleProcessing) {
    console.log('Blog schedule processing already in progress, skipping...');
    return;
  }

  isBlogScheduleProcessing = true;
  console.log('Checking scheduled blogs...', new Date().toISOString());

  try {
    const dueSchedules = await fetchDueBlogSchedules(new Date());

    for (const scheduleEntry of dueSchedules) {
      const resolvedUserId = resolveScheduleUsername(scheduleEntry);
      if (!resolvedUserId) {
        console.error(
          `予約投稿のユーザーが特定できませんでした: schedule_id=${scheduleEntry.blog_schedule_id}`
        );
        continue;
      }
      const authorId = scheduleEntry?.user_id || resolvedUserId;

      try {
        const { blog } = await publishBlogPost({
          blogTitle: scheduleEntry.blog_title,
          blogText: scheduleEntry.blog_text,
          blogFile: scheduleEntry.blog_file,
          blogTags: scheduleEntry.blog_tags,
          blogThumbnail: scheduleEntry.blog_thumbnail,
          blogFixedUrl: scheduleEntry.blog_fixedurl,
          blogAttitude: scheduleEntry.blog_attitude || 1,
          username: authorId,
          userId: authorId,
        });

        await deleteBlogSchedule(scheduleEntry.blog_schedule_id);
        console.log(
          `予約投稿を公開しました: schedule_id=${scheduleEntry.blog_schedule_id}, blog_id=${blog.blog_id}`
        );
      } catch (error) {
        console.error(
          `予約投稿の処理中にエラーが発生しました: schedule_id=${scheduleEntry.blog_schedule_id}`,
          error
        );
      }
    }
  } catch (error) {
    console.error('予約投稿の取得中にエラーが発生しました:', error);
  } finally {
    isBlogScheduleProcessing = false;
  }
};

/**
 * システムメンテナンスジョブを実行する非同期関数
 * 
 * 以下の処理を順次実行する:
 * 1. システムセットアップ
 * 2. 一般的なメンテナンスタスク
 * 3. MinIOストレージのメンテナンス
 * 4. サイトマップの生成と保存
 * 5. RSSフィードの生成と保存
 * 
 * 重複実行を防ぐために実行フラグを使用し、エラーハンドリングを実装
 * 
 * @async
 * @returns {Promise<void>}
 */
const executeMaintenanceJobs = async () => {
  if (isMaintenanceRunning) {
    console.log('Maintenance already in progress, skipping...');
    return;
  }

  isMaintenanceRunning = true;
  console.log('Starting maintenance jobs...', new Date().toISOString());

  try {
    await runSetup();
    console.log('Setup completed');
    await new Promise(resolve => setTimeout(resolve, 1000));

    await runMaintenance();
    console.log('Maintenance completed');
    await new Promise(resolve => setTimeout(resolve, 1000));

    await runMinioMaintenance();
    console.log('MinIO maintenance completed');
    
    // サイトマップの更新もメインメンテナンスの一部として実行
    await generateAndSaveSitemap();
    console.log('Sitemap updated as part of maintenance');

    // RSSフィードの更新もメインメンテナンスの一部として実行
    await generateAndSaveRssFeeds();
    console.log('RSS feeds updated as part of maintenance');

    console.log('All maintenance jobs completed successfully', new Date().toISOString());
  } catch (error) {
    console.error('Error running maintenance jobs:', error);
  } finally {
    isMaintenanceRunning = false;
  }
};

/**
 * サイトマップを生成して保存する非同期関数
 * 
 * システムのコンテンツに基づいてサイトマップを生成し、
 * 検索エンジンの最適化（SEO）を促進する
 * 
 * 重複実行を防ぐために実行フラグを使用し、エラーハンドリングを実装
 * 
 * @async
 * @returns {Promise<void>}
 */
const executeSitemapGeneration = async () => {
  if (isSitemapGenerationRunning) {
    console.log('Sitemap generation already in progress, skipping...');
    return;
  }
  
  isSitemapGenerationRunning = true;
  console.log('Starting sitemap generation...', new Date().toISOString());
  
  try {
    await generateAndSaveSitemap();
    console.log('Sitemap generation completed', new Date().toISOString());
  } catch (error) {
    console.error('Error generating sitemap:', error);
  } finally {
    isSitemapGenerationRunning = false;
  }
};

/**
 * RSSフィードを生成して保存する非同期関数
 * 
 * システムのコンテンツに基づいてRSSフィードを生成し、
 * ユーザーが最新の更新を簡単に追跡できるようにする
 * 
 * 重複実行を防ぐために実行フラグを使用し、エラーハンドリングを実装
 * 
 * @async
 * @returns {Promise<void>}
 */
const executeRssGeneration = async () => {
  if (isRssGenerationRunning) {
    console.log('RSS generation already in progress, skipping...');
    return;
  }
  
  isRssGenerationRunning = true;
  console.log('Starting RSS generation...', new Date().toISOString());
  
  try {
    await generateAndSaveRssFeeds();
    console.log('RSS generation completed', new Date().toISOString());
  } catch (error) {
    console.error('Error generating RSS feeds:', error);
  } finally {
    isRssGenerationRunning = false;
  }
};

/**
 * Discord通知を実行する非同期関数
 * 
 * ToDoリストの期限が近いものをDiscordに通知し、
 * リアクションによる完了処理などを行う
 * 
 * 重複実行を防ぐために実行フラグを使用し、エラーハンドリングを実装
 * 
 * @async
 * @returns {Promise<void>}
 */

const executeDiscordAnnounce = async () => {
  if (isDiscordAnnounceRunning) {
    console.log('Discord announcement already in progress, skipping...');
    return;
  }
  
  isDiscordAnnounceRunning = true;
  console.log('Starting Discord announcement...', new Date().toISOString());
  
  try {
    await runDiscordAnnounce();
    console.log('Discord announcement completed', new Date().toISOString());
  } catch (error) {
    console.error('Error running Discord announcement:', error);
  } finally {
    isDiscordAnnounceRunning = false;
  }
}
const executeDiscordWakeupAnnounce = async () => {
  if (isDiscordAnnounceRunning) {
    console.log('Discord announcement already in progress, skipping...');
    return;
  }
  
  isDiscordAnnounceRunning = true;
  console.log('Starting Discord announcement...', new Date().toISOString());
  
  try {
    await runDiscordWakeupAnnounce();
    console.log('Discord Wakeup announcement completed', new Date().toISOString());
  } catch (error) {
    console.error('Error running Discord announcement:', error);
  } finally {
    isDiscordAnnounceRunning = false;
  }
};

/**
 * メンテナンススケジューラーを開始する関数
 * 
 * 以下のスケジュールでメンテナンスタスクを設定する:
 * - メインメンテナンス: 毎日午前3時
 * - サイトマップ生成: 毎時0分
 * - RSSフィード生成: 4時間ごと
 * - Discord通知: 毎日午前9時と午後6時
 * 
 * アプリケーション起動時に各タスクの初回実行も設定し、
 * グローバルなエラーハンドリングを構成する
 * 
 * @export
 * @returns {void}
 */
export function startMaintenanceScheduler() {
  console.log('Starting maintenance scheduler...');
  
  // 定期実行のスケジュール設定（毎日午前3時）
  const maintenanceJob = schedule.scheduleJob('0 3 * * *', executeMaintenanceJobs);
  console.log('Maintenance scheduled for 3 AM daily');
  
  // サイトマップ更新の定期実行（毎時0分）
  const sitemapJob = schedule.scheduleJob('0 * * * *', executeSitemapGeneration);
  console.log('Sitemap generation scheduled for every hour at 0 minutes');
  
  // RSS更新の定期実行（4時間ごと）
  const rssJob = schedule.scheduleJob('0 */4 * * *', executeRssGeneration);
  console.log('RSS generation scheduled for every 4 hours');

  // ブログ予約投稿のチェック（毎分）
  const blogScheduleJob = schedule.scheduleJob('* * * * *', executeBlogSchedulePosting);
  console.log('Blog schedule processing scheduled for every minute');
  
  // Discord通知の定期実行（毎日午前7時と午後6時）
  //const discordMorningJob = schedule.scheduleJob('0 7 * * *', executeDiscordAnnounce);
  //const discordEveningJob = schedule.scheduleJob('0 18 * * *', executeDiscordAnnounce);
  //console.log('Discord announcements scheduled for 9 AM and 6 PM daily');
  
  // 初回実行（5秒後）
  setTimeout(executeMaintenanceJobs, 5000);
  // サイトマップも初回実行（10秒後）
  setTimeout(executeSitemapGeneration, 10000);
  // RSSも初回実行（15秒後）
  setTimeout(executeRssGeneration, 15000);
  // Discord通知も初回実行（20秒後）
  setTimeout(executeDiscordWakeupAnnounce, 20000);
  // ブログ予約投稿の初回実行（25秒後）
  setTimeout(executeBlogSchedulePosting, 25000);

  // エラーハンドリング
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}
