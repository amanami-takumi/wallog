'use client';

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useCodeBlock } from '@/contexts/CodeBlockContext';

const detectCodeLanguage = (code: string): string => {
  if (code.includes('print(') || code.includes('def ') || code.includes('import ') || code.match(/:\s*$/m)) {
    return 'python';
  }
  if (code.includes('function ') || code.includes('const ') || code.includes('let ') || 
      code.includes('var ') || code.includes('=>') || code.includes('console.log(')) {
    return 'javascript';
  }
  if (code.includes('services:') || code.includes('environment:') || 
      code.includes('volumes:') || code.includes('ports:')) {
    return 'docker';
  }
  if (code.includes('sudo ') || code.includes(' && ')) {
    return 'bash';
  }
  return 'text';
};

interface CodeBlockProps {
  language?: string;
  code: string;
  onCopy?: (message: string) => void;  // onCopyプロパティを追加
}

export function CodeBlock({ language, code, onCopy }: CodeBlockProps) {
  const { addNotification } = useCodeBlock();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      if (onCopy) {
        onCopy('コードをコピーしました');  // 外部から渡されたonCopyを使用
      } else {
        addNotification('コードをコピーしました');  // デフォルトの通知を使用
      }
    } catch (err) {
      console.error('コピーに失敗しました', err);
      addNotification('コピーに失敗しました');
    }
  };

  const normalizedLanguage = language ? language.replace('language-', '') : detectCodeLanguage(code);

  return (
    <div className="code-block-wrapper relative group">
      <button 
        onClick={copyToClipboard}
        className="absolute top-2 right-2 bg-gray-700 text-white px-2 py-1 rounded z-10"
      >
        Copy
      </button>
      <SyntaxHighlighter
        language={normalizedLanguage}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: '#1E1E1E',
          position: 'relative',
          fontSize: '1rem',
          zIndex: 1
        }}
        codeTagProps={{
          style: { color: '#D4D4D4' }
        }}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
