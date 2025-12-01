'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BlogFormData, BlogScheduleItem } from '../types';

interface ScheduleModalProps {
  onClose: () => void;
  blogData: BlogFormData;
  setBlogData: React.Dispatch<React.SetStateAction<BlogFormData>>;
  onSelectScheduleForEdit: (entry: BlogScheduleItem) => void;
  isScheduleMode: boolean;
  onClearScheduleMode: () => void;
}

const toDateTimeLocalValue = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const ScheduleModal: React.FC<ScheduleModalProps> = ({
  onClose,
  blogData,
  setBlogData,
  onSelectScheduleForEdit,
  isScheduleMode,
  onClearScheduleMode,
}) => {
  const [scheduleInput, setScheduleInput] = useState('');
  const [schedules, setSchedules] = useState<BlogScheduleItem[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const currentModeLabel = useMemo(() => (isScheduleMode ? '変更' : '確定'), [isScheduleMode]);

  const fetchSchedules = async () => {
    setIsListLoading(true);
    setListError(null);

    try {
      const response = await fetch('/api/blog/blog_schedule_list', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('予約投稿一覧の取得に失敗しました');
      }

      const data = await response.json();
      const rawList = Array.isArray(data)
        ? data
        : Array.isArray(data?.schedules)
          ? data.schedules
          : Array.isArray(data?.blog_schedules)
            ? data.blog_schedules
            : [];

      const normalized: BlogScheduleItem[] = rawList
        .map((item: any) => ({
          blog_schedule_id: item.blog_schedule_id || '',
          blog_id: item.blog_id,
          blog_title: item.blog_title || '',
          blog_text: item.blog_text || '',
          blog_thumbnail: item.blog_thumbnail || '',
          blog_tags: Array.isArray(item.blog_tags) ? item.blog_tags : [],
          blog_schedule_at: item.blog_schedule_at || '',
        }))
        .filter((item: BlogScheduleItem) => Boolean(item.blog_schedule_id));

      setSchedules(normalized);
    } catch (error) {
      console.error('予約投稿一覧取得エラー:', error);
      setListError((error as Error).message);
    } finally {
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setScheduleInput(toDateTimeLocalValue(blogData.blog_schedule_at));
  }, [blogData.blog_schedule_at]);

  const handleScheduleSubmit = async () => {
    if (!scheduleInput) {
      setSubmitError('予約日時を入力してください');
      setSubmitMessage(null);
      return;
    }

    const scheduleDate = new Date(scheduleInput);
    if (Number.isNaN(scheduleDate.getTime())) {
      setSubmitError('予約日時の形式が不正です');
      setSubmitMessage(null);
      return;
    }

    setSubmitError(null);
    setSubmitMessage(null);

    const scheduleIso = scheduleDate.toISOString();

    setBlogData(prev => ({
      ...prev,
      blog_schedule_at: scheduleIso,
    }));

    setSubmitMessage(`予約日時を${currentModeLabel}しました。エディター画面の保存ボタンで確定してください。`);
  };

  const handleScheduleDelete = async (scheduleId: string) => {
    if (!window.confirm('この予約投稿を削除しますか？')) {
      return;
    }

    try {
      const response = await fetch('/api/blog/blog_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ file_id: scheduleId }),
      });

      if (!response.ok) {
        throw new Error('予約投稿の削除に失敗しました');
      }

      await fetchSchedules();

      // 編集中の予約を削除した場合はエディタの状態も初期化する
      if (isScheduleMode && blogData.blog_id === scheduleId) {
        setBlogData(prev => ({
          ...prev,
          blog_id: '',
          blog_schedule_at: '',
        }));
        onClearScheduleMode();
      }

      setSubmitMessage('予約投稿を削除しました');
      setSubmitError(null);
    } catch (error) {
      console.error('予約投稿削除エラー:', error);
      setSubmitError((error as Error).message);
      setSubmitMessage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">予約投稿</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="予約モーダルを閉じる"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          <section className="space-y-3">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-200">予約設定</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              現在編集中の内容を予約投稿として保存します。予約日時を指定してください。
            </p>
            <div className="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-3 md:space-y-0">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300" htmlFor="schedule_at">
                予約日時
              </label>
              <input
                id="schedule_at"
                type="datetime-local"
                value={scheduleInput}
                onChange={e => {
                  setScheduleInput(e.target.value);
                  setSubmitError(null);
                  setSubmitMessage(null);
                }}
                className="w-full md:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleScheduleSubmit}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                予約日時を{currentModeLabel}
              </button>
            </div>

            {submitError && (
              <div className="text-sm text-red-500 dark:text-red-400">
                {submitError}
              </div>
            )}

            {submitMessage && (
              <div className="text-sm text-green-600 dark:text-green-400">
                {submitMessage}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-200">予約一覧</h3>

            {isListLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">読み込み中...</div>
            ) : listError ? (
              <div className="text-sm text-red-500 dark:text-red-400">{listError}</div>
            ) : schedules.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">予約投稿はありません。</div>
            ) : (
              <div className="space-y-2">
                {schedules.map(schedule => (
                  <div
                    key={schedule.blog_schedule_id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between border border-gray-200 dark:border-gray-600 rounded-md p-3"
                  >
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-100">
                        {schedule.blog_title || '（タイトル未設定）'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {schedule.blog_schedule_at
                          ? new Date(schedule.blog_schedule_at).toLocaleString()
                          : '予約日時未設定'}
                      </p>
                    </div>
                    <div className="flex space-x-2 mt-3 md:mt-0">
                      <button
                        type="button"
                        onClick={() => onSelectScheduleForEdit(schedule)}
                        className="px-3 py-1 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-md transition-colors"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleScheduleDelete(schedule.blog_schedule_id)}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-md transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
