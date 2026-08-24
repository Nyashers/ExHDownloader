// ==UserScript==
// @name         ExHentai Absolute Proof Downloader (Visible Timer & Viewer Support)
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  Downloads originals sequentially or from viewer. Features persistent download memory, live image hover preview (animated), front page gallery peeker (with cursor tracking & scaled sprites), quota countdown, and smooth viewer navigation.
// @author       Nyashers
// @match        *://exhentai.org/*
// @match        *://e-hentai.org/*
// @match        *://*.e-hentai.org/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // === Native ExHentai Matte Dark Styling with Smooth Animations & Pixel-Perfect Alignment ===
    GM_addStyle(`
        /* Popover Entrance Animations */
        @keyframes ehFadeScaleIn {
            0% {
                opacity: 0;
                transform: scale(0.97);
            }
            100% {
                opacity: 1;
                transform: scale(1);
            }
        }

        /* Shimmer Loading Animation for Skeletons */
        @keyframes ehShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }

        /* Top Control Bar (Gallery Page & List Pages) */
        #eh-top-control-bar {
            background: #34353b;
            border: 1px solid #4f535b;
            border-radius: 4px;
            padding: 7px 12px;
            margin: 10px auto;
            max-width: 1212px;
            width: calc(100% - 20px);
            box-sizing: border-box;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            color: #edebdf;
            font-size: 12px;
        }

        .eh-top-left {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
        }

        .eh-top-right {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 11px;
            color: #a0a0a0;
            font-weight: normal;
        }

        /* Matte Solid Buttons with Smooth Transition */
        .eh-top-btn {
            background: #2c2d32;
            color: #edebdf;
            border: 1px solid #4f535b;
            border-radius: 3px;
            height: 26px;
            padding: 0 11px;
            box-sizing: border-box;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            line-height: 1;
        }

        .eh-top-btn:hover {
            background: #4f535b;
            color: #ffffff;
            border-color: #72767d;
            transform: translateY(-1px);
        }

        .eh-top-btn:active {
            background: #202124;
            transform: translateY(0);
        }

        .eh-top-btn.eh-btn-danger {
            background: #3a2222;
            border-color: #822e2e;
            color: #ff9b9b;
        }

        .eh-top-btn.eh-btn-danger:hover {
            background: #822e2e;
            color: #ffffff;
            border-color: #a93226;
        }

        /* Pixel-Perfect Aligned Checkbox Capsules */
        .eh-checkbox-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            cursor: pointer;
            user-select: none;
            font-size: 11.5px;
            color: #edebdf;
            background: #2c2d32;
            height: 26px;
            padding: 0 9px;
            box-sizing: border-box;
            border-radius: 3px;
            border: 1px solid #4f535b;
            line-height: 1;
            vertical-align: middle;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .eh-checkbox-label:hover {
            color: #ffffff;
            border-color: #72767d;
            background: #3a3b42;
        }

        .eh-checkbox-label input[type="checkbox"] {
            margin: 0;
            padding: 0;
            cursor: pointer;
            width: 13px;
            height: 13px;
            accent-color: #3498db;
            display: inline-block;
            vertical-align: middle;
            flex-shrink: 0;
        }

        .eh-checkbox-label span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            line-height: 13px;
            vertical-align: middle;
            user-select: none;
        }

        /* Quota & Info Badges */
        .eh-quota-badge {
            background: #18191c;
            border: 1px solid #4f535b;
            border-radius: 3px;
            height: 26px;
            padding: 0 9px;
            box-sizing: border-box;
            font-size: 11px;
            color: #a0a0a0;
            display: inline-flex;
            align-items: center;
            line-height: 1;
        }

        .eh-quota-badge b {
            color: #58d68d;
            font-weight: bold;
            margin: 0 2px;
        }

        .eh-quota-diff {
            color: #ff6b6b;
            font-weight: bold;
            margin-left: 4px;
        }

        .eh-timer-badge {
            color: #a0a0a0;
            font-size: 10.5px;
            margin-left: 8px;
            padding-left: 8px;
            border-left: 1px solid #4f535b;
            white-space: nowrap;
        }

        .eh-saved-count-badge {
            background: #18281e;
            border: 1px solid #27ae60;
            border-radius: 3px;
            height: 26px;
            padding: 0 9px;
            box-sizing: border-box;
            font-size: 11px;
            color: #58d68d;
            font-weight: bold;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            line-height: 1;
        }

        /* Clean Thumbnail Download Buttons */
        .eh-dl-btn {
            position: absolute;
            top: 6px;
            left: 6px;
            background: rgba(28, 29, 33, 0.92);
            color: #edebdf;
            border: 1px solid #4f535b;
            border-radius: 3px;
            padding: 3px 8px;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            z-index: 100;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
            user-select: none;
            white-space: nowrap;
        }

        .eh-dl-btn:hover {
            background: #4f535b;
            color: #ffffff;
            border-color: #3498db;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
        }

        .eh-dl-btn.state-saved {
            color: #58d68d;
            border-color: #27ae60;
            background: rgba(16, 40, 24, 0.94);
        }
        .eh-dl-btn.state-saved:hover {
            background: #1a4d2c;
            border-color: #58d68d;
            color: #ffffff;
        }

        .eh-dl-btn.state-queued {
            color: #f39c12;
            border-color: #d39e00;
            background: rgba(48, 36, 12, 0.94);
        }
        .eh-dl-btn.state-queued:hover {
            color: #ff6b6b;
            border-color: #c0392b;
            background: #441818;
        }
        .eh-dl-btn.state-scan {
            color: #00bcd4;
            border-color: #00838f;
            background: rgba(16, 40, 48, 0.94);
        }
        .eh-dl-btn.state-dl {
            color: #3498db;
            border-color: #1f618d;
            background: rgba(16, 32, 48, 0.94);
        }
        .eh-dl-btn.state-done {
            color: #58d68d;
            border-color: #27ae60;
            background: rgba(16, 45, 26, 0.94);
        }
        .eh-dl-btn.state-err {
            color: #ff6b6b;
            border-color: #c0392b;
            background: rgba(51, 18, 18, 0.94);
        }

        /* Download Manager Floating Overlay */
        #eh-dl-manager {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 360px;
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
            animation: ehFadeScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
        .eh-mgr-header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .eh-mgr-stop-btn {
            background: #922b21;
            color: #ffffff;
            border: 1px solid #c0392b;
            border-radius: 3px;
            padding: 2px 7px;
            font-size: 10px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .eh-mgr-stop-btn:hover {
            background: #c0392b;
        }
        .eh-mgr-body {
            padding: 12px;
            max-height: 280px;
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
            transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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
        .eh-mgr-queue-list {
            margin-top: 10px;
            border-top: 1px solid #4f535b;
            padding-top: 8px;
            font-size: 11px;
            color: #a0a0a0;
        }
        .eh-mgr-queue-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 3px 0;
            white-space: nowrap;
        }
        .eh-mgr-queue-item:hover {
            color: #ffffff;
        }
        .eh-queue-item-remove {
            color: #ff6b6b;
            cursor: pointer;
            margin-left: 6px;
            padding: 0 4px;
            font-weight: bold;
        }
        .eh-queue-item-remove:hover {
            color: #ff3333;
        }

        /* Control Bar on Viewer Page (/s/*) */
        #eh-viewer-control-bar {
            background: #34353b;
            border: 1px solid #4f535b;
            border-radius: 4px;
            padding: 7px 12px;
            margin: 10px auto;
            max-width: 950px;
            width: calc(100% - 20px);
            box-sizing: border-box;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            color: #edebdf;
            font-size: 12px;
        }

        .eh-viewer-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .eh-viewer-nav-btn {
            background: #2c2d32;
            color: #edebdf;
            border: 1px solid #4f535b;
            border-radius: 3px;
            padding: 5px 12px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            text-decoration: none;
            white-space: nowrap;
        }

        .eh-viewer-nav-btn:hover {
            background: #4f535b;
            color: #ffffff;
            border-color: #72767d;
            transform: translateY(-1px);
        }

        .eh-viewer-nav-btn.disabled {
            opacity: 0.35;
            pointer-events: none;
            cursor: default;
            transform: none;
        }

        .eh-viewer-btn {
            background: #2c2d32;
            color: #edebdf;
            border: 1px solid #4f535b;
            border-radius: 3px;
            padding: 5px 12px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
        }

        .eh-viewer-btn:hover {
            background: #4f535b;
            color: #ffffff;
            border-color: #72767d;
            transform: translateY(-1px);
        }

        .eh-viewer-btn.state-saved {
            background: #18281e;
            border-color: #27ae60;
            color: #58d68d;
        }
        .eh-viewer-btn.state-saved:hover {
            background: #1a4d2c;
            border-color: #58d68d;
            color: #ffffff;
        }

        .eh-viewer-btn.state-dl {
            background: #102030;
            border-color: #1f618d;
            color: #3498db;
        }
        .eh-viewer-btn.state-done {
            background: #102d1a;
            border-color: #27ae60;
            color: #58d68d;
        }
        .eh-viewer-btn.state-err {
            background: #331212;
            border-color: #c0392b;
            color: #ff6b6b;
        }

        .eh-viewer-cancel-btn {
            background: #3a2222;
            border: 1px solid #822e2e;
            color: #ff9b9b;
            border-radius: 3px;
            padding: 5px 10px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            display: none;
            white-space: nowrap;
            transition: all 0.15s ease;
        }

        .eh-viewer-cancel-btn:hover {
            background: #822e2e;
            color: #ffffff;
        }

        /* === Image Hover Preview Popover in Gallery (/g/*) === */
        #eh-image-preview-popup {
            position: fixed;
            z-index: 100000;
            background: #2c2d32;
            border: 1px solid #5c5c5c;
            border-radius: 4px;
            padding: 8px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.92);
            display: none;
            pointer-events: none;
            max-width: 90vw;
            max-height: 85vh;
            min-width: 240px;
            min-height: 320px;
            box-sizing: border-box;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            animation: ehFadeScaleIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        #eh-image-preview-popup.loaded {
            min-width: auto;
            min-height: auto;
        }

        #eh-image-preview-popup img {
            max-width: 580px;
            max-height: 72vh;
            border-radius: 2px;
            display: block;
            object-fit: contain;
            opacity: 0;
            transition: opacity 0.16s ease-in;
        }

        #eh-image-preview-popup img.img-ready {
            opacity: 1;
        }

        .eh-preview-caption {
            margin-top: 6px;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            font-size: 11px;
            color: #a0a0a0;
            text-align: center;
            font-weight: bold;
            white-space: nowrap;
        }

        /* === Front Page Gallery Peeker Popover === */
        #eh-gallery-peek-popup {
            position: fixed;
            z-index: 100000;
            background: #2c2d32;
            border: 1px solid #5c5c5c;
            border-radius: 4px;
            padding: 10px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.92);
            display: none;
            width: 470px;
            min-height: 376px;
            max-width: 95vw;
            box-sizing: border-box;
            font-family: Tahoma, Verdana, Arial, sans-serif;
            color: #edebdf;
            font-size: 11px;
            pointer-events: none;
            animation: ehFadeScaleIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .eh-peek-header {
            font-weight: bold;
            font-size: 12px;
            color: #ffffff;
            margin-bottom: 6px;
            line-height: 1.3;
            height: 16px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .eh-peek-meta {
            display: flex;
            gap: 12px;
            color: #a0a0a0;
            font-size: 11px;
            margin-bottom: 8px;
            border-bottom: 1px solid #4f535b;
            padding-bottom: 6px;
            height: 16px;
            box-sizing: border-box;
        }

        .eh-peek-meta span b {
            color: #58d68d;
        }

        .eh-peek-grid {
            display: grid;
            grid-template-columns: repeat(4, 105px);
            justify-content: space-between;
            gap: 6px;
            height: 304px;
            overflow: hidden;
            box-sizing: border-box;
        }

        .eh-peek-thumb {
            width: 105px;
            height: 148px;
            background-color: #18191c;
            border: 1px solid #4f535b;
            border-radius: 2px;
            overflow: hidden;
            position: relative;
            display: flex;
            align-items: flex-start;
            justify-content: flex-start;
            box-sizing: border-box;
        }

        .eh-peek-thumb.skeleton {
            background: linear-gradient(90deg, #1c1d21 25%, #2a2b30 50%, #1c1d21 75%);
            background-size: 200% 100%;
            animation: ehShimmer 1.4s infinite linear;
            border-color: #38393e;
        }

        .eh-preview-spinner {
            color: #888;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: Tahoma, Verdana, Arial, sans-serif;
        }
    `);

    // === Settings & Storage Helpers ===
    function getSetting(key, def) {
        if (typeof GM_getValue !== 'undefined') return GM_getValue(key, def);
        const val = localStorage.getItem(key);
        if (val === null) return def;
        return val === 'true';
    }

    function setSetting(key, val) {
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue(key, val);
        } else {
            localStorage.setItem(key, String(val));
        }
    }

    function getDownloadHistory() {
        let raw = null;
        if (typeof GM_getValue !== 'undefined') {
            raw = GM_getValue('eh_download_history_v1', '{}');
        } else {
            raw = localStorage.getItem('eh_download_history_v1') || '{}';
        }
        try {
            return JSON.parse(raw) || {};
        } catch (e) {
            return {};
        }
    }

    function saveDownloadHistory(historyObj) {
        const str = JSON.stringify(historyObj);
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('eh_download_history_v1', str);
        } else {
            localStorage.setItem('eh_download_history_v1', str);
        }
    }

    function markPageDownloaded(galleryId, pageNum, meta = {}) {
        if (!galleryId || !pageNum) return;
        const gid = String(galleryId);
        const pnum = String(pageNum);
        const history = getDownloadHistory();
        if (!history[gid]) history[gid] = {};
        history[gid][pnum] = {
            time: Date.now(),
            res: meta.res || '',
            size: meta.size || ''
        };
        saveDownloadHistory(history);
    }

    function isPageDownloaded(galleryId, pageNum) {
        if (!galleryId || !pageNum) return false;
        const history = getDownloadHistory();
        const gid = String(galleryId);
        const pnum = String(pageNum);
        return !!(history[gid] && history[gid][pnum]);
    }

    function getGalleryDownloadedMap(galleryId) {
        if (!galleryId) return {};
        const history = getDownloadHistory();
        return history[String(galleryId)] || {};
    }

    function getGalleryIdFromLocation() {
        const gMatch = location.pathname.match(/\/g\/(\d+)\//);
        if (gMatch) return gMatch[1];

        const sMatch = location.pathname.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
        if (sMatch) return sMatch[1];

        return null;
    }

    // === Utilities ===
    function sanitizeFilename(name) {
        return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    }

    function getGalleryTitle() {
        const en = document.querySelector('#gn');
        const jp = document.querySelector('#gj');
        const vi = document.querySelector('#i1 h1');
        const src = (en && en.textContent) || (jp && jp.textContent) || (vi && vi.textContent) || 'ExHentai_Gallery';
        return sanitizeFilename(src);
    }

    function getExtension(url) {
        const m = url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i);
        return m ? m[1].toLowerCase() : 'jpg';
    }

    function showError(btn, text) {
        btn.className = 'eh-dl-btn state-err';
        btn.innerText = text;
        setTimeout(() => {
            if (btn.classList.contains('state-err')) {
                btn.className = 'eh-dl-btn';
                btn.innerText = '⬇ Download';
            }
        }, 5000);
    }

    // === Quota & Polling ===
    let lastParsedQuotaNum = null;
    let isFetchingQuota = false;
    let idleTimerSeconds = 60;
    let idleIntervalId = null;

    function fetchImageLimits(onComplete) {
        if (isFetchingQuota) return;
        isFetchingQuota = true;

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://e-hentai.org/home.php',
            anonymous: false,
            onload(res) {
                isFetchingQuota = false;
                resetIdleTimer();
                if (res.status === 200) {
                    const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                    const p = Array.from(doc.querySelectorAll('.homebox p')).find(x => x.textContent.includes('towards your account limit of'));
                    if (p) {
                        const ss = p.querySelectorAll('strong');
                        if (ss.length >= 2) {
                            const cur = ss[0].textContent.trim();
                            const lim = ss[1].textContent.trim();
                            const n = parseInt(cur.replace(/,/g, ''), 10);
                            let diff = '';
                            if (lastParsedQuotaNum !== null && !isNaN(n) && n - lastParsedQuotaNum > 0) {
                                diff = `<span class="eh-quota-diff">(-${n - lastParsedQuotaNum})</span>`;
                            }
                            if (!isNaN(n)) lastParsedQuotaNum = n;
                            updateQuotaUI(`${cur} / ${lim}`, diff);
                            if (onComplete) onComplete();
                            return;
                        }
                    }
                    updateQuotaUI('Not found', '');
                } else {
                    updateQuotaUI('Err: HTTP ' + res.status, '');
                }
                if (onComplete) onComplete();
            },
            onerror() {
                isFetchingQuota = false;
                resetIdleTimer();
                updateQuotaUI('Network error', '');
                if (onComplete) onComplete();
            }
        });
    }

    function updateQuotaUI(str, diffHtml) {
        const t = document.querySelector('#eh-quota-value');
        const m = document.querySelector('#eh-mgr-quota');
        const v = document.querySelector('#eh-viewer-quota-value');
        if (t) t.innerHTML = `Image Limits: <b>${str}</b> ${diffHtml}`;
        if (m) m.innerHTML = `Quota: ${str} ${diffHtml}`;
        if (v) v.innerHTML = `Limits: <b>${str}</b> ${diffHtml}`;
    }

    function startIdleTimer() {
        if (idleIntervalId) clearInterval(idleIntervalId);
        idleIntervalId = setInterval(() => {
            updateTimerDisplay();
            if (document.hidden || isProcessing) return;
            if (--idleTimerSeconds <= 0) {
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
        const state = isProcessing ? { text: '⏱ [Downloading]', color: '#3498db' }
                    : document.hidden  ? { text: '⏱ [Sleeping]',    color: '#888' }
                    :                    { text: `⏱ ${idleTimerSeconds}s`, color: '#a0a0a0' };
        ['#eh-quota-timer', '#eh-viewer-quota-timer'].forEach(sel => {
            const el = document.querySelector(sel);
            if (el) {
                el.innerText = state.text;
                el.style.color = state.color;
            }
        });
    }

    function initIdlePolling() {
        startIdleTimer();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !isProcessing) fetchImageLimits();
            else updateTimerDisplay();
        });
    }

    function applyNewTabBehavior(on) {
        document.querySelectorAll('#gdt a, .gl1t a, .gl2t a, .gl3m a, .gl1e a').forEach(a => {
            if (on) {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            } else {
                a.removeAttribute('target');
                a.removeAttribute('rel');
            }
        });
    }

    // === Smart Cursor-Following Popup Positioner ===
    function positionPopupAtCursor(popup, clientX, clientY, expectedWidth, expectedHeight) {
        const pad = 16;
        let left = clientX + pad;
        let top = clientY + pad;

        const w = expectedWidth || popup.offsetWidth || 470;
        const h = expectedHeight || popup.offsetHeight || 376;

        if (left + w > window.innerWidth - 12) {
            left = clientX - w - pad;
        }
        if (left < 12) left = 12;

        if (top + h > window.innerHeight - 12) {
            top = clientY - h - pad;
        }
        if (top < 12) top = 12;

        popup.style.left = `${Math.round(left)}px`;
        popup.style.top = `${Math.round(top)}px`;
    }

    // =============================================
    // === 1. GALLERY PAGE MODE (/g/*) ===
    // =============================================
    let managerEl, currentTaskEl, progressBarEl, progressTextEl, queueListEl, queueCountEl, topCancelBtnEl;
    const imagePreviewCache = new Map();

    function refreshGallerySavedStats() {
        const gid = getGalleryIdFromLocation();
        if (!gid) return;

        const downloadedMap = getGalleryDownloadedMap(gid);
        const count = Object.keys(downloadedMap).length;

        const statBadge = document.querySelector('#eh-saved-stats');
        if (statBadge) {
            statBadge.innerHTML = `Saved: <b>${count}</b> pages`;
            statBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        document.querySelectorAll('#gdt a').forEach(link => {
            const btn = link.querySelector('.eh-dl-btn');
            if (!btn) return;
            if (btn.classList.contains('state-queued') || btn.classList.contains('state-scan') || btn.classList.contains('state-dl')) return;

            const m = link.href.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
            if (m) {
                const p = m[2];
                if (downloadedMap[p]) {
                    btn.className = 'eh-dl-btn state-saved';
                    btn.innerText = '✓ Saved';
                    btn.title = `Downloaded on ${new Date(downloadedMap[p].time).toLocaleDateString()}. Click to re-download.`;
                } else if (btn.classList.contains('state-saved')) {
                    btn.className = 'eh-dl-btn';
                    btn.innerText = '⬇ Download';
                    btn.title = '';
                }
            }
        });
    }

    function createControlBarUI() {
        const gdt = document.querySelector('#gdt');
        if (!gdt) return;
        const openInNewTab = getSetting('eh_open_in_new_tab', true);
        const hoverPreviewEnabled = getSetting('eh_hover_preview', true);

        const bar = document.createElement('div');
        bar.id = 'eh-top-control-bar';
        bar.innerHTML = `
            <div class="eh-top-left">
                <button id="eh-batch-dl-btn" class="eh-top-btn" title="Download all un-downloaded items on page (or all if all downloaded)">⬇ Download on Page</button>
                <button id="eh-cancel-all-btn" class="eh-top-btn eh-btn-danger" style="display:none;">✕ Cancel All</button>
                <label class="eh-checkbox-label" title="Controls whether clicking thumbnails opens them in a new tab">
                    <input type="checkbox" id="eh-setting-new-tab" ${openInNewTab ? 'checked' : ''}>
                    <span>Open in new tab</span>
                </label>
                <label class="eh-checkbox-label" title="Show live animated image preview when hovering over thumbnails">
                    <input type="checkbox" id="eh-setting-hover-preview" ${hoverPreviewEnabled ? 'checked' : ''}>
                    <span>🔍 Live Preview</span>
                </label>
                <div id="eh-saved-stats" class="eh-saved-count-badge" style="display:none;">
                    Saved: <b>0</b> pages
                </div>
                <div class="eh-quota-badge">
                    <span id="eh-quota-value">Image Limits: <i>Checking...</i></span>
                    <span id="eh-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div class="eh-top-right">ExH Downloader v13.1</div>
        `;
        gdt.parentNode.insertBefore(bar, gdt);

        bar.querySelector('#eh-batch-dl-btn').addEventListener('click', downloadAllVisible);
        topCancelBtnEl = bar.querySelector('#eh-cancel-all-btn');
        topCancelBtnEl.addEventListener('click', cancelAllTasks);

        const cb = bar.querySelector('#eh-setting-new-tab');
        cb.addEventListener('change', e => {
            setSetting('eh_open_in_new_tab', e.target.checked);
            applyNewTabBehavior(e.target.checked);
        });

        const hpCb = bar.querySelector('#eh-setting-hover-preview');
        hpCb.addEventListener('change', e => {
            setSetting('eh_hover_preview', e.target.checked);
        });

        applyNewTabBehavior(openInNewTab);
        refreshGallerySavedStats();
    }

    function createManagerUI() {
        managerEl = document.createElement('div');
        managerEl.id = 'eh-dl-manager';
        managerEl.innerHTML = `
            <div class="eh-mgr-header">
                <span>Download Manager</span>
                <div class="eh-mgr-header-actions">
                    <span id="eh-mgr-count">0 queued</span>
                    <button id="eh-mgr-stop-all" class="eh-mgr-stop-btn">✕ Cancel All</button>
                </div>
            </div>
            <div class="eh-mgr-body">
                <div id="eh-mgr-title" class="eh-mgr-title">Idle...</div>
                <div class="eh-progress-bg">
                    <div id="eh-progress-fill" class="eh-progress-fill"></div>
                    <div id="eh-progress-text" class="eh-progress-text">0%</div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:#888;">
                    <span id="eh-mgr-quota">Quota: ...</span>
                    <span id="eh-mgr-total-progress">Processed: 0/0</span>
                </div>
                <div id="eh-mgr-queue-list" class="eh-mgr-queue-list"></div>
            </div>
        `;
        document.body.appendChild(managerEl);

        currentTaskEl  = managerEl.querySelector('#eh-mgr-title');
        progressBarEl  = managerEl.querySelector('#eh-progress-fill');
        progressTextEl = managerEl.querySelector('#eh-progress-text');
        queueListEl    = managerEl.querySelector('#eh-mgr-queue-list');
        queueCountEl   = managerEl.querySelector('#eh-mgr-count');

        managerEl.querySelector('#eh-mgr-stop-all').addEventListener('click', cancelAllTasks);
    }

    function updateManagerUI() {
        const hasWork = downloadQueue.length > 0 || isProcessing;
        if (topCancelBtnEl) topCancelBtnEl.style.display = hasWork ? 'inline-flex' : 'none';

        if (!hasWork) {
            managerEl.classList.remove('active');
            return;
        }

        managerEl.classList.add('active');
        queueCountEl.innerText = `${downloadQueue.length} queued`;

        const tp = managerEl.querySelector('#eh-mgr-total-progress');
        if (tp) tp.innerText = `Processed: ${completedCount}/${totalAddedTasks}`;

        queueListEl.innerHTML = '';
        downloadQueue.slice(0, 6).forEach(item => {
            const div = document.createElement('div');
            div.className = 'eh-mgr-queue-item';
            div.innerHTML = `<span>Page ${item.pageNum}</span><span class="eh-queue-item-remove" title="Remove">✕</span>`;
            div.querySelector('.eh-queue-item-remove').addEventListener('click', e => {
                e.stopPropagation();
                removeFromQueue(item.pageNum);
            });
            queueListEl.appendChild(div);
        });

        if (downloadQueue.length > 6) {
            const div = document.createElement('div');
            div.className = 'eh-mgr-queue-item';
            div.style.fontStyle = 'italic';
            div.innerText = `...and ${downloadQueue.length - 6} more`;
            queueListEl.appendChild(div);
        }
    }

    // === Gallery Hover Live Image Preview ===
    let previewPopupEl = null;
    let previewHoverTimeout = null;
    let activePreviewReq = null;

    function initGalleryImagePreview() {
        previewPopupEl = document.createElement('div');
        previewPopupEl.id = 'eh-image-preview-popup';
        previewPopupEl.innerHTML = `
            <div id="eh-preview-spin" class="eh-preview-spinner">⟳ Loading image...</div>
            <img id="eh-preview-img" src="" alt="Preview">
            <div id="eh-preview-caption" class="eh-preview-caption"></div>
        `;
        document.body.appendChild(previewPopupEl);

        const imgEl = previewPopupEl.querySelector('#eh-preview-img');
        const capEl = previewPopupEl.querySelector('#eh-preview-caption');
        const spinEl = previewPopupEl.querySelector('#eh-preview-spin');

        document.querySelectorAll('#gdt a').forEach(link => {
            const href = link.href;
            const m = href.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
            const pageNum = m ? m[2] : '1';

            link.addEventListener('mouseenter', (e) => {
                if (!getSetting('eh_hover_preview', true)) return;

                clearTimeout(previewHoverTimeout);
                previewHoverTimeout = setTimeout(() => {
                    showImagePreview(href, pageNum, e.clientX, e.clientY);
                }, 100);
            });

            link.addEventListener('mousemove', (e) => {
                if (previewPopupEl.style.display === 'flex') {
                    const w = previewPopupEl.offsetWidth || 260;
                    const h = previewPopupEl.offsetHeight || 340;
                    positionPopupAtCursor(previewPopupEl, e.clientX, e.clientY, w, h);
                }
            });

            link.addEventListener('mouseleave', () => {
                clearTimeout(previewHoverTimeout);
                if (activePreviewReq && typeof activePreviewReq.abort === 'function') {
                    try { activePreviewReq.abort(); } catch(e) {}
                }
                activePreviewReq = null;
                previewPopupEl.style.display = 'none';
                previewPopupEl.classList.remove('loaded');
                imgEl.classList.remove('img-ready');
                imgEl.src = '';
                spinEl.style.display = 'flex';
            });
        });

        function showImagePreview(viewerUrl, pageNum, clientX, clientY) {
            previewPopupEl.style.display = 'flex';
            capEl.innerText = `Page ${pageNum}`;
            spinEl.style.display = 'flex';
            imgEl.classList.remove('img-ready');

            positionPopupAtCursor(previewPopupEl, clientX, clientY, 260, 340);

            if (imagePreviewCache.has(viewerUrl)) {
                const cached = imagePreviewCache.get(viewerUrl);
                imgEl.src = cached.src;
                imgEl.onload = () => {
                    spinEl.style.display = 'none';
                    imgEl.classList.add('img-ready');
                    previewPopupEl.classList.add('loaded');
                };
                capEl.innerText = `Page ${pageNum} ${cached.res ? '(' + cached.res + ')' : ''}`;
                return;
            }

            activePreviewReq = GM_xmlhttpRequest({
                method: 'GET',
                url: viewerUrl,
                onload(res) {
                    if (res.status === 200) {
                        const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                        const fallbackImg = doc.querySelector('img#img');

                        let targetSrc = '';
                        let resStr = '';
                        if (fallbackImg && fallbackImg.src) {
                            targetSrc = fallbackImg.src;
                            const i2 = doc.querySelector('#i2');
                            const m = (i2 ? i2.textContent : '').match(/(\d+\s*x\s*\d+)/);
                            resStr = m ? m[1].replace(/\s/g, '') : '';
                        }

                        if (targetSrc) {
                            imagePreviewCache.set(viewerUrl, { src: targetSrc, res: resStr });
                            if (previewPopupEl.style.display === 'flex') {
                                imgEl.src = targetSrc;
                                imgEl.onload = () => {
                                    spinEl.style.display = 'none';
                                    imgEl.classList.add('img-ready');
                                    previewPopupEl.classList.add('loaded');
                                };
                                capEl.innerText = `Page ${pageNum} ${resStr ? '(' + resStr + ')' : ''}`;
                            }
                        }
                    }
                }
            });
        }
    }

    // === Gallery Queue Logic ===
    const downloadQueue = [];
    let isProcessing = false;
    let activeXhrRequest = null;
    let activeTask = null;
    let completedCount = 0;
    let totalAddedTasks = 0;

    window.addEventListener('beforeunload', e => {
        if (isProcessing || downloadQueue.length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    function downloadAllVisible() {
        const gid = getGalleryIdFromLocation();
        const downloadedMap = getGalleryDownloadedMap(gid);
        const items = Array.from(document.querySelectorAll('#gdt a'));

        let targets = items.filter(link => {
            const m = link.href.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
            const p = m ? m[2] : null;
            return p && !downloadedMap[p];
        });

        if (targets.length === 0) targets = items;

        targets.forEach(link => {
            const btn = link.querySelector('.eh-dl-btn');
            if (!btn || btn.classList.contains('state-scan') || btn.classList.contains('state-dl') ||
                btn.classList.contains('state-queued')) return;

            const m = link.href.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
            const pageNum = m ? m[2] : '000';
            const galleryId = m ? m[1] : gid;

            pushToQueue({ viewerUrl: link.href, galleryId, pageNum, btn });
        });
    }

    function pushToQueue(task) {
        if (downloadQueue.some(t => t.pageNum === task.pageNum)) return;
        task.btn.className = 'eh-dl-btn state-queued';
        task.btn.innerText = '⏳ Queued (✕)';
        task.btn.title = 'Click to remove from queue';

        downloadQueue.push(task);
        totalAddedTasks++;
        updateManagerUI();
        processQueue();
    }

    function removeFromQueue(pageNum) {
        const i = downloadQueue.findIndex(t => t.pageNum === pageNum);
        if (i !== -1) {
            const [r] = downloadQueue.splice(i, 1);
            if (r.btn) {
                const gid = r.galleryId || getGalleryIdFromLocation();
                if (isPageDownloaded(gid, r.pageNum)) {
                    r.btn.className = 'eh-dl-btn state-saved';
                    r.btn.innerText = '✓ Saved';
                } else {
                    r.btn.className = 'eh-dl-btn';
                    r.btn.innerText = '⬇ Download';
                }
                r.btn.title = '';
            }
            updateManagerUI();
        }
    }

    function cancelAllTasks() {
        if (activeXhrRequest && typeof activeXhrRequest.abort === 'function') {
            try { activeXhrRequest.abort(); } catch(e) {}
        }
        activeXhrRequest = null;

        const gid = getGalleryIdFromLocation();
        if (activeTask && activeTask.btn) {
            if (isPageDownloaded(gid, activeTask.pageNum)) {
                activeTask.btn.className = 'eh-dl-btn state-saved';
                activeTask.btn.innerText = '✓ Saved';
            } else {
                activeTask.btn.className = 'eh-dl-btn';
                activeTask.btn.innerText = '⬇ Download';
            }
            activeTask.btn.title = '';
        }
        activeTask = null;

        downloadQueue.forEach(t => {
            if (t.btn) {
                if (isPageDownloaded(gid, t.pageNum)) {
                    t.btn.className = 'eh-dl-btn state-saved';
                    t.btn.innerText = '✓ Saved';
                } else {
                    t.btn.className = 'eh-dl-btn';
                    t.btn.innerText = '⬇ Download';
                }
                t.btn.title = '';
            }
        });
        downloadQueue.length = 0;

        isProcessing = false;
        if (progressBarEl) progressBarEl.style.width = '0%';
        if (progressTextEl) progressTextEl.innerText = '0%';
        if (currentTaskEl) currentTaskEl.innerText = 'Cancelled';

        updateTimerDisplay();
        updateManagerUI();
    }

    function processQueue() {
        if (isProcessing || downloadQueue.length === 0) return;

        isProcessing = true;
        updateTimerDisplay();
        activeTask = downloadQueue.shift();
        updateManagerUI();

        executeDownload(activeTask, wasCancelled => {
            isProcessing = false;
            activeTask = null;
            activeXhrRequest = null;

            if (!wasCancelled) completedCount++;
            updateManagerUI();

            fetchImageLimits(() => processQueue());
        });
    }

    function executeDownload(task, onComplete) {
        const { viewerUrl, galleryId, pageNum, btn } = task;
        let cancelled = false;

        btn.className = 'eh-dl-btn state-scan';
        btn.innerText = '⟳ Searching...';
        btn.title = '';
        currentTaskEl.innerText = `Page ${pageNum}: Searching...`;
        progressBarEl.style.width = '0%';
        progressTextEl.innerText = '0%';

        activeXhrRequest = GM_xmlhttpRequest({
            method: 'GET',
            url: viewerUrl,
            onload(response) {
                if (cancelled) return;
                if (response.status !== 200) {
                    showError(btn, 'Err: HTTP ' + response.status);
                    onComplete(false);
                    return;
                }

                const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                const origNode = doc.querySelector('div#i6 a[href*="/fullimg/"]');
                const fallback = doc.querySelector('img#img');

                let targetUrl = '', resStr = 'Image', isOriginal = false;
                if (origNode) {
                    isOriginal = true;
                    targetUrl = origNode.href;
                    const m = (origNode.textContent || '').match(/(\d+\s*x\s*\d+)/);
                    resStr = m ? m[1].replace(/\s/g, '') : 'Original';
                } else if (fallback && fallback.src) {
                    targetUrl = fallback.src;
                    const i2 = doc.querySelector('#i2');
                    const m = (i2 ? i2.textContent : '').match(/(\d+\s*x\s*\d+)/);
                    resStr = m ? m[1].replace(/\s/g, '') : 'MaxRes';
                } else {
                    showError(btn, 'Err: File not found');
                    onComplete(false);
                    return;
                }

                const ext = getExtension(targetUrl);
                const filename = `${getGalleryTitle()} - ${String(pageNum).padStart(3,'0')}.${ext}`;
                const label = isOriginal ? resStr : `${resStr} [Res]`;

                btn.className = 'eh-dl-btn state-dl';
                btn.innerText = `↓ ${label}...`;
                currentTaskEl.innerText = `Page ${pageNum} (${label})`;

                activeXhrRequest = GM_xmlhttpRequest({
                    method: 'GET',
                    url: targetUrl,
                    responseType: 'blob',
                    headers: { 'Referer': viewerUrl },
                    onprogress(p) {
                        if (cancelled || !p.lengthComputable) return;
                        const pct = Math.round(p.loaded / p.total * 100);
                        progressBarEl.style.width = pct + '%';
                        progressTextEl.innerText = pct + '%';
                        btn.innerText = `↓ ${pct}%`;
                    },
                    onload(blobRes) {
                        if (cancelled) return;
                        if (blobRes.status === 200) {
                            const blob = blobRes.response;
                            const sz = blob.size > 1024 * 1024
                                ? (blob.size / (1024 * 1024)).toFixed(2) + ' MB'
                                : (blob.size / 1024).toFixed(0) + ' KB';

                            const url2 = URL.createObjectURL(blob);
                            const a = Object.assign(document.createElement('a'), {
                                style: 'display:none',
                                href: url2,
                                download: filename
                            });
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url2);
                            }, 200);

                            markPageDownloaded(galleryId || getGalleryIdFromLocation(), pageNum, { res: label, size: sz });
                            refreshGallerySavedStats();

                            btn.className = 'eh-dl-btn state-saved';
                            btn.innerText = `✓ Saved (${sz})`;
                        } else {
                            showError(btn, 'Err: ' + blobRes.status);
                        }
                        onComplete(false);
                    },
                    onerror(err) {
                        if (cancelled) return;
                        console.error('[EH DL]', err);
                        showError(btn, 'Err: Network/Hath');
                        onComplete(false);
                    },
                    onabort() {
                        cancelled = true;
                        onComplete(true);
                    }
                });
            },
            onerror() {
                if (cancelled) return;
                showError(btn, 'Err: Connection');
                onComplete(false);
            },
            onabort() {
                cancelled = true;
                onComplete(true);
            }
        });
    }

    function initGalleryPage() {
        const items = document.querySelectorAll('#gdt a');
        if (items.length === 0) return;

        createControlBarUI();
        createManagerUI();
        fetchImageLimits();
        initIdlePolling();
        initGalleryImagePreview();

        const gid = getGalleryIdFromLocation();
        const downloadedMap = getGalleryDownloadedMap(gid);

        items.forEach(link => {
            const m = link.href.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
            const pageNum = m ? m[2] : '000';
            const galleryId = m ? m[1] : gid;

            link.style.position = 'relative';
            link.style.display = 'inline-block';

            const btn = document.createElement('div');
            if (downloadedMap[pageNum]) {
                btn.className = 'eh-dl-btn state-saved';
                btn.innerText = '✓ Saved';
                btn.title = `Downloaded on ${new Date(downloadedMap[pageNum].time).toLocaleDateString()}. Click to re-download.`;
            } else {
                btn.className = 'eh-dl-btn';
                btn.innerText = '⬇ Download';
            }

            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();

                if (btn.classList.contains('state-queued')) {
                    removeFromQueue(pageNum);
                    return;
                }

                if (btn.classList.contains('state-scan') || btn.classList.contains('state-dl')) return;

                pushToQueue({ viewerUrl: link.href, galleryId, pageNum, btn });
            });

            link.appendChild(btn);
        });
    }

    // =============================================
    // === 2. SINGLE IMAGE VIEWER PAGE MODE (/s/*) ===
    // =============================================
    let viewerActiveXhr = null;

    function initViewerPage() {
        if (document.getElementById('eh-viewer-control-bar')) return;

        const i1 = document.querySelector('#i1');
        const img = document.querySelector('img#img');
        if (!i1 || !img) return;

        fetchImageLimits();
        if (!idleIntervalId) initIdlePolling();

        const bar = document.createElement('div');
        bar.id = 'eh-viewer-control-bar';
        bar.innerHTML = `
            <div class="eh-viewer-left">
                <a id="eh-vp" class="eh-viewer-nav-btn" href="#" title="Previous (← / A)">◀ Prev</a>
                <a id="eh-vn" class="eh-viewer-nav-btn" href="#" title="Next (→ / D)">Next ▶</a>
                <div style="width:1px;height:18px;background:#4f535b;margin:0 2px;flex-shrink:0;"></div>
                <button id="eh-vdl" class="eh-viewer-btn">⬇ Download Original</button>
                <button id="eh-vcancel" class="eh-viewer-cancel-btn">✕ Cancel</button>
                <div class="eh-quota-badge">
                    <span id="eh-viewer-quota-value">Limits: <i>Checking...</i></span>
                    <span id="eh-viewer-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div id="eh-vpage-info" style="font-size:11px;color:#a0a0a0;white-space:nowrap;">Page ...</div>
        `;
        i1.parentNode.insertBefore(bar, i1);

        const prevBtn   = bar.querySelector('#eh-vp');
        const nextBtn   = bar.querySelector('#eh-vn');
        const dlBtn     = bar.querySelector('#eh-vdl');
        const cancelBtn = bar.querySelector('#eh-vcancel');
        const pageInfo  = bar.querySelector('#eh-vpage-info');

        function updateViewerUI() {
            const i2 = document.querySelector('#i2');
            const i2Text = i2 ? i2.innerText : '';
            const match = i2Text.match(/(\d+)\s*\/\s*(\d+)/);
            const currentPage = match ? parseInt(match[1], 10) : 1;
            const totalPages = match ? parseInt(match[2], 10) : 1;

            const gid = getGalleryIdFromLocation();
            const isSaved = isPageDownloaded(gid, currentPage);

            const origNode = document.querySelector('div#i6 a[href*="/fullimg/"]');
            const hasOriginal = !!origNode;
            const origText = origNode ? origNode.textContent : '';
            const resMatch = origText.match(/(\d+\s*x\s*\d+)/);
            const resStr = resMatch ? ` (${resMatch[1].replace(/\s/g, '')})` : '';

            const prevA = document.querySelector('a#prev');
            const nextA = document.querySelector('a#next');

            pageInfo.innerText = `Page ${currentPage} / ${totalPages} • ExH Downloader v13.1`;

            prevBtn.classList.toggle('disabled', currentPage <= 1);
            prevBtn.href = prevA ? prevA.href : '#';

            nextBtn.classList.toggle('disabled', currentPage >= totalPages);
            nextBtn.href = nextA ? nextA.href : '#';

            if (!dlBtn.classList.contains('state-dl')) {
                if (isSaved) {
                    dlBtn.className = 'eh-viewer-btn state-saved';
                    dlBtn.innerText = `✓ Saved${resStr} (Re-download)`;
                } else {
                    dlBtn.className = 'eh-viewer-btn';
                    dlBtn.innerText = hasOriginal ? `⬇ Download Original${resStr}` : '⬇ Download Image';
                }
                cancelBtn.style.display = 'none';
            }
        }

        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const i2Text = document.querySelector('#i2')?.innerText || '';
            const match = i2Text.match(/(\d+)\s*\/\s*(\d+)/);
            const currentPage = match ? parseInt(match[1], 10) : 1;
            if (currentPage > 1) {
                const prevA = document.querySelector('a#prev');
                if (prevA) {
                    prevA.click();
                } else {
                    window.location.assign(prevBtn.href);
                }
            }
        });

        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const i2Text = document.querySelector('#i2')?.innerText || '';
            const match = i2Text.match(/(\d+)\s*\/\s*(\d+)/);
            const currentPage = match ? parseInt(match[1], 10) : 1;
            const totalPages = match ? parseInt(match[2], 10) : 1;
            if (currentPage < totalPages) {
                const nextA = document.querySelector('a#next');
                if (nextA) {
                    nextA.click();
                } else {
                    window.location.assign(nextBtn.href);
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                prevBtn.click();
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                nextBtn.click();
            }
        });

        cancelBtn.addEventListener('click', () => {
            if (viewerActiveXhr && typeof viewerActiveXhr.abort === 'function') {
                viewerActiveXhr.abort();
            }
            viewerActiveXhr = null;
            isProcessing = false;
            cancelBtn.style.display = 'none';
            updateViewerUI();
            updateTimerDisplay();
        });

        dlBtn.addEventListener('click', () => {
            if (dlBtn.classList.contains('state-dl')) return;

            const i2 = document.querySelector('#i2');
            const i2Text = i2 ? i2.innerText : '';
            const match = i2Text.match(/(\d+)\s*\/\s*(\d+)/);
            const pageNum = match ? match[1] : '1';
            const gid = getGalleryIdFromLocation();

            const origNode = document.querySelector('div#i6 a[href*="/fullimg/"]');
            const fallbackImg = document.querySelector('img#img');

            let targetUrl = '', resStr = 'Original';
            if (origNode && origNode.href) {
                targetUrl = origNode.href;
                const m = (origNode.textContent || '').match(/(\d+\s*x\s*\d+)/);
                resStr = m ? m[1].replace(/\s/g, '') : 'Original';
            } else if (fallbackImg && fallbackImg.src) {
                targetUrl = fallbackImg.src;
                const m = (i2 ? i2.textContent : '').match(/(\d+\s*x\s*\d+)/);
                resStr = m ? m[1].replace(/\s/g, '') : 'Standard';
            } else {
                alert('Image source URL could not be found.');
                return;
            }

            const ext = getExtension(targetUrl);
            const title = getGalleryTitle();
            const filename = `${title} - ${String(pageNum).padStart(3, '0')}.${ext}`;

            dlBtn.className = 'eh-viewer-btn state-dl';
            dlBtn.innerText = `↓ 0% (${resStr})...`;
            cancelBtn.style.display = 'inline-block';
            isProcessing = true;
            updateTimerDisplay();

            viewerActiveXhr = GM_xmlhttpRequest({
                method: 'GET',
                url: targetUrl,
                responseType: 'blob',
                headers: { 'Referer': location.href },
                onprogress(p) {
                    if (!p.lengthComputable) return;
                    const pct = Math.round((p.loaded / p.total) * 100);
                    const mb = p.total > 1024 * 1024
                        ? ` ${(p.loaded / (1024 * 1024)).toFixed(1)}/${(p.total / (1024 * 1024)).toFixed(1)} MB`
                        : '';
                    dlBtn.innerText = `↓ ${pct}%${mb}`;
                },
                onload(blobRes) {
                    isProcessing = false;
                    cancelBtn.style.display = 'none';
                    updateTimerDisplay();

                    if (blobRes.status === 200) {
                        const blob = blobRes.response;
                        const sz = blob.size > 1024 * 1024
                            ? (blob.size / (1024 * 1024)).toFixed(2) + ' MB'
                            : (blob.size / 1024).toFixed(0) + ' KB';

                        const oUrl = URL.createObjectURL(blob);
                        const a = Object.assign(document.createElement('a'), {
                            style: 'display:none',
                            href: oUrl,
                            download: filename
                        });
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(oUrl);
                        }, 200);

                        markPageDownloaded(gid, pageNum, { res: resStr, size: sz });

                        dlBtn.className = 'eh-viewer-btn state-saved';
                        dlBtn.innerText = `✓ Saved (${sz})`;
                        fetchImageLimits();
                    } else {
                        dlBtn.className = 'eh-viewer-btn state-err';
                        dlBtn.innerText = `Err: HTTP ${blobRes.status}`;
                    }
                },
                onerror() {
                    isProcessing = false;
                    cancelBtn.style.display = 'none';
                    updateTimerDisplay();
                    dlBtn.className = 'eh-viewer-btn state-err';
                    dlBtn.innerText = 'Err: Network';
                },
                onabort() {
                    isProcessing = false;
                    cancelBtn.style.display = 'none';
                    updateTimerDisplay();
                }
            });
        });

        const observer = new MutationObserver(() => {
            updateViewerUI();
        });

        const i2El = document.querySelector('#i2');
        if (i2El) observer.observe(i2El, { childList: true, subtree: true, characterData: true });

        const i6El = document.querySelector('#i6');
        if (i6El) observer.observe(i6El, { childList: true, subtree: true, characterData: true });

        updateViewerUI();
    }

    // =============================================
    // === 3. FRONT PAGE & SEARCH GALLERY PEEKER ===
    // =============================================
    const galleryPeekCache = new Map();
    let peekPopupEl = null;
    let peekHoverTimeout = null;
    let activePeekReq = null;

    function initFrontPagePeeker() {
        peekPopupEl = document.createElement('div');
        peekPopupEl.id = 'eh-gallery-peek-popup';
        peekPopupEl.innerHTML = `
            <div id="eh-peek-title" class="eh-peek-header">Loading gallery...</div>
            <div id="eh-peek-meta" class="eh-peek-meta"><span>Fetching thumbnails...</span></div>
            <div id="eh-peek-grid" class="eh-peek-grid">
                ${Array(8).fill('<div class="eh-peek-thumb skeleton"></div>').join('')}
            </div>
        `;
        document.body.appendChild(peekPopupEl);

        const titleEl = peekPopupEl.querySelector('#eh-peek-title');
        const metaEl = peekPopupEl.querySelector('#eh-peek-meta');
        const gridEl = peekPopupEl.querySelector('#eh-peek-grid');

        createFrontPageBar();

        const galleryLinks = Array.from(document.querySelectorAll('a[href*="/g/"]')).filter(a => {
            return a.href.match(/\/g\/\d+\/[0-9a-fA-F]+/);
        });

        galleryLinks.forEach(link => {
            const galleryUrl = link.href.match(/(https?:\/\/[^\/]+\/g\/\d+\/[0-9a-fA-F]+\/)/)?.[1] || link.href;

            link.addEventListener('mouseenter', (e) => {
                if (!getSetting('eh_gallery_peeker', true)) return;

                clearTimeout(peekHoverTimeout);
                peekHoverTimeout = setTimeout(() => {
                    showGalleryPeek(galleryUrl, e.clientX, e.clientY);
                }, 100);
            });

            link.addEventListener('mousemove', (e) => {
                if (peekPopupEl.style.display === 'block') {
                    positionPopupAtCursor(peekPopupEl, e.clientX, e.clientY, 470, 376);
                }
            });

            link.addEventListener('mouseleave', () => {
                clearTimeout(peekHoverTimeout);
                if (activePeekReq && typeof activePeekReq.abort === 'function') {
                    try { activePeekReq.abort(); } catch(e) {}
                }
                activePeekReq = null;
                peekPopupEl.style.display = 'none';
            });
        });

        function showGalleryPeek(url, clientX, clientY) {
            titleEl.innerText = 'Loading gallery...';
            metaEl.innerHTML = '<span>Fetching thumbnails...</span>';
            gridEl.innerHTML = Array(8).fill('<div class="eh-peek-thumb skeleton"></div>').join('');
            peekPopupEl.style.display = 'block';

            positionPopupAtCursor(peekPopupEl, clientX, clientY, 470, 376);

            if (galleryPeekCache.has(url)) {
                const data = galleryPeekCache.get(url);
                renderPeekData(data);
                return;
            }

            activePeekReq = GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload(res) {
                    if (res.status === 200) {
                        const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                        const titleEn = doc.querySelector('#gn')?.textContent || '';
                        const titleJp = doc.querySelector('#gj')?.textContent || '';
                        const title = titleEn || titleJp || 'ExHentai Gallery';

                        const lengthRow = Array.from(doc.querySelectorAll('#gdd tr')).find(tr => tr.textContent.includes('Length:'));
                        const lengthText = lengthRow ? lengthRow.querySelector('.gdt2')?.textContent : '';

                        const catEl = doc.querySelector('.cs') || doc.querySelector('#gdc');
                        const category = catEl ? catEl.textContent.trim() : '';

                        // Extract sprite/image thumbnail info accurately from #gdt
                        const thumbNodes = Array.from(doc.querySelectorAll('#gdt .gdtm, #gdt .gdtl, #gdt > a, #gdt > div'));
                        const thumbs = [];

                        for (const node of thumbNodes) {
                            const bgEl = node.querySelector('div[style*="background"], div[title*="Page"], div[style*="url"]') ||
                                         (node.getAttribute('style')?.includes('background') ? node : null);
                            const imgEl = node.querySelector('img');

                            if (bgEl) {
                                const style = bgEl.getAttribute('style') || '';
                                const wMatch = style.match(/width:\s*(\d+)px/i);
                                const hMatch = style.match(/height:\s*(\d+)px/i);
                                const w = wMatch ? parseInt(wMatch[1], 10) : 200;
                                const h = hMatch ? parseInt(hMatch[1], 10) : 280;

                                thumbs.push({ type: 'sprite', style, w, h });
                            } else if (imgEl && imgEl.src) {
                                thumbs.push({ type: 'img', src: imgEl.src });
                            }
                            if (thumbs.length >= 8) break;
                        }

                        const peekData = {
                            title,
                            category,
                            lengthText,
                            thumbs
                        };

                        galleryPeekCache.set(url, peekData);
                        if (peekPopupEl.style.display === 'block') {
                            renderPeekData(peekData);
                        }
                    }
                }
            });
        }

        function renderPeekData(data) {
            titleEl.innerText = data.title;
            metaEl.innerHTML = `
                <span>Category: <b>${data.category || 'Manga'}</b></span>
                <span>Length: <b>${data.lengthText || 'Unknown'}</b></span>
            `;

            gridEl.innerHTML = '';
            data.thumbs.forEach(t => {
                const cell = document.createElement('div');
                cell.className = 'eh-peek-thumb';
                if (t.type === 'sprite') {
                    const scale = 105 / (t.w || 200);
                    const spriteDiv = document.createElement('div');
                    spriteDiv.setAttribute('style', `${t.style}; transform: scale(${scale}); transform-origin: 0 0; pointer-events: none; flex-shrink: 0;`);
                    cell.appendChild(spriteDiv);
                } else if (t.type === 'img') {
                    const img = document.createElement('img');
                    img.src = t.src;
                    img.style.cssText = 'width:100%; height:100%; object-fit:contain; display:block;';
                    cell.appendChild(img);
                }
                gridEl.appendChild(cell);
            });
        }
    }

    function createFrontPageBar() {
        if (document.getElementById('eh-top-control-bar')) return;

        const mainTable = document.querySelector('table.itg, div.itg, #searchbox');
        if (!mainTable) return;

        const openInNewTab = getSetting('eh_open_in_new_tab', true);
        const peekerEnabled = getSetting('eh_gallery_peeker', true);

        const bar = document.createElement('div');
        bar.id = 'eh-top-control-bar';
        bar.innerHTML = `
            <div class="eh-top-left">
                <label class="eh-checkbox-label" title="Controls whether clicking galleries opens them in a new tab">
                    <input type="checkbox" id="eh-setting-new-tab" ${openInNewTab ? 'checked' : ''}>
                    <span>Open in new tab</span>
                </label>
                <label class="eh-checkbox-label" title="Show floating preview with static thumbnail overview when hovering over galleries">
                    <input type="checkbox" id="eh-setting-peeker" ${peekerEnabled ? 'checked' : ''}>
                    <span>📑 Gallery Peeker</span>
                </label>
                <div class="eh-quota-badge">
                    <span id="eh-quota-value">Image Limits: <i>Checking...</i></span>
                    <span id="eh-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div class="eh-top-right">ExH Downloader v13.1</div>
        `;

        mainTable.parentNode.insertBefore(bar, mainTable);

        const cb = bar.querySelector('#eh-setting-new-tab');
        cb.addEventListener('change', e => {
            setSetting('eh_open_in_new_tab', e.target.checked);
            applyNewTabBehavior(e.target.checked);
        });

        const pcb = bar.querySelector('#eh-setting-peeker');
        pcb.addEventListener('change', e => {
            setSetting('eh_gallery_peeker', e.target.checked);
        });

        fetchImageLimits();
        initIdlePolling();
        applyNewTabBehavior(openInNewTab);
    }

    // === Entry Point / Bootstrap ===
    function bootstrap() {
        const path = window.location.pathname;
        if (path.startsWith('/s/')) {
            initViewerPage();
        } else if (path.startsWith('/g/')) {
            initGalleryPage();
        } else {
            initFrontPagePeeker();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();
