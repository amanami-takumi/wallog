"use client";

import { Metadata } from 'next';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactDOMServer from 'react-dom/server';
import ReactDOM from 'react-dom/client';
import NotificationComponent from '@/components/Notification';
import { CodeBlock } from '@/components/CodeBlock';
import { InlineCodeBlock } from '@/components/InlineCodeBlock';
import { CodeBlockProvider } from '@/contexts/CodeBlockContext';

interface BlogPost {
  blog_id: string;
  blog_title: string;
  blog_text: string;
  blog_pursed_text: string;  // 追加
  blog_thumbnail: string;
  blog_createat: string;
  blog_updateat: string;
  blog_count: number;
  blog_file: string;
  blog_fixedurl: string;
  blog_description?: string;  // Optional description field
}

interface ErrorResponse {
  error: string;
  message: string;
  status: number;
}

const detectCodeLanguage = (code: string): string => {
  // Python の特徴的なパターン
  if (code.includes('print(') || 
      code.includes('def ') || 
      code.includes('import ') || 
      code.match(/:\s*$/m)) {
    console.log('コードパターン検出: Python');
    return 'python';
  }
  
  // JavaScript の特徴的なパターン
  if (code.includes('function ') || 
      code.includes('const ') || 
      code.includes('let ') || 
      code.includes('var ') ||
      code.includes('=>') ||
      code.includes('console.log(')) {
    console.log('コードパターン検出: JavaScript');
    return 'javascript';
  }

  if (code.includes('services:') || 
      code.includes('environment:') || 
      code.includes('volumes:') || 
      code.includes('ports:') ){
      console.log('コードパターン検出: Docker');
      return 'docker';
  }

  if (code.includes('sudo ') || 
      code.includes(' && ') ){
      console.log('コードパターン検出: bash');
      return 'bash';
    }
  
  console.log('コードパターン検出: 不明なため text として処理');
  return 'text';
};

// processCodeBlocks 関数を修正して見出し処理を追加
const processCodeBlocks = (htmlContent: string) => {
  if (typeof document === 'undefined') return htmlContent;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  const decodeHtmlEntities = (value: string) =>
    value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  // 見出し要素にIDを付与
  const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading) => {
    const text = heading.textContent || '';
    // 日本語を含む場合は全体をbase64エンコード
    if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text)) {
      const base64Text = Buffer.from(text).toString('base64');
      heading.id = `heading-${base64Text.substring(0, 64)}`;
    } else {
      // 英数字のみの場合は従来の処理
      const normalized = text.normalize('NFKD');
      const baseId = normalized
        .replace(/[^\w\s\-]/g, '')
        .replace(/[\s\u3000]+/g, '-')
        .replace(/[^\w\-]/g, '')
        .toLowerCase()
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      heading.id = baseId || `heading-${Buffer.from(text).toString('base64').substring(0, 64)}`;
    }
    heading.setAttribute('style', 'scroll-margin-top: 80px');
  });

  // 既存のコードブロック処理
  const codeBlocks = tempDiv.querySelectorAll('pre code');
  let blockCounter = 0;
  
  codeBlocks.forEach((block) => {
    const language = block.className;
    const decodedCode = decodeHtmlEntities(block.innerHTML);

    const container = document.createElement('div');
    const containerId = `code-block-${Date.now()}-${blockCounter++}`;
    container.setAttribute('data-code-block', 'true');
    container.setAttribute('data-code-block-id', containerId);
    container.setAttribute('data-code', decodedCode.trim());
    container.setAttribute('data-language', language);
    container.className = 'code-block-container';

    const preElement = block.parentElement;
    if (preElement?.parentElement) {
      preElement.parentElement.replaceChild(container, preElement);
    }
  });

  // インラインコード処理
  const inlineCodes = tempDiv.querySelectorAll('code');
  let inlineCounter = 0;

  inlineCodes.forEach((codeElement) => {
    if (codeElement.parentElement?.tagName.toLowerCase() === 'pre') {
      return;
    }

    const language = codeElement.className;
    const decodedCode = decodeHtmlEntities(codeElement.innerHTML);

    const container = document.createElement('span');
    const containerId = `inline-code-${Date.now()}-${inlineCounter++}`;
    container.setAttribute('data-inline-code', 'true');
    container.setAttribute('data-code-block-id', containerId);
    container.setAttribute('data-code', decodedCode);
    container.setAttribute('data-language', language);
    container.className = 'inline-code-container';
    container.style.display = 'inline';

    codeElement.parentElement?.replaceChild(container, codeElement);
  });

  return tempDiv.innerHTML;
};

// ������������定義に NotificationItem を追加
interface NotificationItem {
  id: string;
  message: string;
  action?: { label: string; onClick: () => void }; // 追加
}

// コードブロックのルートを管理するMapを追加
const codeBlockRoots = new Map();

// TableOfContentsItem インターフェースを追加
interface TableOfContentsItem {
  id: string;
  level: number;
  text: string;
}


export default function BlogDetail() {
  const params = useParams();
  const [blog, setBlog] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isEditPopupOpen, setIsEditPopupOpen] = useState(false);
  const [editData, setEditData] = useState<BlogPost | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toc, setToc] = useState<TableOfContentsItem[]>([]); // 目次の状態を追加

  const addNotification = useCallback((
    message: string,
    action?: { label: string; onClick: () => void },
    id?: string,
    autoDismiss: boolean = true
  ) => {
    const notificationId = id || Date.now().toString();
    setNotifications(prev => [...prev, { id: notificationId, message, action }]);
    
    if (autoDismiss) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(notification => notification.id !== notificationId));
      }, 5000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);
  
  const api = useMemo(() => axios.create({
    baseURL: 'https://wallog.seitendan.com',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Credentials': 'true'
    },
    withCredentials: true
  }), []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.get('/api/user/login_check');
        setIsLoggedIn(response.status === 200);
      } catch (err) {
        setIsLoggedIn(false);
      }
    };
    checkSession();
  }, [api]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditData(prev => prev ? { ...prev, [name]: value } : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData || !params.blog_id) return;

    try {
      const response = await fetch(`/api/blog/blog_update/${params.blog_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editData),
        credentials: 'include'
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Invalid content-type: ${contentType}. Response: ${text}`);
      }

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || '更新に失敗しました');
      
      // 更新成功後にブログデータを再取得
      const updatedBlogResponse = await fetch(`https://wallog.seitendan.com/api/blog/blog_read/${params.blog_id}`);
      const updatedBlogData = await updatedBlogResponse.json();
      if (updatedBlogResponse.ok) {
        setBlog(updatedBlogData);
      }
      
      setIsEditPopupOpen(false);
    } catch (error) {
      console.error('Error updating blog:', error);
    }
  };

  useEffect(() => {
    // Chrome拡張機能のエラーを抑制
    const suppressChromeError = () => {
      const originalOnError = window.onerror;
      window.onerror = (message, source, lineno, colno, error) => {
        if (typeof message === 'string' && message.includes('runtime.lastError')) {
          return true; // エラーを抑制
        } else if (typeof message === 'string' && (
          message.includes('Uncaught TypeError: Cannot read property \'then\' of undefined') ||
          message.includes('Internal React error: Expected static flag was missing')
        )) {
          return true; // エラーを抑制
        }
        return originalOnError ? originalOnError(message, source, lineno, colno, error) : false;
      };
    };

    suppressChromeError();
    
    const fetchBlog = async () => {
      if (!params.blog_id || Array.isArray(params.blog_id)) {
        setError('無効なブログIDです');
        setLoading(false);
        return;
      }

      // blog_idの形式チェック
      if (!params.blog_id.startsWith('bl_')) {
        setError('無効なブログID形式です');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`https://wallog.seitendan.com/api/blog/blog_read/${params.blog_id}`);
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Invalid content-type: ${contentType}. Response: ${text}`);
        }
        
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'ブログの取得に失敗しました');
        }
        
        setBlog(data);
        // ブログデータがロードされたらタイトルを更新
        document.title = `${data.blog_title} | Wallog`;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'ブログの取得に失敗しました';
        setError(errorMessage);
        console.error('Blog fetch error:', errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchBlog();
  }, [params.blog_id]);

  // generateId 関数を追加
  const generateId = useCallback((text: string): string => {
    if (!text) return '';
    
    // 日本語を含む場合は全体をbase64エンコード
    if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text)) {
      const base64Text = Buffer.from(text).toString('base64');
      return `heading-${base64Text.substring(0, 64)}`;
    }

    // 英数字のみの場合は従来の処理
    const normalized = text.normalize('NFKD');
    const baseId = normalized
      .replace(/[^\w\s\-]/g, '')
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^\w\-]/g, '')
      .toLowerCase()
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');

    return baseId || `heading-${Buffer.from(text).toString('base64').substring(0, 64)}`;
  }, []);

  // 目次を生成する関数を追加
  // generateToc 関数を修正
  const generateToc = useCallback((text: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const newToc: TableOfContentsItem[] = [];

    headings.forEach((heading) => {
      const text = heading.textContent || '';
      const level = parseInt(heading.tagName[1]);
      
      // 日本語を含む場合は全体をbase64エンコード
      let baseId;
      if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text)) {
        const base64Text = Buffer.from(text).toString('base64');
        baseId = `heading-${base64Text.substring(0, 64)}`;
      } else {
        // 英数字のみの場合は従来の処理
        const normalized = text.normalize('NFKD');
        baseId = normalized
          .replace(/[^\w\s\-]/g, '')
          .replace(/[\s\u3000]+/g, '-')
          .replace(/[^\w\-]/g, '')
          .toLowerCase()
          .replace(/--+/g, '-')
          .replace(/^-+|-+$/g, '');

        if (!baseId || baseId === '-') {
          const base64Text = Buffer.from(text).toString('base64');
          baseId = `heading-${base64Text.substring(0, 64)}`;
        }
      }

      newToc.push({ id: baseId, level, text });
    });
    
    setToc(newToc);
  }, []);

  // ブログデータ取得後に目次を生成
  // ブログデータ取得後の目次生成を修正
  useEffect(() => {
    if (blog?.blog_pursed_text) {
      generateToc(blog.blog_pursed_text);
    }
  }, [blog?.blog_pursed_text, generateToc]);

  // 目次クリック時のスクロール処理を追加
  const handleTocClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    if (!id) return;
    
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  // ポップアップを開く時に編集用データを初期化
  const handleEditClick = () => {
    setEditData(blog ? { ...blog } : null);
    setIsEditPopupOpen(true);
  };

  // blog_pursed_text の処理を最適化
  useEffect(() => {
    let isUnmounting = false;

    if (typeof window !== 'undefined' && blog?.blog_pursed_text) {
      const processedHtml = processCodeBlocks(blog.blog_pursed_text);
      
      // 状態更新後にコードブロックをレンダリング
      setBlog(prev => {
        if (prev) {
          const updatedBlog = { ...prev, blog_pursed_text: processedHtml };
          
          // DOM更新後にコードブロックを処理
          setTimeout(() => {
            if (isUnmounting) return;

            document.querySelectorAll('.code-block-container').forEach((container) => {
              const code = container.getAttribute('data-code') || '';
              const language = container.getAttribute('data-language') || '';
              const containerId = container.getAttribute('data-code-block-id');

              if (!containerId) return;

              if (container.childNodes.length === 0) {
                let root = codeBlockRoots.get(containerId);
                if (!root) {
                  root = ReactDOM.createRoot(container);
                  codeBlockRoots.set(containerId, root);
                }

                root.render(
                  <CodeBlockProvider>
                    <CodeBlock 
                      language={language} 
                      code={code}
                    />
                  </CodeBlockProvider>
                );
              }
            });
            document.querySelectorAll('.inline-code-container').forEach((container) => {
              const code = container.getAttribute('data-code') || '';
              const language = container.getAttribute('data-language') || '';
              const containerId = container.getAttribute('data-code-block-id');

              if (!containerId) return;

              if (container.childNodes.length === 0) {
                let root = codeBlockRoots.get(containerId);
                if (!root) {
                  root = ReactDOM.createRoot(container);
                  codeBlockRoots.set(containerId, root);
                }

                root.render(
                  <InlineCodeBlock 
                    language={language} 
                    code={code} 
                  />
                );
              }
            });
          }, 100); // DOMの更新を待つため少し遅延

          return updatedBlog;
        }
        return prev;
      });
    }

    return () => {
      isUnmounting = true;
      // アンマウント時のクリーンアップ
      requestAnimationFrame(() => {
        codeBlockRoots.forEach((root) => {
          try {
            root.unmount();
          } catch (error) {
            console.error('Error unmounting root:', error);
          }
        });
        codeBlockRoots.clear();
      });
    };
  }, [blog?.blog_pursed_text]);

  if (loading) return <div className="ml-48 p-4">Loading...</div>;
  if (error) return <div className="ml-48 p-4 text-red-500">{error}</div>;
  if (!blog) return <div className="ml-48 p-4">ブログが見つかりません</div>;

  return (
    <CodeBlockProvider>
      <div className="md:ml-48 lg:mr-48 relative min-h-screen flex">
        {/* 記事本文のコンテナ */}
        <article className="max-w-3xl mx-auto bg-white dark:bg-neutral-900 rounded-xl p-4 sm:p-6 md:p-8 shadow-lg w-full overflow-hidden">
          {blog?.blog_thumbnail && (
            <img
              src={blog.blog_thumbnail}
              alt={blog.blog_title}
              className="w-full h-96 object-cover mb-8 rounded-lg"
            />
          )}
          <h1 className="text-4xl font-bold mb-6 dark:text-white">{blog?.blog_title}</h1>
          <div className="flex justify-between items-center text-gray-600 dark:text-gray-400 mb-8">
            <div>
              <p>作成日: {blog && new Date(blog.blog_createat).toLocaleDateString()}</p>
              <p>更新日: {blog && new Date(blog.blog_updateat).toLocaleDateString()}</p>
            </div>
          </div>
          <hr className="border-2 border-gray-200 dark:border-gray-700 mb-8" />
          {toc.length > 0 && (
            <div className="lg:hidden mb-8">
              <h2 className="text-xl font-bold mb-4 dark:text-white">目次</h2>
              <nav className="space-y-2">
                {toc.map((item, index) => (
                  <a
                    key={index}
                    href={`#${item.id}`}
                    onClick={(e) => handleTocClick(e, item.id)}
                    className={`
                      block text-gray-600 dark:text-gray-400 hover:text-blue-500 
                      transition-colors duration-200 cursor-pointer
                      ${item.level === 1 ? 'ml-0' : `ml-${(item.level - 1) * 2}`}
                    `}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            </div>
          )}
          <div className="prose dark:prose-invert max-w-none mb-20 w-full overflow-hidden">
            <div 
              dangerouslySetInnerHTML={{ __html: blog?.blog_pursed_text || '' }}
              className="markdown-body w-full overflow-hidden 
                [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mt-6 [&>h1]:mb-4 [&>h1]:pb-3 [&>h1]:border-b [&>h1]:border-gray-200 dark:[&>h1]:border-gray-700
                [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mt-5 [&>h2]:mb-4 [&>h2]:pb-2 [&>h2]:border-b [&>h2]:border-gray-200 dark:[&>h2]:border-gray-700
                [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mt-4 [&>h3]:mb-3
                [&>ol]:list-decimal [&>ol]:pl-10 [&>ol]:my-4
                [&>ol>li]:my-2
                [&>ul]:list-disc [&>ul]:pl-10 [&>ul]:my-4
                [&>ul>li]:my-2
                [&>p]:min-h-[1.3em] [&>p:empty]:block [&>p]:mb-1 [&>p]:leading-relaxed
                [&>p:empty]:h-[1.3em]
                [&>blockquote]:border-l-4 [&>blockquote]:border-gray-300 dark:[&>blockquote]:border-gray-700
                [&>blockquote]:pl-4 [&>blockquote]:py-2 [&>blockquote]:my-4
                [&>blockquote]:bg-gray-200 dark:[&>blockquote]:bg-gray-800
                [&>blockquote]:italic
                [&>hr]:border-2
                [&>hr]:border-gray-200 dark:[&>hr]:border-gray-700 [&>hr]:my-8
                [&>a]:text-blue-500 [&>a]:underline hover:[&>a]:text-blue-700
                [&_a]:text-blue-500 [&_a]:underline hover:[&_a]:text-blue-700
                [&_.syntax-highlighter]:bg-[#1E1E1E] 
                [&_.syntax-highlighter]:rounded-lg 
                [&_.syntax-highlighter]:p-4 
                [&_.syntax-highlighter]:my-4 
                [&_.syntax-highlighter]:overflow-x-auto
                [&_.syntax-highlighter_pre]:m-0
                [&_.syntax-highlighter_code]:font-mono
                [&_.syntax-highlighter_code]:text-base
                [&_.code-block-wrapper]:my-4
                [&_.code-block-wrapper]:max-w-full
                [&_.code-block-wrapper]:overflow-x-auto
                [&_.code-block-wrapper]:w-full
                [&_.code-block-wrapper_pre]:!bg-[#1E1E1E]
                [&_.code-block-wrapper_pre]:max-w-full
                [&_.code-block-wrapper_pre]:overflow-x-auto
                [&_.code-block-wrapper_code]:!text-white
                [&_.code-block-wrapper_code]:!text-base
                [&_.code-block-wrapper_code]:break-words
                [&_.code-block-wrapper_code]:whitespace-pre-wrap
                [&_.code-block-wrapper_code]:word-break-keep-all
                [&_.code-block-wrapper_code]:overflow-wrap-anywhere
                dark:[&_.code-block-wrapper_pre]:!bg-[#1E1E1E]
                [&_.code-block-wrapper]:rounded-lg
                [&_.code-block-wrapper]:overflow-hidden
                [&_.code-block-wrapper_div]:!bg-[#1E1E1E]
                [&_.code-block-wrapper_div]:max-w-full
                [&_.code-block-wrapper_div]:overflow-x-auto"
              style={{ position: 'relative' }}
            />
          </div>
        </article>

        {/* 目次サイドバーを追加 */}
        <div className="hidden lg:block fixed right-0 top-0 bottom-0 w-48 bg-white dark:bg-neutral-900 shadow-lg border-l border-gray-200 dark:border-gray-700">
          <div className="sticky top-1/2 transform -translate-y-1/2 p-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
            <h2 className="text-xl font-bold mb-4 dark:text-white">目次</h2>
            <nav className="space-y-2">
              {toc.map((item, index) => (
                <a
                  key={index}
                  href={`#${item.id}`}
                  onClick={(e) => handleTocClick(e, item.id)}
                  className={`
                    block text-gray-600 dark:text-gray-400 hover:text-blue-500 
                    transition-colors duration-200 cursor-pointer
                    ${item.level === 1 ? 'ml-0' : `ml-${(item.level - 1) * 2}`}
                  `}
                >
                  {item.text}
                </a>
              ))}
            </nav>
          </div>
        </div>

        {isLoggedIn && (
          <a
            href={`/blog/blog_editer?id=${params.blog_id}`}
            className="fixed bottom-8 right-8 px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 shadow-lg text-center"
          >
            編集
          </a>
        )}

      </div>
    </CodeBlockProvider>
  );
}
