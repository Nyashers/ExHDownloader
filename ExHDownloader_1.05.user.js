// ==UserScript==
// @name         ExHentai Absolute Proof Downloader (Visible Timer)
// @namespace    http://tampermonkey.net/
// @version      10.5
// @description  Downloads originals sequentially. Shows a countdown timer for the next quota update.
// @author       Nyashers
// @match        *://exhentai.org/g/*
// @match        *://e-hentai.org/g/*
// @match        *://*.e-hentai.org/g/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // === ExHentai Styled CSS ===
    GM_addStyle(`
        /* Top Control Bar above gallery */
        #eh-top-control-bar {
            background: #34353b;
            border: 1px solid #4f535b;
            border-radius: 4px;
            padding: 8px 12px;
            margin: 10px auto;
            max-width: 1200px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            color: #edebdf;
            font-size: 12px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        }
        .eh-top-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .eh-top-btn {
            background: #2c2d32;
            color: #edebdf;
            border: 1px solid #5c5c5c;
            border-radius: 3px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.15s ease-in-out;
            user-select: none;
        }
        .eh-top-btn:hover {
            background: #4f535b;
            color: #ffffff;
            border-color: #8a8a95;
            transform: translateY(-1px);
        }
        .eh-quota-badge {
            background: #18191c;
            border: 1px solid #4f535b;
            border-radius: 3px;
            padding: 4px 8px;
            font-size: 11px;
            color: #a0a0a0;
            display: flex;
            align-items: center;
        }
        .eh-quota-badge b {
            color: #58d68d;
        }
        .eh-quota-diff {
            color: #ff6b6b;
            font-weight: bold;
            margin-left: 4px;
        }
        .eh-timer-badge {
            color: #a0a0a0;
            font-size: 10px;
            margin-left: 8px;
            padding-left: 8px;
            border-left: 1px solid #4f535b;
            white-space: nowrap;
        }

        /* Preview Buttons */
        .eh-dl-btn {
            position: absolute;
            top: 6px;
            left: 6px;
            background: #2c2d32;
            color: #edebdf;
            border: 1px solid #5c5c5c;
            border-radius: 3px;
            padding: 5px 10px;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            z-index: 100;
            transition: all 0.15s ease-in-out;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
            user-select: none;
            white-space: nowrap;
        }
        .eh-dl-btn:hover {
            background: #4f535b;
            color: #ffffff;
            border-color: #8a8a95;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
        }

        /* Button States */
        .eh-dl-btn.state-queued {
            color: #f39c12;
            border-color: #d39e00;
            background: #342810;
        }
        .eh-dl-btn.state-scan {
            color: #00bcd4;
            border-color: #00838f;
            background: #102830;
        }
        .eh-dl-btn.state-dl {
            color: #3498db;
            border-color: #1f618d;
            background: #102030;
        }
        .eh-dl-btn.state-done {
            color: #58d68d;
            border-color: #27ae60;
            background: #102d1a;
        }
        .eh-dl-btn.state-err {
            color: #ff6b6b;
            border-color: #c0392b;
            background: #331212;
        }

        /* Download Manager */
        #eh-dl-manager {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 350px;
            background: #2c2d32;
            border: 1px solid #5c5c5c;
            border-radius: 4px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85);
            font-family: Tahoma, Verdana, Arial, sans-serif;
            color: #edebdf;
            z-index: 99999;
            overflow: hidden;
            display: none;
            flex-direction: column;
            font-size: 12px;
        }
        #eh-dl-manager.active {
            display: flex;
        }
        .eh-mgr-header {
            background: #34353b;
            padding: 8px 12px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #4f535b;
            font-size: 12px;
            color: #edebdf;
        }
        .eh-mgr-body {
            padding: 12px;
            max-height: 250px;
            overflow-y: auto;
        }
        .eh-mgr-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: bold;
            margin-bottom: 6px;
            color: #ffffff;
        }

        /* Progress Bar */
        .eh-progress-bg {
            background: #18191c;
            border: 1px solid #4f535b;
            border-radius: 3px;
            height: 16px;
            width: 100%;
            overflow: hidden;
            position: relative;
        }
        .eh-progress-fill {
            background: linear-gradient(90deg, #1f618d, #27ae60);
            height: 100%;
            width: 0%;
            transition: width 0.15s ease-in-out;
        }
        .eh-progress-text {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            font-size: 10px;
            line-height: 16px;
            text-align: center;
            color: #ffffff;
            font-weight: bold;
            text-shadow: 1px 1px 2px #000;
        }

        /* Queue List */
        .eh-mgr-queue-list {
            margin-top: 10px;
            border-top: 1px solid #4f535b;
            padding-top: 8px;
            font-size: 11px;
            color: #a0a0a0;
        }
        .eh-mgr-queue-item {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 3px 0;
        }
    `);

    // === Utilities ===
    function sanitizeFilename(name) {
        return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
    }

    function getGalleryTitle() {
        const titleEn = document.querySelector('#gn');
        const titleJp = document.querySelector('#gj');
        let title = titleEn && titleEn.textContent ? titleEn.textContent : (titleJp ? titleJp.textContent : "ExHentai_Gallery");
        return sanitizeFilename(title);
    }

    function getExtension(url) {
        const match = url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i);
        return match ? match[1].toLowerCase() : "jpg";
    }

    function showError(btn, text) {
        btn.className = 'eh-dl-btn state-err';
        btn.innerText = text;
        setTimeout(() => {
            btn.className = 'eh-dl-btn';
            btn.innerText = '⬇ Download';
        }, 5000);
    }

    // === Quota & Timer Variables ===
    let lastParsedQuotaNum = null;
    let isFetchingQuota = false;
    let idleTimerSeconds = 60;
    let idleIntervalId = null;

    // === Fetch Image Limits from e-hentai.org/home.php ===
    function fetchImageLimits(onCompleteCallback) {
        if (isFetchingQuota) return;
        isFetchingQuota = true;

        const targetUrl = 'https://e-hentai.org/home.php';

        GM_xmlhttpRequest({
            method: "GET",
            url: targetUrl,
            anonymous: false,
            onload: function(res) {
                isFetchingQuota = false;
                resetIdleTimer();

                if (res.status === 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(res.responseText, "text/html");

                    const paragraphs = Array.from(doc.querySelectorAll('.homebox p'));
                    const limitP = paragraphs.find(p => p.textContent.includes('towards your account limit of'));

                    if (limitP) {
                        const strongs = limitP.querySelectorAll('strong');
                        if (strongs.length >= 2) {
                            const currentStr = strongs[0].textContent.trim();
                            const limitStr = strongs[1].textContent.trim();

                            const currentNum = parseInt(currentStr.replace(/,/g, ''), 10);
                            let spentDiffStr = "";

                            if (lastParsedQuotaNum !== null && !isNaN(currentNum)) {
                                const diff = currentNum - lastParsedQuotaNum;
                                if (diff > 0) {
                                    spentDiffStr = `<span class="eh-quota-diff">(-${diff})</span>`;
                                }
                            }

                            if (!isNaN(currentNum)) {
                                lastParsedQuotaNum = currentNum;
                            }

                            updateQuotaUI(`${currentStr} / ${limitStr}`, spentDiffStr);
                            if (onCompleteCallback) onCompleteCallback();
                            return;
                        }
                    }
                    updateQuotaUI("Not found", "");
                } else {
                    updateQuotaUI("Err: HTTP " + res.status, "");
                }
                if (onCompleteCallback) onCompleteCallback();
            },
            onerror: function() {
                isFetchingQuota = false;
                resetIdleTimer();
                updateQuotaUI("Network error", "");
                if (onCompleteCallback) onCompleteCallback();
            }
        });
    }

    function updateQuotaUI(str, diffHtml) {
        const topQuotaText = document.querySelector('#eh-quota-value');
        const mgrQuotaEl = document.querySelector('#eh-mgr-quota');

        if (topQuotaText) topQuotaText.innerHTML = `Image Limits: <b>${str}</b> ${diffHtml}`;
        if (mgrQuotaEl) mgrQuotaEl.innerHTML = `Quota: ${str} ${diffHtml}`;
    }

    // === Countdown Timer Controls ===
    function startIdleTimer() {
        if (idleIntervalId) clearInterval(idleIntervalId);

        idleIntervalId = setInterval(() => {
            updateTimerDisplay();

            if (document.hidden || isProcessing) return;

            idleTimerSeconds--;

            if (idleTimerSeconds <= 0) {
                idleTimerSeconds = 60;
                fetchImageLimits();
            }
        }, 1000);
    }

    function resetIdleTimer() {
        idleTimerSeconds = 60;
        updateTimerDisplay();
    }

    function updateTimerDisplay() {
        const timerEl = document.querySelector('#eh-quota-timer');
        if (!timerEl) return;

        if (isProcessing) {
            timerEl.innerText = `⏱ [Downloading]`;
            timerEl.style.color = `#3498db`;
        } else if (document.hidden) {
            timerEl.innerText = `⏱ [Sleeping]`;
            timerEl.style.color = `#888`;
        } else {
            timerEl.innerText = `⏱ ${idleTimerSeconds}s`;
            timerEl.style.color = `#a0a0a0`;
        }
    }

    function initIdlePolling() {
        startIdleTimer();

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !isProcessing) {
                fetchImageLimits();
            } else {
                updateTimerDisplay();
            }
        });
    }

    // === UI Elements ===
    let managerEl, currentTaskEl, progressBarEl, progressTextEl, queueListEl, queueCountEl;

    function createControlBarUI() {
        const gdt = document.querySelector('#gdt');
        if (!gdt) return;

        const bar = document.createElement('div');
        bar.id = 'eh-top-control-bar';
        bar.innerHTML = `
            <div class="eh-top-left">
                <button id="eh-batch-dl-btn" class="eh-top-btn">⬇ Download All on Page</button>
                <div class="eh-quota-badge">
                    <span id="eh-quota-value">Image Limits: <i>Checking...</i></span>
                    <span id="eh-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div style="font-size:11px; color:#a0a0a0;">ExH Downloader v10.5</div>
        `;

        gdt.parentNode.insertBefore(bar, gdt);

        bar.querySelector('#eh-batch-dl-btn').addEventListener('click', downloadAllVisible);
    }

    function createManagerUI() {
        managerEl = document.createElement('div');
        managerEl.id = 'eh-dl-manager';
        managerEl.innerHTML = `
            <div class="eh-mgr-header">
                <span>Download Manager</span>
                <span id="eh-mgr-count">0 queued</span>
            </div>
            <div class="eh-mgr-body">
                <div class="eh-mgr-current">
                    <div id="eh-mgr-title" class="eh-mgr-title">Idle...</div>
                    <div class="eh-progress-bg">
                        <div id="eh-progress-fill" class="eh-progress-fill"></div>
                        <div id="eh-progress-text" class="eh-progress-text">0%</div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:10px; color:#888;">
                    <span id="eh-mgr-quota">Quota: ...</span>
                    <span id="eh-mgr-total-progress">Processed: 0/0</span>
                </div>
                <div id="eh-mgr-queue-list" class="eh-mgr-queue-list"></div>
            </div>
        `;
        document.body.appendChild(managerEl);

        currentTaskEl = managerEl.querySelector('#eh-mgr-title');
        progressBarEl = managerEl.querySelector('#eh-progress-fill');
        progressTextEl = managerEl.querySelector('#eh-progress-text');
        queueListEl = managerEl.querySelector('#eh-mgr-queue-list');
        queueCountEl = managerEl.querySelector('#eh-mgr-count');
    }

    function updateManagerUI() {
        if (downloadQueue.length === 0 && !isProcessing) {
            managerEl.classList.remove('active');
            return;
        }

        managerEl.classList.add('active');
        queueCountEl.innerText = `${downloadQueue.length} queued`;

        const totalProgressEl = managerEl.querySelector('#eh-mgr-total-progress');
        if (totalProgressEl) {
            totalProgressEl.innerText = `Processed: ${completedCount}/${totalAddedTasks}`;
        }

        queueListEl.innerHTML = '';
        downloadQueue.slice(0, 5).forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'eh-mgr-queue-item';
            div.innerText = `${idx + 1}. Page ${item.pageNum}`;
            queueListEl.appendChild(div);
        });

        if (downloadQueue.length > 5) {
            const div = document.createElement('div');
            div.className = 'eh-mgr-queue-item';
            div.style.fontStyle = 'italic';
            div.innerText = `...and ${downloadQueue.length - 5} more`;
            queueListEl.appendChild(div);
        }
    }

    // === Queue & Download Logic ===
    const downloadQueue = [];
    let isProcessing = false;
    let completedCount = 0;
    let totalAddedTasks = 0;

    window.addEventListener('beforeunload', (e) => {
        if (isProcessing || downloadQueue.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    function downloadAllVisible() {
        const items = document.querySelectorAll('#gdt > a');
        items.forEach((link) => {
            const btn = link.querySelector('.eh-dl-btn');
            if (!btn) return;

            if (btn.classList.contains('state-scan') ||
                btn.classList.contains('state-dl') ||
                btn.classList.contains('state-done') ||
                btn.classList.contains('state-queued')) return;

            const href = link.href;
            const match = href.match(/-(\d+)$/);
            const pageNum = match ? match[1] : "000";

            pushToQueue({
                viewerUrl: href,
                pageNum: pageNum,
                btn: btn
            });
        });
    }

    function pushToQueue(task) {
        const exists = downloadQueue.some(t => t.pageNum === task.pageNum);
        if (exists) return;

        task.btn.className = 'eh-dl-btn state-queued';
        task.btn.innerText = '⏳ Queued';

        downloadQueue.push(task);
        totalAddedTasks++;
        updateManagerUI();
        processQueue();
    }

    function processQueue() {
        if (isProcessing || downloadQueue.length === 0) return;

        isProcessing = true;
        updateTimerDisplay();
        const currentTask = downloadQueue.shift();
        updateManagerUI();

        executeDownload(currentTask, () => {
            isProcessing = false;
            completedCount++;
            updateManagerUI();

            fetchImageLimits(() => {
                processQueue();
            });
        });
    }

    // === Download Task Execution ===
    function executeDownload(task, onComplete) {
        const { viewerUrl, pageNum, btn } = task;

        btn.className = 'eh-dl-btn state-scan';
        btn.innerText = '⟳ Searching...';
        currentTaskEl.innerText = `Page ${pageNum}: Searching for image...`;
        progressBarEl.style.width = '0%';
        progressTextEl.innerText = '0%';

        GM_xmlhttpRequest({
            method: "GET",
            url: viewerUrl,
            onload: function(response) {
                if (response.status !== 200) {
                    showError(btn, 'Err: HTTP ' + response.status);
                    onComplete();
                    return;
                }

                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, "text/html");

                const originalLinkNode = doc.querySelector('div#i6 a[href*="/fullimg/"]');
                const fallbackImgNode = doc.querySelector('img#img');

                let targetUrl = "";
                let resStr = "Image";
                let isOriginal = false;

                if (originalLinkNode) {
                    isOriginal = true;
                    targetUrl = originalLinkNode.href;
                    const linkText = originalLinkNode.textContent || "";
                    const resMatch = linkText.match(/(\d+\s*x\s*\d+)/);
                    resStr = resMatch ? resMatch[1].replace(/\s/g, '') : "Original";
                }
                else if (fallbackImgNode && fallbackImgNode.src) {
                    isOriginal = false;
                    targetUrl = fallbackImgNode.src;

                    const i2Node = doc.querySelector('#i2');
                    const i2Text = i2Node ? i2Node.textContent : "";
                    const resMatch = i2Text.match(/(\d+\s*x\s*\d+)/);
                    resStr = resMatch ? resMatch[1].replace(/\s/g, '') : "MaxRes";
                }
                else {
                    showError(btn, 'Err: File not found');
                    onComplete();
                    return;
                }

                const ext = getExtension(targetUrl);
                const title = getGalleryTitle();
                const paddedNum = String(pageNum).padStart(3, '0');
                const filename = `${title} - ${paddedNum}.${ext}`;

                const labelTag = isOriginal ? resStr : `${resStr} [Res]`;

                btn.className = 'eh-dl-btn state-dl';
                btn.innerText = `↓ ${labelTag}...`;
                currentTaskEl.innerText = `Page ${pageNum} (${labelTag})`;

                GM_xmlhttpRequest({
                    method: "GET",
                    url: targetUrl,
                    responseType: "blob",
                    headers: {
                        "Referer": viewerUrl
                    },
                    onprogress: function(progress) {
                        if (progress.lengthComputable) {
                            const percent = Math.round((progress.loaded / progress.total) * 100);
                            progressBarEl.style.width = percent + '%';
                            progressTextEl.innerText = percent + '%';
                            btn.innerText = `↓ ${percent}%`;
                        }
                    },
                    onload: function(blobRes) {
                        if (blobRes.status === 200) {
                            const blob = blobRes.response;

                            let actualSize = "";
                            if (blob.size > 1024 * 1024) {
                                actualSize = (blob.size / (1024 * 1024)).toFixed(2) + " MB";
                            } else {
                                actualSize = (blob.size / 1024).toFixed(0) + " KB";
                            }

                            const objectUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = objectUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();

                            setTimeout(() => {
                                document.body.removeChild(a);
                                window.URL.revokeObjectURL(objectUrl);
                            }, 150);

                            btn.className = 'eh-dl-btn state-done';
                            btn.innerText = `✓ ${labelTag} (${actualSize})`;

                        } else {
                            showError(btn, 'Err: ' + blobRes.status);
                        }
                        onComplete();
                    },
                    onerror: function(err) {
                        console.error("[EH DL Error]:", err);
                        showError(btn, 'Err: Hath Node');
                        onComplete();
                    }
                });
            },
            onerror: function() {
                showError(btn, 'Err: Connection');
                onComplete();
            }
        });
    }

    // === Initialization ===
    function init() {
        const items = document.querySelectorAll('#gdt > a');
        if (items.length === 0) return;

        createControlBarUI();
        createManagerUI();
        fetchImageLimits();
        initIdlePolling();

        items.forEach((link) => {
            const href = link.href;
            const match = href.match(/-(\d+)$/);
            const pageNum = match ? match[1] : "000";

            link.setAttribute('target', '_blank');
            link.style.position = 'relative';
            link.style.display = 'inline-block';

            const btn = document.createElement('div');
            btn.className = 'eh-dl-btn';
            btn.innerText = '⬇ Download';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (btn.classList.contains('state-scan') ||
                    btn.classList.contains('state-dl') ||
                    btn.classList.contains('state-done') ||
                    btn.classList.contains('state-queued')) return;

                pushToQueue({
                    viewerUrl: href,
                    pageNum: pageNum,
                    btn: btn
                });
            });

            link.appendChild(btn);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
