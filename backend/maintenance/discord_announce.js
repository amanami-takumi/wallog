/*
# 概要
このシステムに組み込まれているToDoリスト機能をDiscordと連携させるためのコードです。
Discordとの接続に関しては、/backend/component/discord.jsが担当します。
スケジューリングに関しては、maintenanceScheduler.jsが担当します。
データベースの構造に関しては、init.sqlを参照してください。
このコードは、データベースと接続してデータを実際に処理するために存在しています。

# 実装する内容
1. 関数が呼び出されると起動を知らせる投稿を行ないます
2. 関数が呼び出されるとtodoテーブルからデータを取得して12時間以内が期限の個別タスクをメンションします
3. 関数が呼び出されると24時間以内が期限のタスクリスト・72時間以内が期限のタスクリストをそれぞれ投稿します
4. 2.の投稿に対して○と×のリアクションを付けて、それが押された場合、完了に更新するupdate処理を実行します
5. 関数が呼び出されると、postテーブルの最新の投稿を取得して24時間以内に投稿が行なわれていなければ通知します
6. 関数が呼び出されると、blogテーブルの最新の投稿を取得して14日以内に投稿が行なわれていなければ通知します

# ドキュメント
JSDoc形式で、実装意図とコードの関係性などを記述していきます。

*/

/**
 * Discord通知コンポーネント
 * 
 * このモジュールは、ToDoリスト機能をDiscordと連携させ、以下の機能を提供します:
 * - 起動通知
 * - 期限が近いタスクの通知
 * - タスクリスト一覧の投稿
 * - リアクションによるタスク完了処理
 * - 投稿・ブログ更新の監視と通知
 * 
 * @module DiscordAnnounceComponent
 * @requires discord.js
 * @requires pg
 * @requires ../component/discord.js
 */

import pg from 'pg';
import { 
  initializeDiscordClient, 
  sendMessage, 
  sendEmbedMessage, 
  sendMention, 
  addReaction, 
  watchReactions 
} from '../component/discord.js';
import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// データベース接続設定
const pool = new pg.Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_NAME || 'postgres', // 'postgres'はDockerでのサービス名、localhost/127.0.0.1ではなく
  database: process.env.POSTGRES_DB || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: 5432,
});

// 接続テスト関数
const testDatabaseConnection = async () => {
  try {wallog
    const client = await pool.connect();
    console.log('データベース接続成功');
    client.release();
    return true;
  } catch (error) {
    console.error('データベース接続エラー:', error.message);
    return false;
  }
};

// リアクションハンドラー登録用の変数
let reactionHandlerRemover = null;
// タスクIDとメッセージIDのマッピング
const taskMessageMap = new Map();

/**
 * 起動通知を送信する関数
 * 
 * @async
 * @returns {Promise<void>}
 */
const sendStartupNotification = async () => {
  try {
    const currentTime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const embed = {
      title: '🤖 Discord通知システム起動',
      description: `通知システムが正常に起動しました。\n現在時刻: ${currentTime}`,
      color: 0x00ff00,
      footer: {
        text: 'Wallog自動通知システム'
      }
    };
    
    await sendEmbedMessage(embed);
    console.log('起動通知を送信しました');
  } catch (error) {
    console.error('起動通知の送信に失敗しました:', error);
  }
};

/**
 * 期限が近いタスクを取得する関数
 * 
 * @async
 * @param {number} hours - 何時間以内が期限のタスクを取得するか
 * @returns {Promise<Array>} タスクの配列
 */
const getUpcomingTasks = async (hours) => {
  let client;
  try {
    client = await pool.connect();
    const limitDate = new Date();
    limitDate.setHours(limitDate.getHours() + hours);
    
    const query = `
      SELECT * FROM "todo"
      WHERE todo_limitat <= $1
      AND todo_complete = false
      AND todo_attitude > 0
      ORDER BY todo_limitat ASC
    `;
    
    const result = await client.query(query, [limitDate.toISOString()]);
    return result.rows;
  } catch (error) {
    console.error(`${hours}時間以内のタスク取得に失敗しました:`, error);
    return [];
  } finally {
    if (client) client.release();
  }
};

/**
 * タスクを完了状態に更新する関数
 * 
 * @async
 * @param {string} todoId - タスクID
 * @returns {Promise<boolean>} 更新が成功したかどうか
 */
const markTaskAsComplete = async (todoId) => {
  let client;
  try {
    client = await pool.connect();
    const query = `
      UPDATE "todo"
      SET todo_complete = true, todo_updateat = CURRENT_TIMESTAMP
      WHERE todo_id = $1
      RETURNING *
    `;
    
    const result = await client.query(query, [todoId]);
    return result.rowCount > 0;
  } catch (error) {
    console.error(`タスク ${todoId} の完了状態更新に失敗しました:`, error);
    return false;
  } finally {
    if (client) client.release();
  }
};

/**
 * リアクションの監視を設定する関数
 * 
 * @async
 * @returns {Promise<void>}
 */
const setupReactionWatcher = async () => {
  // 既存のリアクションハンドラーを削除
  if (reactionHandlerRemover) {
    reactionHandlerRemover();
  }
  
  // 新しいリアクションハンドラーを設定
  reactionHandlerRemover = watchReactions(async (reaction, user) => {
    // ボットのリアクションは無視
    if (user.bot) return;
    
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;
    
    // この反応に関連するタスクを探す
    let targetTaskId = null;
    for (const [taskId, msgId] of taskMessageMap.entries()) {
      if (msgId === messageId) {
        targetTaskId = taskId;
        break;
      }
    }
    
    // 関連するタスクがない場合は終了
    if (!targetTaskId) return;
    
    // ○のリアクションの場合、タスクを完了に
    if (emoji === '⭕') {
      const success = await markTaskAsComplete(targetTaskId);
      if (success) {
        await reaction.message.reply(`✅ タスク「${targetTaskId}」を完了としてマークしました。`);
        taskMessageMap.delete(targetTaskId);
      }
    }
    // ×のリアクションの場合はスキップ（通知だけ）
    else if (emoji === '❌') {
      await reaction.message.reply(`⏩ タスク「${targetTaskId}」の通知をスキップしました。`);
      taskMessageMap.delete(targetTaskId);
    }
  });
};

/**
 * 12時間以内の期限タスクをメンション付きで通知する関数
 * 
 * @async
 * @returns {Promise<void>}
 */
const notifyUrgentTasks = async () => {
  try {
    const tasks = await getUpcomingTasks(12);
    
    if (tasks.length === 0) {
      console.log('12時間以内の期限タスクはありません');
      return;
    }
    
    console.log(`12時間以内の期限タスクが ${tasks.length} 件あります`);
    
    // 各タスクについて個別に通知
    for (const task of tasks) {
      const limitTime = new Date(task.todo_limitat).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const embed = {
        title: '⚠️ 期限が近いタスク',
        description: task.todo_text,
        color: 0xff9900,
        fields: [
          {
            name: '期限',
            value: limitTime,
            inline: true
          },
          {
            name: 'カテゴリ',
            value: task.todo_category || '未設定',
            inline: true
          },
          {
            name: 'タスクID',
            value: task.todo_id,
            inline: true
          }
        ],
        footer: {
          text: '⭕で完了、❌でスキップ'
        }
      };
      
      // メンションを送信
      const message = await sendMention('期限が近いタスクがあります！', process.env.DISCORD_TARGET_USER_ID);
      const embedMsg = await sendEmbedMessage(embed);
      
      // リアクションを追加
      await addReaction(embedMsg.id, '⭕');
      await addReaction(embedMsg.id, '❌');
      
      // タスクとメッセージIDのマッピングを保存
      taskMessageMap.set(task.todo_id, embedMsg.id);
    }
  } catch (error) {
    console.error('緊急タスク通知の送信に失敗しました:', error);
  }
};

/**
 * 期限タスクのリストを送信する関数
 * 
 * @async
 * @param {number} hours - 何時間以内が期限のタスクを取得するか
 * @returns {Promise<void>}
 */
const sendTasksList = async (hours) => {
  try {
    const tasks = await getUpcomingTasks(hours);
    
    if (tasks.length === 0) {
      console.log(`${hours}時間以内の期限タスクはありません`);
      return;
    }
    
    let description = '';
    for (let i = 0; i < Math.min(tasks.length, 15); i++) {
      const task = tasks[i];
      const limitTime = new Date(task.todo_limitat).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      description += `- ${limitTime} **${task.todo_text}** (${task.todo_category || '未設定'})\n`;
    }
    
    if (tasks.length > 15) {
      description += `\n...他 ${tasks.length - 15} 件のタスク`;
    }
    
    const embed = {
      title: `📋 ${hours}時間以内の期限タスク一覧`,
      description: description,
      color: hours <= 24 ? 0xff3300 : 0xffcc00,
      footer: {
        text: `${tasks.length}件のタスクが対象です`
      }
    };
    
    await sendEmbedMessage(embed);
    console.log(`${hours}時間以内の期限タスクリストを送信しました`);
  } catch (error) {
    console.error(`${hours}時間以内の期限タスクリストの送信に失敗しました:`, error);
  }
};

/**
 * 最新の投稿を確認し、更新されていない場合に通知する関数
 * 
 * @async
 * @returns {Promise<void>}
 */
const checkLatestPosts = async () => {
  let client;
  try {
    client = await pool.connect();
    // 最新の投稿を取得
    const postQuery = `
      SELECT * FROM "post"
      ORDER BY post_createat DESC
      LIMIT 1
    `;
    
    const postResult = await client.query(postQuery);
    
    if (postResult.rows.length > 0) {
      const latestPost = postResult.rows[0];
      const postDate = new Date(latestPost.post_createat);
      const now = new Date();
      
      // 24時間以上経過している場合
      const hoursSinceLastPost = (now - postDate) / (1000 * 60 * 60);
      
      if (hoursSinceLastPost > 24) {
        const daysSinceLastPost = Math.floor(hoursSinceLastPost / 24);
        
        const embed = {
          title: '📢 投稿の更新アラート',
          description: `最後の投稿から${daysSinceLastPost}日経過しています。新しい投稿を検討してみませんか？`,
          color: 0x3498db,
          fields: [
            {
              name: '最終投稿日時',
              value: postDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
              inline: true
            },
            {
              name: '経過時間',
              value: `約${Math.floor(hoursSinceLastPost)}時間`,
              inline: true
            }
          ],
          footer: {
            text: 'Wallog自動通知システム'
          }
        };
        
        await sendEmbedMessage(embed);
        console.log('投稿更新アラートを送信しました');
      }
    }
  } catch (error) {
    console.error('投稿確認中にエラーが発生しました:', error);
  } finally {
    if (client) client.release();
  }
};

/**
 * 最新のブログを確認し、更新されていない場合に通知する関数
 * 
 * @async
 * @returns {Promise<void>}
 */
const checkLatestBlogs = async () => {
  let client;
  try {
    client = await pool.connect();
    // 最新のブログを取得
    const blogQuery = `
      SELECT * FROM "blog"
      ORDER BY blog_createat DESC
      LIMIT 1
    `;
    
    const blogResult = await client.query(blogQuery);
    
    if (blogResult.rows.length > 0) {
      const latestBlog = blogResult.rows[0];
      const blogDate = new Date(latestBlog.blog_createat);
      const now = new Date();
      
      // 14日以上経過している場合
      const daysSinceLastBlog = (now - blogDate) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastBlog > 14) {
        const embed = {
          title: '📝 ブログ更新アラート',
          description: `最後のブログ投稿から${Math.floor(daysSinceLastBlog)}日経過しています。新しいブログ記事を検討してみませんか？`,
          color: 0x9b59b6,
          fields: [
            {
              name: '最終ブログ',
              value: latestBlog.blog_title,
              inline: false
            },
            {
              name: '投稿日時',
              value: blogDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
              inline: true
            },
            {
              name: '経過日数',
              value: `${Math.floor(daysSinceLastBlog)}日`,
              inline: true
            }
          ],
          footer: {
            text: 'Wallog自動通知システム'
          }
        };
        
        await sendEmbedMessage(embed);
        console.log('ブログ更新アラートを送信しました');
      }
    }
  } catch (error) {
    console.error('ブログ確認中にエラーが発生しました:', error);
  } finally {
    if (client) client.release();
  }
};

/**
 * Discord通知の実行メイン関数
 * 全ての通知機能を順次実行します
 * 
 * @async
 * @export
 * @returns {Promise<void>}
 */

export const runDiscordAnnounce = async () => {
  
    // 短い待機時間を設けて、各処理を順番に実行
    //await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 期限が近いタスクの通知(12時間以内)
    //await notifyUrgentTasks();
    //await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 24時間以内のタスクリスト
    //await sendTasksList(24);
    //await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 72時間以内のタスクリスト
    //await sendTasksList(72);
    //await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 投稿の確認
    //await checkLatestPosts();
    //await new Promise(resolve => setTimeout(resolve, 1000));
    
    // ブログの確認
    //await checkLatestBlogs();


};
export const runDiscordWakeupAnnounce = async () => {
  try {
    //console.log('Discord通知処理を開始します...');
    
    // Discord clientの初期化
    //wdiscord_announce.jsait initializeDiscordClient();
    
    // データベース接続テスト
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.error('データベースに接続できないため、処理を終了します');
      return;
    }
    
    // リアクションウォッチャーのセットアップ
    //await setupReactionWatcher();
    
    // 起動通知
    //await sendStartupNotification();
    
    //console.log('Discord通知処理が完了しました');
  } catch (error) {
    console.error('Discord通知実行中にエラーが発生しました:', error);
  }
};

/**
 * テスト実行用の関数
 * 開発環境でのテストに使用します
 */
if (process.env.NODE_ENV === 'development') {
  (async () => {
    try {
      await runDiscordAnnounce();
    } catch (error) {
      console.error('テスト実行中にエラーが発生しました:', error);
    } finally {
      // process.exit();
    }
  })();
}

export default {
  runDiscordAnnounce
};
