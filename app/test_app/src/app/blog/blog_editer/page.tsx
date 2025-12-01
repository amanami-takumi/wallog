'use client';
import React, { useState, useEffect, useMemo } from 'react';
import EditorToolbar, { MarkdownSyntax } from './components/EditorToolbar';
import EditorTextarea from './components/EditorTextarea';
import BlogSelector from './components/BlogSelector';
import TagSelector from './components/TagSelector';
import ImageUploader from './components/ImageUploader';
import HistoryViewer from './components/HistoryViewer';
import MarkdownPreview from './components/MarkdownPreview';
import EditorSettings from './components/EditorSettings';
import { useEditor } from './context/EditorContext';
import useEditorHistory from './hooks/useEditorHistory';
import styles from './BlogEditor.module.css';
import ScheduleModal from './components/ScheduleModal';
import { BlogFormData, BlogScheduleItem } from './types';

/**
 * ブログエディターページコンポーネント
 * 
 * マークダウン記法をサポートした高機能ブログエディター
 */
export default function BlogEditorPage() {
  // エディター設定の取得
  const { settings } = useEditor();
  
  // 基本データ
  const [blogData, setBlogData] = useState<BlogFormData>({
    blog_id: '',
    blog_title: '',
    blog_text: '',
    blog_thumbnail: '',
    blog_tags: [],
    blog_schedule_at: '',
  });
  
  // UI状態
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [isScheduleMode, setIsScheduleMode] = useState(false);
  
  const formattedSchedule = useMemo(() => {
    if (!blogData.blog_schedule_at) return '';
    const date = new Date(blogData.blog_schedule_at);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }, [blogData.blog_schedule_at]);

  // 履歴管理
  const {
    history,
    currentIndex,
    addToHistory,
    undo,
    redo,
    goToHistoryPoint,
    resetHistory,
  } = useEditorHistory('');

  // 自動保存タイマー
  useEffect(() => {
    let autoSaveTimer: NodeJS.Timeout | null = null;
    
    // 自動保存が有効な場合
    if (settings.autoSave && mode === 'create') {
      autoSaveTimer = setInterval(() => {
        saveDraft();
      }, settings.autoSaveInterval);
    }
    
    // クリーンアップ
    return () => {
      if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
      }
    };
  }, [settings.autoSave, settings.autoSaveInterval, mode, blogData]);

  /**
   * 初期化処理
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const blogId = urlParams.get('id');
    
    if (blogId) {
      loadBlog(blogId);
    } else {
      // ローカルストレージからドラフトを読み込み
      const savedDraft = localStorage.getItem('blog_draft');
      if (savedDraft) {
        try {
          const draftData = JSON.parse(savedDraft);
          setBlogData(prev => ({ ...prev, ...draftData }));
          resetHistory(draftData.blog_text || '');
        } catch (error) {
          console.error('ドラフトのロードに失敗しました:', error);
        }
      }
    }
  }, [resetHistory]);

  /**
   * 特定のブログをロード
   */
  const loadBlog = async (blogId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/blog/blog_read/${blogId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('ブログの読み込みに失敗しました');
      }
      
      const data = await response.json();
      
      setBlogData({
        blog_id: data.blog_id || '',
        blog_title: data.blog_title || '',
        blog_text: data.blog_text || '',
        blog_thumbnail: data.blog_thumbnail || '',
        blog_tags: data.blog_tags || [],
        blog_schedule_at: data.blog_schedule_at || '',
      });
      
      resetHistory(data.blog_text || '');
      setMode('edit');
      setIsScheduleMode(false);
    } catch (error) {
      console.error('ブログのロードエラー:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 予約投稿の編集を開始
   */
  const handleSelectScheduleForEdit = (schedule: BlogScheduleItem) => {
    setBlogData({
      blog_id: schedule.blog_schedule_id || '',
      blog_title: schedule.blog_title || '',
      blog_text: schedule.blog_text || '',
      blog_thumbnail: schedule.blog_thumbnail || '',
      blog_tags: Array.isArray(schedule.blog_tags) ? schedule.blog_tags : [],
      blog_schedule_at: schedule.blog_schedule_at || '',
    });
    resetHistory(schedule.blog_text || '');
    setMode('edit');
    setIsScheduleMode(true);
    setShowSchedule(false);
  };

  /**
   * 入力変更ハンドラ
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    setBlogData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // テキスト入力の場合は履歴に追加
    if (name === 'blog_text') {
      addToHistory(value);
      saveDraft();
    } else {
      saveDraft();
    }
  };

  /**
   * ドラフトを保存
   */
  const saveDraft = () => {
    if (mode === 'create') {
      localStorage.setItem('blog_draft', JSON.stringify(blogData));
    }
  };

  /**
   * テキスト内容の更新
   */
  const updateText = (newText: string) => {
    setBlogData(prev => ({
      ...prev,
      blog_text: newText
    }));
    addToHistory(newText);
    saveDraft();
  };

  /**
   * マークダウン記法の挿入
   */
  const insertMarkdown = (syntax: MarkdownSyntax) => {
    const textarea = document.querySelector('textarea[name="blog_text"]') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    
    // 見出しタグか箇条書きかを判定
    const isHeading = ['#', '##', '###', '>', '---'].some(symbol => syntax.prefix.includes(symbol));
    const isList = syntax.prefix === '- ' || /^\d+\. $/.test(syntax.prefix);
    
    const newText = text.substring(0, start) + 
      syntax.prefix + 
      (selectedText || (isHeading || isList ? '' : '')) + 
      ((selectedText && !isHeading && !isList) ? (syntax.suffix || '') : '') + 
      text.substring(end);
    
    updateText(newText);
    
    // カーソル位置を調整
    setTimeout(() => {
      textarea.focus();
      let newPosition = start + syntax.prefix.length;
      if (selectedText) {
        newPosition += selectedText.length;
        if (!isHeading && !isList && syntax.suffix) {
          // 選択テキストがあり、接尾辞があれば、選択テキストの後ろにカーソル
          newPosition = start + syntax.prefix.length + selectedText.length;
        }
      }
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  /**
   * 画像挿入
   */
  const insertImage = (fileId: string) => {
    const imageTag = `<img=${fileId}>`;
    const textarea = document.querySelector('textarea[name="blog_text"]') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const text = textarea.value;
    
    const newText = text.substring(0, start) + imageTag + text.substring(start);
    updateText(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + imageTag.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  /**
   * タグの更新
   */
  const updateTags = (newTags: string[]) => {
    setBlogData(prev => ({
      ...prev,
      blog_tags: newTags
    }));
    saveDraft();
  };

  /**
   * Undoアクション
   */
  const handleUndo = () => {
    const prevText = undo();
    if (prevText) {
      setBlogData(prev => ({
        ...prev,
        blog_text: prevText
      }));
    }
  };

  /**
   * Redoアクション
   */
  const handleRedo = () => {
    const nextText = redo();
    if (nextText) {
      setBlogData(prev => ({
        ...prev,
        blog_text: nextText
      }));
    }
  };

  /**
   * キーボードショートカットハンドラ
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Command キーが押されている場合
      if (e.ctrlKey || e.metaKey) {
        // 保存: Ctrl+S
        if (e.key === 's' && settings.keyboardShortcuts.save) {
          e.preventDefault(); // デフォルトの保存ダイアログを表示させない
          document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
        }
        
        // 太字: Ctrl+B
        if (e.key === 'b' && settings.keyboardShortcuts.bold) {
          e.preventDefault();
          insertMarkdown({ prefix: '**', suffix: '**' });
        }
        
        // 斜体: Ctrl+I
        if (e.key === 'i' && settings.keyboardShortcuts.italic) {
          e.preventDefault();
          insertMarkdown({ prefix: '*', suffix: '*' });
        }
        
        // 元に戻す・やり直しはEditorTextareaコンポーネントで処理
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settings.keyboardShortcuts]);

  /**
   * 履歴の特定ポイントへの復帰
   */
  const handleHistoryRevert = (index: number) => {
    const historyText = goToHistoryPoint(index);
    if (historyText) {
      setBlogData(prev => ({
        ...prev,
        blog_text: historyText
      }));
    }
  };

  /**
   * ブログセレクターでブログを選択
   */
  const handleBlogSelect = (blogId: string) => {
    if (blogId) {
      loadBlog(blogId);
    } else {
      // 新規作成モードに切り替え
      setBlogData({
        blog_id: '',
        blog_title: '',
        blog_text: '',
        blog_thumbnail: '',
        blog_tags: [],
        blog_schedule_at: '',
      });
      resetHistory('');
      setMode('create');
      setIsScheduleMode(false);
    }
  };

  /**
   * 新規作成モードに切り替え
   */
  const handleCreateNew = () => {
    setBlogData({
      blog_id: '',
      blog_title: '',
      blog_text: '',
      blog_thumbnail: '',
      blog_tags: [],
      blog_schedule_at: '',
    });
    resetHistory('');
    setMode('create');
    setIsScheduleMode(false);
  };

  /**
   * フォーム送信（保存）ハンドラ
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const payload = {
        ...blogData,
        blog_schedule_at: blogData.blog_schedule_at || '',
      };

      const endpoint = mode === 'create' 
        ? '/api/blog/blog_create' 
        : `/api/blog/blog_update/${blogData.blog_id}`;
      
      const method = mode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`ブログの${mode === 'create' ? '作成' : '更新'}に失敗しました`);
      }
      
      const result = await response.json();
      
      if (mode === 'create') {
        // 作成成功後は編集モードに移行
        localStorage.removeItem('blog_draft');
        window.location.href = `/blog/blog_editer?id=${result.blog_id}`;
      } else {
        if (isScheduleMode) {
          alert('予約投稿を更新しました');
        } else {
          alert('ブログを更新しました');
        }
      }
    } catch (error) {
      console.error('保存エラー:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ブログ削除ハンドラ
   */
  const handleDelete = async () => {
    if (!blogData.blog_id) return;
    
    const confirmMessage = isScheduleMode
      ? 'この予約投稿を削除しますか？'
      : '本当にこのブログ記事を削除しますか？この操作は取り消せません。';

    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/blog/blog_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ file_id: blogData.blog_id }),
      });
      
      if (!response.ok) {
        throw new Error(isScheduleMode ? '予約投稿の削除に失敗しました' : 'ブログの削除に失敗しました');
      }
      
      if (isScheduleMode) {
        alert('予約投稿を削除しました');
        handleCreateNew();
      } else {
        // 削除成功後はブログ一覧ページへ
        window.location.href = '/blog';
      }
    } catch (error) {
      console.error('削除エラー:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-6 md:px-6 mb-20">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-3">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
            {mode === 'create' ? 'ブログ新規作成' : 'ブログ編集'}
          </h1>
          {isScheduleMode && mode === 'edit' && (
            <span className="px-3 py-1 text-sm rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
              予約投稿編集中
            </span>
          )}
        </div>

        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center transition-colors"
            title="エディター設定"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            設定
          </button>

          <button
            type="button"
            onClick={() => setShowSchedule(true)}
            className="px-4 py-2 bg-purple-100 border border-purple-200 text-purple-700 rounded-md hover:bg-purple-200 dark:bg-purple-900 dark:border-purple-700 dark:text-purple-200 dark:hover:bg-purple-800 flex items-center transition-colors"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6a9 9 0 110 12 9 9 0 010-12z" />
            </svg>
            予約
          </button>
          
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-4 py-2 border rounded-md flex items-center transition-colors ${
              showPreview 
              ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200' 
              : 'bg-gray-100 border-gray-300 text-gray-800 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200'
            }`}
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {showPreview ? 'プレビューを閉じる' : 'プレビュー'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <BlogSelector
        selectedBlogId={blogData.blog_id}
        onBlogSelect={handleBlogSelect}
        onCreate={handleCreateNew}
      />
      
      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        <div>
          <label htmlFor="blog_title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            タイトル
          </label>
          <input
            type="text"
            id="blog_title"
            name="blog_title"
            value={blogData.blog_title}
            onChange={handleInputChange}
            placeholder="ブログタイトルを入力"
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="blog_text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            本文
          </label>
          
          {/* ツールバー */}
          <EditorToolbar onInsertMarkdown={insertMarkdown} />
          
          <div className={`${showPreview ? 'grid grid-cols-2 gap-4' : ''}`}>
            {/* エディター */}
            <div className={showPreview ? '' : 'w-full'}>
              <EditorTextarea
                content={blogData.blog_text}
                onChange={(text) => updateText(text)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                    if (e.shiftKey && settings.keyboardShortcuts.redo) {
                      e.preventDefault();
                      handleRedo();
                    } else if (settings.keyboardShortcuts.undo) {
                      e.preventDefault();
                      handleUndo();
                    }
                  }
                }}
              />
            </div>
            
            {/* プレビュー */}
            {showPreview && (
              <div className={`${styles.preview} bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm`}>
                <MarkdownPreview markdown={blogData.blog_text} />
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <TagSelector 
              tags={blogData.blog_tags} 
              onChange={updateTags} 
            />
          </div>
          
          <div>
            <ImageUploader onImageInsert={insertImage} />
          </div>
        </div>
        
        {/* 履歴ビューア */}
        <HistoryViewer 
          history={history} 
          currentIndex={currentIndex} 
          onRevert={handleHistoryRevert} 
        />
        
        <div className="flex justify-between items-center mt-8">
          <div className="space-x-2">
            {mode === 'edit' && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={isLoading}
              >
                削除
              </button>
            )}
          </div>
          
          <div className="flex flex-col items-end space-y-2">
            {formattedSchedule && (
              <p className="text-sm text-purple-600 dark:text-purple-300">
                予約日時: {formattedSchedule}
              </p>
            )}
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500"
                disabled={isLoading}
              >
                キャンセル
              </button>
              
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                {isLoading
                  ? '保存中...'
                  : mode === 'create'
                    ? '作成する'
                    : '更新する'}
              </button>
            </div>
          </div>
        </div>
      </form>
      
      {/* 設定モーダル */}
      {showSettings && <EditorSettings onClose={() => setShowSettings(false)} />}

      {/* 予約モーダル */}
      {showSchedule && (
        <ScheduleModal
          onClose={() => setShowSchedule(false)}
          blogData={blogData}
          setBlogData={setBlogData}
          onSelectScheduleForEdit={handleSelectScheduleForEdit}
          isScheduleMode={isScheduleMode}
          onClearScheduleMode={() => setIsScheduleMode(false)}
        />
      )}
    </div>
  );
}
