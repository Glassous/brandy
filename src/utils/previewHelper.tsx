import { useEffect, useMemo } from 'react';
import Prism from 'prismjs';
import { marked } from 'marked';

// Import Prism themes and language components
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-json';

const TEXT_EXTENSIONS = [
  'txt', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'json', 'md', 'markdown',
  'csv', 'py', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'cs', 'go', 'rs',
  'swift', 'kt', 'sql', 'sh', 'bat', 'ps1', 'xml', 'yaml', 'yml', 'ini', 'conf',
  'properties', 'toml', 'log'
];

export function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.includes(getFileExtension(name));
}

export function getPrismLanguage(ext: string): string {
  const mapping: { [key: string]: string } = {
    html: 'markup',
    htm: 'markup',
    xml: 'markup',
    svg: 'markup',
    css: 'css',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    kt: 'kotlin',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    markdown: 'markdown',
  };
  return mapping[ext] || 'text';
}

// 1. Simple CSV Parser
export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line && i === lines.length - 1) continue; // Skip last empty line
    const row: string[] = [];
    let inQuotes = false;
    let currentField = '';
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentField.trim().replace(/^"|"$/g, ''));
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField.trim().replace(/^"|"$/g, ''));
    result.push(row);
  }
  return result;
}

// 2. Code Highlight Component
export function CodeHighlight({ code, language }: { code: string; language: string }) {
  useEffect(() => {
    Prism.highlightAll();
  }, [code, language]);

  return (
    <pre style={{
      margin: 0,
      padding: '16px',
      borderRadius: '8px',
      overflow: 'auto',
      maxHeight: '100%',
      fontSize: '13px',
      width: '100%',
      background: '#1d1f21',
      color: '#c5c8c6',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      textAlign: 'left',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
    }}>
      <code className={`language-${language}`}>{code}</code>
    </pre>
  );
}

// 3. Markdown Component with clean styles
export function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(content) as string;
    } catch (e) {
      return `<pre>${content}</pre>`;
    }
  }, [content]);

  return (
    <div className="markdown-preview-container">
      <style>{`
        .markdown-preview-container {
          padding: 24px;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          text-align: left;
          color: var(--text-primary, #ffffff);
          line-height: 1.6;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, 
        .markdown-preview-container h1, .markdown-preview-container h2, .markdown-preview-container h3 {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 0.3em;
          margin-top: 24px;
          margin-bottom: 16px;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
        }
        .markdown-preview-container h1 { font-size: 1.8em; }
        .markdown-preview-container h2 { font-size: 1.4em; }
        .markdown-preview-container h3 { font-size: 1.2em; }
        .markdown-preview-container p { margin-top: 0; margin-bottom: 16px; color: var(--text-secondary, rgba(255,255,255,0.7)); }
        .markdown-preview-container code {
          padding: 0.2em 0.4em;
          margin: 0;
          font-size: 85%;
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-family: monospace;
        }
        .markdown-preview-container pre {
          padding: 16px;
          overflow: auto;
          font-size: 85%;
          line-height: 1.45;
          background-color: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          margin-bottom: 16px;
        }
        .markdown-preview-container pre code {
          padding: 0;
          background-color: transparent;
          font-size: 100%;
        }
        .markdown-preview-container ul, .markdown-preview-container ol {
          padding-left: 2em;
          margin-top: 0;
          margin-bottom: 16px;
          color: var(--text-secondary, rgba(255,255,255,0.7));
        }
        .markdown-preview-container blockquote {
          padding: 0 1em;
          color: var(--text-secondary, rgba(255,255,255,0.6));
          border-left: 0.25em solid #3182ce;
          margin: 0 0 16px 0;
          background: rgba(255, 255, 255, 0.02);
        }
        .markdown-preview-container table {
          border-spacing: 0;
          border-collapse: collapse;
          margin-top: 0;
          margin-bottom: 16px;
          width: 100%;
          overflow: auto;
        }
        .markdown-preview-container table th {
          font-weight: 600;
          background-color: rgba(255, 255, 255, 0.08);
        }
        .markdown-preview-container table th, .markdown-preview-container table td {
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 6px 13px;
        }
        .markdown-preview-container table tr:nth-child(2n) {
          background-color: rgba(255, 255, 255, 0.03);
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// 4. CSV Table Component with Premium Styling
export function CSVPreview({ content }: { content: string }) {
  const data = useMemo(() => parseCSV(content), [content]);

  if (data.length === 0) {
    return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>空 CSV 文件</div>;
  }

  const headers = data[0];
  const rows = data.slice(1);

  return (
    <div className="csv-preview-container">
      <style>{`
        .csv-preview-container {
          width: 100%;
          height: 100%;
          overflow: auto;
          padding: 16px;
          background: var(--bg-card, #121212);
          border-radius: 8px;
        }
        .csv-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          color: var(--text-primary, #ffffff);
          text-align: left;
        }
        .csv-table th {
          background: var(--hover, rgba(255, 255, 255, 0.08));
          color: var(--text-primary, #ffffff);
          font-weight: 600;
          padding: 10px 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .csv-table td {
          padding: 8px 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          white-space: nowrap;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .csv-table tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .csv-table tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }
      `}</style>
      <table className="csv-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} title={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} title={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
