'use client';
import React, { useState, useRef } from 'react';
import styles from '../BlogEditor.module.css';

interface ImageUploaderProps {
  onImageInsert: (fileId: string) => void;
}

/**
 * 画像アップロードコンポーネント
 * 
 * 画像のアップロードとギャラリー表示を提供します
 */
const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageInsert }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<Array<{
    file_id: string;
    url: string;
    name: string;
    created_at: string;
  }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 画像ファイル選択ハンドラ
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    uploadFiles(files);
  };

  /**
   * ドラッグ&ドロップハンドラ
   */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  /**
   * ドラッグオーバーハンドラ
   */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * ファイルアップロード処理
   */
  const uploadFiles = async (files: FileList) => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    
    // FormDataの作成
    const formData = new FormData();
    
    // 複数ファイルをFormDataに追加
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    try {
      // APIエンドポイントへのアップロード
      const response = await fetch('/api/drive/file_create', {
        method: 'POST',
        body: formData,
        // アップロードの進捗をモニタリングする場合はここにXMLHttpRequestを使用
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'アップロードに失敗しました');
      }
      
      const result = await response.json();
      
      // アップロードされた画像をリストに追加
      setUploadedImages(prev => [
        ...result.files.map((file: any) => ({
          file_id: file.file_id,
          url: file.url,
          name: file.originalName,
          created_at: new Date().toISOString(),
        })),
        ...prev,
      ]);
      
    } catch (error) {
      console.error('画像アップロードエラー:', error);
      setError((error as Error).message || '画像のアップロードに失敗しました');
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
      
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // 数秒後にプログレスバーをリセット
      setTimeout(() => {
        setUploadProgress(0);
      }, 3000);
    }
  };
  
  /**
   * 画像をエディターに挿入する
   */
  const insertImage = (fileId: string) => {
    onImageInsert(fileId);
  };
  
  /**
   * サムネイルURLを生成する
   */
  const getThumbnailUrl = (fileId: string) => {
    return `/api/file/${fileId}/thumbnail`;
  };
  
  /**
   * アップロード済み画像リストを読み込む
   */
  React.useEffect(() => {
    const fetchUploadedImages = async () => {
      try {
        setIsGalleryLoading(true);
        const response = await fetch('/api/drive/file_list', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('画像の取得に失敗しました');
        }
        
        const result = await response.json();
        setUploadedImages(result.files || []);
      } catch (error) {
        console.error('画像リスト取得エラー:', error);
        setError('画像の読み込みに失敗しました');
      } finally {
        setIsGalleryLoading(false);
      }
    };
    
    fetchUploadedImages();
  }, []);
  
  return (
    <div className="space-y-4">
      {/* ファイルアップロード領域 */}
      <div
        className={`border-2 border-dashed p-4 rounded-md text-center ${
          isUploading ? 'bg-blue-50 border-blue-300 dark:bg-blue-900 dark:border-blue-700' : 'border-gray-300 hover:border-blue-400 dark:border-gray-600 dark:hover:border-blue-500'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          id="image-upload"
        />
        <label
          htmlFor="image-upload"
          className="cursor-pointer block w-full"
        >
          {isUploading ? (
            <div className="space-y-2">
              <p className="dark:text-gray-300">アップロード中... {uploadProgress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div
                  className="bg-blue-600 h-2.5 rounded-full dark:bg-blue-500"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                画像をドラッグ&ドロップするか、ここをクリックしてアップロード
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                対応フォーマット: JPG, PNG, GIF, WebP (最大 5MB)
              </p>
            </div>
          )}
        </label>
      </div>
      
      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-md dark:bg-red-900 dark:border-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      
      {/* アップロード済み画像ギャラリー */}
      <div className="mt-4">
        <h3 className="text-lg font-medium mb-2 dark:text-white">アップロード済み画像</h3>
        
        {isGalleryLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 dark:border-blue-400"></div>
          </div>
        ) : uploadedImages.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            アップロードされた画像はありません
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {uploadedImages.map((image) => (
              <div
                key={image.file_id}
                className="border rounded-md overflow-hidden hover:border-blue-500 dark:border-gray-700 dark:hover:border-blue-500 cursor-pointer transition-colors"
                onClick={() => insertImage(image.file_id)}
                title={`クリックして「${image.name || image.file_id}」を挿入`}
              >
                <div className="aspect-square w-full relative bg-gray-100 dark:bg-gray-800">
                  <img
                    src={getThumbnailUrl(image.file_id)}
                    alt={image.name || image.file_id}
                    className="object-cover w-full h-full absolute inset-0"
                    loading="lazy"
                    onError={(e) => {
                      // サムネイル読み込みエラー時は代替表示
                      (e.target as HTMLImageElement).src = `/api/drive/file/${image.file_id}`;
                      (e.target as HTMLImageElement).classList.remove('object-cover');
                      (e.target as HTMLImageElement).classList.add('object-contain');
                    }}
                  />
                </div>
                <div className="text-xs truncate p-1 text-gray-700 dark:text-gray-300">
                  {image.name || image.file_id}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;