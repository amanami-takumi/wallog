import pkg from 'pg';
const { Client } = pkg;
import { Client as ESClient } from '@elastic/elasticsearch';
import { markdownToHtml } from '../api/blog/blog_purse.js';
import { extractDescriptionFromHtml } from '../api/blog/blog_helper.js';
import { announceNewPost } from '../activitypub/services/delivery.js';

const esClient = new ESClient({
  node: `http://${process.env.ELASTICSEARCH_HOST}:${process.env.ELASTICSEARCH_PORT}`,
  auth: {
    username: process.env.ELASTICSEARCH_USER,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
});

function createDbClient() {
  return new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_NAME,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
  });
}

export function generateBlogId(now = new Date()) {
  const timestamp = now.getTime().toString();
  const randomDigits = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `bl_${timestamp}${randomDigits}`;
}

async function getOrCreateTagId(client, tag) {
  if (!tag) return null;
  const cleanedTag = tag.startsWith('#') ? tag.slice(1) : tag;
  const selectQuery = 'SELECT blog_tag_id FROM blog_tag WHERE blog_tag_id = $1';
  const selectResult = await client.query(selectQuery, [cleanedTag]);

  if (selectResult.rows.length > 0) {
    return selectResult.rows[0].blog_tag_id;
  }

  const insertQuery = `
    INSERT INTO blog_tag (blog_tag_id, blog_tag_text)
    VALUES ($1, $2)
    RETURNING blog_tag_id
  `;
  const insertResult = await client.query(insertQuery, [cleanedTag, cleanedTag]);
  return insertResult.rows[0].blog_tag_id;
}

function resolveTags(blogTags, blogText) {
  if (Array.isArray(blogTags)) {
    return blogTags;
  }
  if (typeof blogTags === 'string') {
    const trimmed = blogTags.trim();
    if (trimmed.length === 0) return [];
    // 既に#で始まる単語がスペース区切りで送られている想定
    return trimmed.split(/\s+/);
  }
  if (typeof blogText === 'string' && blogText.length > 0) {
    return blogText.match(/(?<=\s|^)#\S+(?=\s|$)/g) || [];
  }
  return [];
}

async function indexBlogToElasticsearch(blog) {
  if (!process.env.ELASTICSEARCH_INDEX2) {
    console.warn('ELASTICSEARCH_INDEX2 が設定されていません。インデックス処理をスキップします。');
    return;
  }

  await esClient.index({
    index: process.env.ELASTICSEARCH_INDEX2,
    id: blog.blog_id,
    body: {
      blog_id: blog.blog_id,
      blog_title: blog.blog_title,
      blog_text: blog.blog_text,
      blog_createat: blog.blog_createat || new Date().toISOString(),
      blog_tag: blog.blog_tag,
    },
  });
  console.log(`Elasticsearchにインデックス登録されたブログID: ${blog.blog_id}`);
}

async function distributePostViaActivityPub(blog, username) {
  if (process.env.ACTIVITYPUB_ENABLED !== 'true') {
    return;
  }

  try {
    console.log(`ActivityPubで投稿を配信: ${blog.blog_id}`);
    await announceNewPost(blog, username);
    console.log(`ActivityPub配信完了: ${blog.blog_id}`);
  } catch (error) {
    console.error('ActivityPub配信中にエラーが発生しました:', error);
  }
}

export async function publishBlogPost({
  blogId,
  blogTitle,
  blogText,
  blogFile,
  blogTags,
  blogThumbnail,
  blogFixedUrl,
  blogAttitude = 1,
  username,
  userId,
}) {
  const authorId = userId || username;
  if (!authorId) {
    throw new Error('userId or username is required to publish a blog post.');
  }

  const resolvedBlogId = blogId || generateBlogId();
  const tags = resolveTags(blogTags, blogText);

  const client = createDbClient();
  try {
    await client.connect();
    await client.query('BEGIN');

    const parsedText = markdownToHtml(blogText);
    const description = extractDescriptionFromHtml(parsedText);

    const insertBlogQuery = `
      INSERT INTO blog (
        blog_id, user_id, blog_title, blog_text, blog_pursed_text, blog_tag,
        blog_file, blog_thumbnail, blog_attitude, blog_fixedurl, blog_description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const blogValues = [
      resolvedBlogId,
      authorId,
      blogTitle,
      blogText,
      parsedText,
      tags.length > 0 ? tags.join(' ') : 'none_data',
      blogFile,
      blogThumbnail,
      blogAttitude,
      blogFixedUrl,
      description,
    ];

    const blogResult = await client.query(insertBlogQuery, blogValues);
    const newBlog = blogResult.rows[0];

    if (tags.length > 0) {
      const tagIds = [];
      for (const tag of tags) {
        const tagId = await getOrCreateTagId(client, tag);
        if (tagId) {
          tagIds.push(tagId);
        }
      }

      if (tagIds.length > 0) {
        const insertTagsQuery = `
          INSERT INTO blogs_blog_tags (blog_id, blog_tag_id)
          VALUES ${tagIds.map((_, idx) => `($1, $${idx + 2})`).join(', ')}
        `;
        await client.query(insertTagsQuery, [resolvedBlogId, ...tagIds]);
      }
    }

    await client.query('COMMIT');

    await indexBlogToElasticsearch(newBlog);
    await distributePostViaActivityPub(newBlog, authorId);

    return { blog: newBlog, tags };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

process.on('exit', async () => {
  try {
    await esClient.close();
    console.log('Elasticsearchクライアントが正常に終了しました。');
  } catch (err) {
    console.error('Elasticsearchクライアント終了処理中にエラーが発生しました:', err);
  }
});
