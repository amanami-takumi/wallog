'use client';

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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

interface InlineCodeBlockProps {
  language?: string;
  code: string;
}

export function InlineCodeBlock({ language, code }: InlineCodeBlockProps) {
  const normalizedLanguage = language ? language.replace('language-', '') : detectCodeLanguage(code);

  return (
    <SyntaxHighlighter
      language={normalizedLanguage}
      style={vscDarkPlus}
      PreTag="span"
      customStyle={{
        display: 'inline',
        margin: 0,
        padding: '0.15rem 0.4rem',
        background: '#1E1E1E',
        borderRadius: '0.375rem',
        fontSize: '0.95em',
        lineHeight: 'inherit',
        verticalAlign: 'baseline',
      }}
      codeTagProps={{
        style: {
          background: 'transparent',
          padding: 0,
          margin: 0,
          whiteSpace: 'pre',
          lineHeight: 'inherit',
        },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
