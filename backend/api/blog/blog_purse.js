// 「#」のHTML purse（#1つでh1、#2つでh2、#3つでh3、#4つでh4、#5つでh5、#6つでh6）
// 「-」のHTML purse（-で順序無しリスト）
// 「1.」のHTML purse（1.で順序リスト）
// 「>」のHTML purse（>で引用）
// 「```」のHTML purse（```で複数行コードブロック）
// 「---」のHTML purse（水平線）
// 「**太字**」のHTML purse（で太字）
// 「*斜体*」のHTML purse（*で斜体）
// 「~~取り消し線~~」のHTML purse（~~で取り消し線）
// 「__下線__」のHTML purse（で下線）
// 「https://example.com」のHTML purse（https://example.comでリンク）

// 関数をexportする
export function markdownToHtml(markdown) {
    console.log(`blog_purse_start`);
    // HTMLタグを判定する関数を追加
    function isHtmlTag(text) {
        return /^<[^>]+>.*<\/[^>]+>$/.test(text.trim());
    }

    // 特殊文字のエスケープ（HTMLタグは除外）
    function escapeHtml(text) {
        // テキストがHTMLタグの形式の場合はそのまま返す
        if (isHtmlTag(text)) {
            return text;
        }
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&apos;')
            .replace(/"/g, '&quot;')
            .replace(/`/g, '&#96;');  // バッククォートのエスケープを追加
    }

    // YouTube URLを検出する正規表現
    const YOUTUBE_REGEX = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)|https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/;
    
    // Google Spreadsheet URLを検出する正規表現
    const SPREADSHEET_REGEX = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/.*)?/;

    function convertSpreadsheetUrl(url) {
        const match = url.match(SPREADSHEET_REGEX);
        if (match) {
            const spreadsheetId = match[1];
            return `
                <div class="spreadsheet-container" style="position: relative; width: 100%; padding-bottom: 56.25%;">
                    <iframe 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
                        src="https://docs.google.com/spreadsheets/d/${spreadsheetId}/pubhtml?widget=true&amp;headers=false"
                        frameborder="0">
                    </iframe>
                </div>`;
        }
        return null;
    }

    function convertYoutubeUrl(url) {
        const match = url.match(YOUTUBE_REGEX);
        if (match) {
            const videoId = match[1] || match[2];
            return `
                <div class="youtube-container" style="position: relative; width: 100%; padding-bottom: 56.25%;">
                    <iframe 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
                        src="https://www.youtube.com/embed/${videoId}" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                </div>`;
        }
        return `<a href="${url}">${url}</a>`;
    }

    // URLの変換関数を修正
    function convertUrl(url) {
        const spreadsheetEmbed = convertSpreadsheetUrl(url);
        if (spreadsheetEmbed) return spreadsheetEmbed;
        
        const youtubeEmbed = convertYoutubeUrl(url);
        return youtubeEmbed;
    }

    // iframeタグをレスポンシブ対応にする関数を追加
    function makeIframeResponsive(iframeHtml) {
        // すでにコンテナで囲まれているかチェック
        if (iframeHtml.includes('class="youtube-container"') || 
            iframeHtml.includes('class="spreadsheet-container"') ||
            iframeHtml.includes('style="position: relative; width: 100%;')) {
            return iframeHtml;
        }

        // iframeタグの属性を取得
        const iframe = iframeHtml.match(/<iframe[^>]*>/);
        if (!iframe) return iframeHtml;

        return `
            <div style="position: relative; width: 100%; padding-bottom: 56.25%;">
                ${iframeHtml.replace(/<iframe/, '<iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"')}
            </div>`;
    }

    const lines = markdown.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeContent = '';
    let inOrderedList = false;  // 番号付きリストの状態を追跡
    let inUnorderedList = false;  // 箇条書きリストの状態を追跡

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // コードブロックの処理
        const codeBlockMatches = line.match(/```/g);
        if (codeBlockMatches) {
            const matchCount = codeBlockMatches.length;
            
            if (!inCodeBlock) {
                // コードブロック開始
                inCodeBlock = true;
                const contentAfterStart = line.split('```')[1];
                html += '<pre><code>';
                if (matchCount > 1) {
                    // 同じ行に終了タグがある場合
                    const parts = line.split('```');
                    const content = parts[1]; // 開始と終了の間のコンテンツ
                    html += escapeHtml(content);
                    html += '</code></pre>\n';
                    inCodeBlock = false;
                } else {
                    // 開始タグのみの場合
                    if (contentAfterStart) {
                        html += escapeHtml(contentAfterStart) + '\n';
                    }
                }
                continue;
            } else {
                // コードブロック終了
                inCodeBlock = false;
                const contentBeforeEnd = line.split('```')[0];
                if (contentBeforeEnd) {
                    html += escapeHtml(contentBeforeEnd);
                }
                html += '</code></pre>\n';
                continue;
            }
        }

        // コードブロック内の処理
        if (inCodeBlock) {
            html += escapeHtml(line) + '\n';
            continue;
        }

        // 行全体がHTMLタグの場合の処理を修正
        if (isHtmlTag(line)) {
            if (inOrderedList) {
                html += '</ol>\n';
                inOrderedList = false;
            }
            if (inUnorderedList) {
                html += '</ul>\n';
                inUnorderedList = false;
            }
            // iframeタグの場合はレスポンシブ対応を適用
            if (line.includes('<iframe')) {
                html += `${makeIframeResponsive(line)}\n`;
            } else {
                html += `${line}\n`;
            }
            continue;
        }

        // 見出しの処理（h1-h6タグがそのまま含まれている場合）
        const headingMatch = line.match(/^<h([1-6])>(.*?)<\/h\1>$/);
        if (headingMatch) {
            if (inOrderedList) {
                html += '</ol>\n';
                inOrderedList = false;
            }
            if (inUnorderedList) {
                html += '</ul>\n';
                inUnorderedList = false;
            }
            const [, level, content] = headingMatch;
            html += `<h${level}>${content}</h${level}>\n`;
            continue;
        }

        // マークダウン形式の見出しの処理
        if (line.startsWith('#')) {
            if (inOrderedList) {
                html += '</ol>\n';
                inOrderedList = false;
            }
            if (inUnorderedList) {
                html += '</ul>\n';
                inUnorderedList = false;
            }
            const level = line.match(/^#+/)[0].length;
            const content = line.substring(level).trim();
            if (level >= 1 && level <= 6) {
                html += `<h${level}>${escapeHtml(content)}</h${level}>\n`;
                continue;
            }
        }

        // 番号付きリストの処理
        if (/^\d+\.\s/.test(line)) {
            if (inUnorderedList) {
                html += '</ul>\n';
                inUnorderedList = false;
            }
            if (!inOrderedList) {
                html += '<ol>\n';
                inOrderedList = true;
            }
            html += `<li>${escapeHtml(line.substring(line.indexOf('.') + 1).trim())}</li>\n`;
            continue;
        }

        // 番号付きリスト以外の要素が来た場合、リストを閉じる
        if (inOrderedList) {
            html += '</ol>\n';
            inOrderedList = false;
        }

        // リストの処理
        if (line.startsWith('- ')) {
            if (!inUnorderedList) {
                html += '<ul>\n';
                inUnorderedList = true;
            }
            html += `<li>${escapeHtml(line.substring(2))}</li>\n`;
            continue;
        }

        if (inUnorderedList) {
            html += '</ul>\n';
            inUnorderedList = false;
        }

        // 引用の処理
        if (line.startsWith('> ')) {
            html += `<blockquote>${escapeHtml(line.substring(2))}</blockquote>\n`;
            continue;
        }

        // 水平線の処理
        if (line === '---') {
            html += '<hr>\n';
            continue;
        }

        // インライン要素の処理を修正
        const inlineCodePlaceholders = [];
        line = line.replace(/`([^`]+)`/g, (match, code) => {
            const placeholder = `@@INLINE_CODE_${inlineCodePlaceholders.length}@@`;
            inlineCodePlaceholders.push(`<code>${escapeHtml(code)}</code>`);
            return placeholder;
        });

        line = line
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            .replace(/__(.+?)__/g, '<u>$1</u>')
            .replace(/(https?:\/\/[^\s]+)/g, (match, url) => convertUrl(url))
            .replace(/<img=([^]+)>/g, (match, fileId) => {
                return `<img src="https://wallog.seitendan.com/api/drive/file/${fileId}" alt="Image ${fileId}" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy">`;
            });

        inlineCodePlaceholders.forEach((codeHtml, index) => {
            const placeholderRegex = new RegExp(`@@INLINE_CODE_${index}@@`, 'g');
            line = line.replace(placeholderRegex, codeHtml);
        });

        // 空行またはスペースのみの行も段落として処理
        html += `<p>${line}</p>\n`;

    }

    // ファイル終端でまだリストが開いている場合は閉じる
    if (inOrderedList) {
        html += '</ol>\n';
    }
    if (inUnorderedList) {
        html += '</ul>\n';
    }

    // ファイル終端でまだコードブロックが開いている場合は閉じる
    if (inCodeBlock) {
        html += '</code></pre></p>\n';
    }

    return html;
}
