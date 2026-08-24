// ==UserScript==
// @name         ExHentai Absolute Proof Downloader (Visible Timer & Viewer Support)
// @namespace    http://tampermonkey.net/
// @version      15.6.0
// @description  Original-quality downloader for E-Hentai / ExHentai. Persistent download memory, resilient retrying queue with 509 quota detection, correct file extensions, a zero-layout-thrash animated thumbnail engine with true canvas freezing, Ctrl+Hover full image preview, gallery peeker, live image limit counter, and theme-matched native UI.
// @author       Nyashers
// @license      GPL-3.0
// @homepageURL  https://github.com/Nyashers/ExHDownloader
// @supportURL   https://github.com/Nyashers/ExHDownloader/issues
// @updateURL    https://raw.githubusercontent.com/Nyashers/ExHDownloader/main/ExHDownloader.user.js
// @downloadURL  https://raw.githubusercontent.com/Nyashers/ExHDownloader/main/ExHDownloader.user.js
// @icon         https://e-hentai.org/favicon.ico
// @match        *://exhentai.org/*
// @match        *://e-hentai.org/*
// @match        *://*.e-hentai.org/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '15.6.0';
    const REPO_URL = 'https://github.com/Nyashers/ExHDownloader';

    // =====================================================================
    // === THEME DETECTION =================================================
    // The site ships several colour schemes. Sample the real page rather
    // than hardcoding one palette, so the injected UI stays homogeneous.
    // =====================================================================
    function luminanceOf(cssColor) {
        const m = String(cssColor || '').match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(',').map(n => parseFloat(n));
        const [r, g, b, a] = parts;
        if ([r, g, b].some(v => typeof v !== 'number' || isNaN(v))) return null;
        if (parts.length > 3 && a === 0) return null; // fully transparent tells us nothing
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    function detectSiteTheme() {
        for (const el of [document.body, document.documentElement]) {
            if (!el) continue;
            const lum = luminanceOf(getComputedStyle(el).backgroundColor);
            if (lum !== null) return lum > 0.5 ? 'light' : 'dark';
        }
        return 'dark';
    }

    // ---- colour helpers for palette sampling ----------------------------
    function parseRgb(css) {
        const m = String(css || '').match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(n => parseFloat(n));
        if (p.length < 3 || p.slice(0, 3).some(isNaN)) return null;
        if (p.length > 3 && p[3] === 0) return null;      // transparent tells us nothing
        return { r: p[0], g: p[1], b: p[2] };
    }

    const rgbCss = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

    function mixRgb(a, b, t) {
        return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
    }

    /** Push a colour away from, or towards, white depending on the theme. */
    function shade(c, amount) {
        const target = amount > 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
        return mixRgb(c, target, Math.abs(amount));
    }

    function firstSampled(selectors, prop) {
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const c = parseRgb(getComputedStyle(el)[prop]);
            if (c) return c;
        }
        return null;
    }

    /**
     * The site ships several skins, and they differ by far more than
     * light-versus-dark: e-hentai's default is cream with dark red rules,
     * while exhentai is charcoal. Guessing a palette produced a panel that
     * looked obviously foreign, so read the real colours off the page and
     * derive the rest from them.
     */
    function applySampledPalette(theme) {
        const root = document.documentElement;
        const body = document.body;
        if (!body) return;

        const pageBg = parseRgb(getComputedStyle(body).backgroundColor);
        const pageFg = parseRgb(getComputedStyle(body).color);
        if (!pageBg || !pageFg) return;         // keep the stylesheet defaults

        // Panels the site itself draws, in rough order of how representative
        // they are of "a box of content".
        const panelBg = firstSampled(
            ['.stuffbox', '#gd4', '.itg', '#toppane', '.gtb', '#gdt', 'table.ptt'],
            'backgroundColor') || shade(pageBg, theme === 'dark' ? 0.06 : 0.35);

        const line = firstSampled(
            ['.stuffbox', '.itg td', '.itg', '#gd4', 'table.ptt td', '#nb'],
            'borderTopColor') || mixRgb(pageBg, pageFg, 0.35);

        const accent = firstSampled(['#nb a', '.ptds a', 'h1 a', '#gn', 'a'], 'color') || pageFg;

        const dark = theme === 'dark';
        const set = (k, v) => root.style.setProperty(k, v);

        set('--eh-panel', rgbCss(panelBg));
        set('--eh-panel-raised', rgbCss(shade(panelBg, dark ? 0.07 : 0.30)));
        set('--eh-panel-sunken', rgbCss(shade(panelBg, dark ? -0.30 : -0.10)));
        set('--eh-line', rgbCss(line));
        set('--eh-line-lit', rgbCss(mixRgb(line, pageFg, 0.35)));
        set('--eh-text', rgbCss(pageFg));
        set('--eh-text-dim', rgbCss(mixRgb(pageFg, panelBg, 0.42)));
        set('--eh-text-strong', rgbCss(shade(pageFg, dark ? 0.35 : -0.35)));
        set('--eh-hover', rgbCss(mixRgb(panelBg, pageFg, dark ? 0.18 : 0.12)));
        set('--eh-accent', rgbCss(accent));
        set('--eh-shadow', dark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.22)');

        // On a light skin the emerald used for "saved" is too loud against
        // cream; darken it so it reads as a tint of the page, not a sticker.
        if (!dark) {
            set('--eh-ok-deep', 'rgb(223, 236, 224)');
            set('--eh-ok-dim', 'rgb(31, 110, 61)');
        }
    }

    const SITE_THEME = detectSiteTheme();
    document.documentElement.setAttribute('data-eh-theme', SITE_THEME);

    const CSS = `
        :root[data-eh-theme="dark"] {
            --eh-panel:        #2c2d32;
            --eh-panel-raised: #34353b;
            --eh-panel-sunken: #18191c;
            --eh-line:         #4f535b;
            --eh-line-lit:     #72767d;
            --eh-text:         #edebdf;
            --eh-text-dim:     #a0a0a0;
            --eh-text-strong:  #ffffff;
            --eh-hover:        #4f535b;
            --eh-shadow:       rgba(0, 0, 0, 0.65);
        }
        :root[data-eh-theme="light"] {
            --eh-panel:        #ededed;
            --eh-panel-raised: #f8f8f8;
            --eh-panel-sunken: #dcdcdc;
            --eh-line:         #b4b4b4;
            --eh-line-lit:     #8a8a8a;
            --eh-text:         #34302c;
            --eh-text-dim:     #6c6759;
            --eh-text-strong:  #17140f;
            --eh-hover:        #dcdcdc;
            --eh-shadow:       rgba(0, 0, 0, 0.28);
        }
        :root {
            --eh-ok:       #2ecc71;
            --eh-ok-dim:   #58d68d;
            --eh-ok-deep:  #164024;
            --eh-warn:     #e6a23c;
            --eh-danger:   #c0392b;
            --eh-info:     #3498db;
            --eh-radius:   3px;
            --eh-font:     Tahoma, Verdana, Arial, sans-serif;
            --eh-ctl-h:    26px;
        }

        @keyframes ehFadeScaleIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes ehShimmer     { from { background-position: -200% 0; } to { background-position: 200% 0; } }
        @keyframes ehSpin        { to { transform: rotate(360deg); } }

        /* Honour the OS "reduce motion" setting across every injected surface. */
        @media (prefers-reduced-motion: reduce) {
            #eh-top-control-bar *, #eh-dl-manager *, #eh-viewer-control-bar *,
            #eh-image-preview-popup, #eh-image-preview-popup *,
            #eh-gallery-peek-popup, #eh-gallery-peek-popup *,
            .eh-dl-btn, .eh-thumb-fetching::after, .eh-peek-thumb.skeleton {
                animation: none !important;
                transition: none !important;
            }
        }

        /* ---------- Top control bar ---------- */
        #eh-top-control-bar {
            background: var(--eh-panel-raised);
            border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius);
            box-shadow: 0 4px 16px var(--eh-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.05);
            padding: 7px 12px;
            margin: 8px auto;
            max-width: 1212px;
            width: calc(100% - 20px);
            box-sizing: border-box;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            font-family: var(--eh-font);
            color: var(--eh-text);
            font-size: 12px;
            position: sticky;
            top: 8px;
            z-index: 1000;
        }
        /* No hardcoded tint here: the panel colour is sampled from the live
           page, and a fixed rgba() would paint over it with the wrong skin. */
        @supports (backdrop-filter: blur(8px)) {
            #eh-top-control-bar { backdrop-filter: blur(8px); }
        }
        .eh-top-left  { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
        .eh-top-right { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--eh-text-dim); white-space: nowrap; }
        .eh-top-right a { color: var(--eh-text-dim); text-decoration: none; }
        .eh-top-right a:hover { color: var(--eh-ok-dim); text-decoration: underline; }

        /* ---------- Buttons ---------- */
        .eh-top-btn {
            background: var(--eh-panel);
            color: var(--eh-text);
            border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius);
            height: var(--eh-ctl-h);
            padding: 0 11px;
            box-sizing: border-box;
            font-family: var(--eh-font);
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: background .18s cubic-bezier(.4,0,.2,1), color .18s, border-color .18s, transform .18s;
            user-select: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            line-height: 1;
            white-space: nowrap;
        }
        .eh-top-btn:hover:not(:disabled) {
            background: var(--eh-hover); color: var(--eh-text-strong);
            border-color: var(--eh-line-lit); transform: translateY(-1px);
        }
        .eh-top-btn:active:not(:disabled) { transform: translateY(0); filter: brightness(.85); }
        .eh-top-btn:disabled { opacity: .45; cursor: default; }
        .eh-top-btn.eh-btn-danger { background: #5c1f1f; border-color: #7d2b2b; color: #f0c8c8; }
        .eh-top-btn.eh-btn-danger:hover { background: #822e2e; color: #fff; border-color: #a03a3a; }
        .eh-top-btn.eh-btn-warn { background: #4a3312; border-color: #7a5a20; color: #e8c98a; }
        .eh-top-btn.eh-btn-warn:hover { background: #63430f; color: #fff; }

        .eh-top-btn:focus-visible, .eh-viewer-btn:focus-visible, .eh-viewer-nav-btn:focus-visible,
        .eh-dl-btn:focus-visible, .eh-mgr-stop-btn:focus-visible, .eh-checkbox-label:focus-within {
            outline: 2px solid var(--eh-ok); outline-offset: 1px;
        }

        /* ---------- Checkbox pills ---------- */
        .eh-checkbox-label {
            display: inline-flex; align-items: center; gap: 6px;
            height: var(--eh-ctl-h); padding: 0 10px; box-sizing: border-box;
            background: var(--eh-panel); border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius); cursor: pointer; user-select: none;
            font-size: 12px; color: var(--eh-text); white-space: nowrap;
            transition: background .18s, border-color .18s, color .18s;
        }
        .eh-checkbox-label:hover { background: var(--eh-hover); border-color: var(--eh-line-lit); }
        .eh-checkbox-label.is-on { border-color: #27ae60; color: var(--eh-ok-dim); }
        .eh-checkbox-label input[type="checkbox"] { accent-color: var(--eh-ok); width: 13px; height: 13px; margin: 0; cursor: pointer; }
        .eh-checkbox-label span { line-height: 1; }

        /* ---------- Badges ---------- */
        .eh-badge {
            display: inline-flex; align-items: center; gap: 6px;
            height: var(--eh-ctl-h); padding: 0 10px; box-sizing: border-box;
            border: 1px solid var(--eh-line); border-radius: var(--eh-radius);
            background: var(--eh-panel-sunken); font-size: 11px;
            color: var(--eh-text-dim); white-space: nowrap;
        }
        .eh-badge b { color: var(--eh-text); font-weight: bold; }
        .eh-anim-status-badge, .eh-saved-count-badge {
            border-color: #27ae60; background: var(--eh-ok-deep); color: var(--eh-ok-dim);
        }
        .eh-saved-count-badge b { color: #fff; }
        .eh-anim-spin-icon { display: inline-block; animation: ehSpin 1.1s linear infinite; }
        .eh-quota-diff { color: var(--eh-warn); font-weight: bold; margin-left: 2px; }
        .eh-timer-badge { font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
        .eh-quota-badge.eh-quota-low { border-color: var(--eh-danger); color: #e69c94; }
        .eh-quota-badge.eh-quota-low b { color: #ff8f80; }
        .eh-hint-badge kbd {
            background: var(--eh-panel-raised); border: 1px solid var(--eh-line); border-bottom-width: 2px;
            border-radius: 2px; padding: 1px 4px; font-family: var(--eh-font); font-size: 10px; color: var(--eh-text);
        }

        /* ---------- Per-thumbnail download button ---------- */
        /* Placement runs through custom properties rather than override rules.
           This selector carries ID specificity, so any variant written as
           :root[...] .eh-dl-btn would lose the cascade no matter how many
           !important flags it used. Inherited variables sidestep that. */
        .eh-dl-btn, #gdt .eh-dl-btn {
            position: absolute !important;
            top:    var(--eh-btn-top, auto) !important;
            bottom: var(--eh-btn-bottom, 4px) !important;
            left:   var(--eh-btn-left, 50%) !important;
            right:  var(--eh-btn-right, auto) !important;
            transform: var(--eh-btn-tf, translateX(-50%)) !important;
            z-index: 20 !important;
            width: var(--eh-btn-w, calc(100% - 10px)) !important;
            max-width: var(--eh-btn-maxw, 150px) !important;
            height: 20px !important;
            padding: 0 var(--eh-btn-padx, 4px) !important;
            box-sizing: border-box !important;
            background: rgba(30, 31, 35, 0.92) !important;
            color: #edebdf !important;
            border: 1px solid #5c6069 !important;
            border-radius: 2px !important;
            font-family: var(--eh-font) !important;
            font-size: 10px !important;
            font-weight: bold !important;
            line-height: 1 !important;
            cursor: pointer !important;
            opacity: var(--eh-btn-opacity, .9);
            transition: background .15s, opacity .15s, border-color .15s !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
        }
        .eh-dl-btn:hover { background: rgba(46, 204, 113, .92) !important; color: #fff !important; border-color: var(--eh-ok) !important; --eh-btn-opacity: 1; }
        .eh-dl-btn.state-saved, #gdt .eh-dl-btn.state-saved {
            background: rgba(22, 64, 36, .95) !important; color: var(--eh-ok-dim) !important; border-color: #27ae60 !important;
        }
        .eh-dl-btn.state-saved:hover, #gdt .eh-dl-btn.state-saved:hover { background: rgba(30, 90, 50, .96) !important; color: #fff !important; }
        .eh-dl-btn.state-queued { background: rgba(60, 50, 20, .94) !important; color: #e8c98a !important; border-color: #7a5a20 !important; }
        .eh-dl-btn.state-queued:hover { background: rgba(120, 40, 40, .94) !important; color: #fff !important; border-color: #a03a3a !important; }
        .eh-dl-btn.state-scan { background: rgba(20, 45, 70, .94) !important; color: #7fb8e6 !important; border-color: #2c6ea8 !important; }
        .eh-dl-btn.state-dl   { background: rgba(20, 60, 40, .94) !important; color: var(--eh-ok-dim) !important; border-color: #1f8a4d !important; }
        .eh-dl-btn.state-err  { background: rgba(90, 25, 25, .95) !important; color: #ffb3aa !important; border-color: var(--eh-danger) !important; }

        /* Progress fill painted straight into the button, no extra element. */
        .eh-dl-btn.state-dl {
            background-image: linear-gradient(to right, rgba(46, 204, 113, .45) var(--eh-pct, 0%), transparent 0) !important;
            background-repeat: no-repeat !important;
        }

        /* Give every thumbnail box a positioning + clipping context. */
        /* Two boxes matter per cell: the outer wrapper, and the inner box
           that actually paints the thumbnail. On the live site that inner
           box is a div[title] and it is position:static, so without this it
           would not act as a containing block for the button or the
           animation layer -- both would anchor to the taller cell instead
           and drift down onto the page caption. The button carries a title
           of its own, hence the :not(). */
        /* [data-eh] marks everything this script injects. Excluding it here
           is essential, not cosmetic: giving an overlay a tooltip sets a
           title attribute, which would otherwise make it match this very
           rule and be forced back to position:relative -- at specificity
           (1,2,1), beating the overlay's own styling. That is exactly how
           the format badge ended up stretched across the top of thumbnails. */
        #gdt .gdtl:not([data-eh]), #gdt .gdtm > div:not([data-eh]), #gdt .gdtm:not([data-eh]),
        .gt100 > a > div:not([data-eh]), .gt200 > a > div:not([data-eh]), .gt400 > a > div:not([data-eh]),
        #gdt > a > div:not([data-eh]),
        #gdt div[title]:not([data-eh]):not(.eh-dl-btn) {
            position: relative !important;
            overflow: hidden !important;
            border-radius: var(--eh-radius) !important;
        }
        /* Cheap paint containment: the browser can skip offscreen thumb work. */
        #gdt > a, #gdt > div.gdtm, #gdt > div.gdtl { contain: layout paint style; }

        /* ---------- Live animated thumbnails ---------- */
        .eh-thumb-fetching::after {
            content: '';
            position: absolute; inset: 0;
            background: linear-gradient(90deg, rgba(22,64,36,.2) 0%, rgba(46,204,113,.35) 50%, rgba(22,64,36,.2) 100%);
            background-size: 200% 100%;
            animation: ehShimmer 1.3s infinite linear;
            z-index: 8; pointer-events: none; border-radius: inherit;
        }
        /* ----------------------------------------------------------------
           Overlay system.

           The site styles its own thumbnail furniture with rules keyed on
           the last child of a thumbnail box -- roughly
              .gt200 div > div:last-child { position: relative; top: -4px }
           Anything appended to that box becomes the last child and inherits
           it, which is what dragged the format badge out of its corner and
           stretched it across the top of the picture.

           Two defences, both required:
             1. every selector here is prefixed with #gdt, so ID specificity
                beats any class/element rule the site can write;
             2. every offset is stated explicitly -- setting only bottom and
                right let the site's top/left leak through.
           Indicators are also laid out as static children of one positioned
           slot, so stray top/left declarations cannot move them at all.
           ---------------------------------------------------------------- */

        /* Indicators sit opposite the download button, whatever corner it
           is configured to use, so the two never overlap. */
        :root { --eh-slot-top: 5px; --eh-slot-bottom: auto; }
        :root[data-eh-btnpos="top"],
        :root[data-eh-btnpos="tl"],
        :root[data-eh-btnpos="tr"] { --eh-slot-top: auto; --eh-slot-bottom: 5px; }

        #gdt .eh-overlay {
            position: absolute !important;
            top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important;
            margin: 0 !important; padding: 0 !important;
            border: 0 !important; background: none !important;
            pointer-events: none !important;
            z-index: 9 !important;
            border-radius: inherit !important;
            overflow: hidden !important;
        }
        #gdt .eh-overlay-slot {
            position: absolute !important;
            top: var(--eh-slot-top) !important;
            bottom: var(--eh-slot-bottom) !important;
            left: 5px !important; right: auto !important;
            display: flex !important; align-items: center !important; gap: 4px !important;
            max-width: calc(100% - 10px) !important;
            margin: 0 !important; padding: 0 !important;
        }

        /* One chip per thumbnail, carrying the whole lifecycle. Static
           positioning makes any inherited top/left simply inert. */
        #gdt .eh-chip {
            position: static !important;
            top: auto !important; right: auto !important; bottom: auto !important; left: auto !important;
            display: inline-flex !important; align-items: center !important; gap: 4px !important;
            width: auto !important; height: auto !important;
            margin: 0 !important; padding: 2px 6px !important;
            border: 1px solid transparent !important; border-radius: 2px !important;
            font-family: var(--eh-font) !important;
            font-size: 10px !important; font-weight: bold !important;
            line-height: 1 !important; letter-spacing: .3px !important;
            white-space: nowrap !important; text-transform: none !important;
            overflow: hidden !important; text-overflow: ellipsis !important;
            box-shadow: 0 2px 6px rgba(0, 0, 0, .7) !important;
            user-select: none !important; pointer-events: none !important;
            font-variant-numeric: tabular-nums;
            animation: ehFadeScaleIn .15s ease-out;
        }
        #gdt .eh-chip.is-finding,
        #gdt .eh-chip.is-loading {
            background: rgba(20, 45, 70, .95) !important;
            border-color: #2c6ea8 !important; color: #8fc4ec !important;
        }
        #gdt .eh-chip.is-playing {
            background: rgba(22, 64, 36, .95) !important;
            border-color: #27ae60 !important; color: #7ee2a8 !important;
        }
        #gdt .eh-chip.is-paused {
            background: rgba(52, 55, 62, .95) !important;
            border-color: #6b7079 !important; color: #c6cad2 !important;
        }
        #gdt .eh-chip.is-error {
            background: rgba(90, 25, 25, .96) !important;
            border-color: var(--eh-danger) !important; color: #ffb3aa !important;
            pointer-events: auto !important; cursor: pointer !important;
        }
        #gdt .eh-chip.is-error:hover { background: rgba(130, 40, 40, .96) !important; color: #fff !important; }
        #gdt .eh-chip.is-oversize {
            background: rgba(74, 51, 18, .96) !important;
            border-color: #7a5a20 !important; color: #e8c98a !important;
            pointer-events: auto !important; cursor: pointer !important;
        }
        #gdt .eh-chip.is-oversize:hover { background: rgba(99, 67, 15, .96) !important; color: #fff !important; }
        /* A settled thumbnail keeps its chip, but quietly; hovering the cell
           brings it back to full strength. */
        #gdt .eh-chip.is-playing, #gdt .eh-chip.is-paused { opacity: .72; transition: opacity .15s; }
        #gdt a:hover .eh-chip, #gdt > *:hover .eh-chip { opacity: 1; }

        /* Byte-accurate progress hugging the bottom edge. It sits below any
           button position, so it never collides with one. */
        #gdt .eh-thumb-bar {
            position: absolute !important;
            top: auto !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            width: auto !important; height: 3px !important;
            margin: 0 !important; padding: 0 !important;
            background: rgba(0, 0, 0, .55) !important;
            pointer-events: none !important;
        }
        #gdt .eh-thumb-bar > i {
            display: block !important; height: 100% !important; width: 0;
            background: linear-gradient(90deg, #1f8a4d, var(--eh-ok)) !important;
            transition: width .15s linear;
        }

        /* The live layer and its frozen canvas twin share one box so the
           swap between them is a pure opacity change, never a reflow. */
        #gdt .eh-live-layer {
            position: absolute !important;
            top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important;
            margin: 0 !important; padding: 0 !important;
            z-index: 5 !important; border-radius: inherit !important;
            pointer-events: none !important;
            opacity: 0; transition: opacity .22s ease-in;
        }
        #gdt .eh-live-layer.is-shown { opacity: 1; }
        #gdt .eh-live-layer > img, #gdt .eh-live-layer > canvas {
            position: absolute !important;
            top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important;
            width: 100% !important; height: 100% !important;
            margin: 0 !important;
            object-fit: contain !important;
            border-radius: inherit !important;
            background: rgba(0, 0, 0, .15) !important;
        }
        #gdt .eh-live-layer > canvas { display: none !important; }
        #gdt .eh-live-layer.is-frozen > img    { visibility: hidden !important; }
        #gdt .eh-live-layer.is-frozen > canvas { display: block !important; }

        /* ---------- Download button placement ---------- */
        /* One attribute on <html> restyles every button at once, so changing
           the setting costs nothing per thumbnail. */
        :root[data-eh-btnpos="top"] { --eh-btn-top: 4px; --eh-btn-bottom: auto; }
        :root[data-eh-btnpos="tl"], :root[data-eh-btnpos="tr"], :root[data-eh-btnpos="br"] {
            --eh-btn-w: auto; --eh-btn-maxw: 78%; --eh-btn-padx: 7px; --eh-btn-tf: none;
        }
        :root[data-eh-btnpos="tl"] { --eh-btn-top: 4px; --eh-btn-bottom: auto; --eh-btn-left: 4px;  --eh-btn-right: auto; }
        :root[data-eh-btnpos="tr"] { --eh-btn-top: 4px; --eh-btn-bottom: auto; --eh-btn-left: auto; --eh-btn-right: 4px; }
        :root[data-eh-btnpos="br"] { --eh-btn-top: auto; --eh-btn-bottom: 4px; --eh-btn-left: auto; --eh-btn-right: 4px; }

        /* Reveal-on-hover keeps the grid clean without hiding live state:
           a button that is queued, downloading or failed always shows. */
        :root[data-eh-btnhover="1"] { --eh-btn-opacity: 0; }
        :root[data-eh-btnhover="1"] #gdt a:hover { --eh-btn-opacity: .95; }
        .eh-dl-btn.state-queued, .eh-dl-btn.state-scan,
        .eh-dl-btn.state-dl, .eh-dl-btn.state-err { --eh-btn-opacity: .95; }
        .eh-dl-btn:focus-visible { --eh-btn-opacity: 1; }

        /* ---------- Animation progress badge ---------- */
        .eh-anim-status-badge { gap: 8px; }
        .eh-anim-bar {
            position: relative; width: 62px; height: 5px;
            border-radius: 3px; background: rgba(0, 0, 0, .45);
            overflow: hidden; flex-shrink: 0;
        }
        .eh-anim-bar > i {
            position: absolute; top: 0; bottom: 0; left: 0; width: 0;
            background: linear-gradient(90deg, #1f8a4d, var(--eh-ok));
            transition: width .25s ease;
        }
        .eh-anim-count { font-variant-numeric: tabular-nums; font-weight: bold; color: #fff; }
        .eh-anim-pages { opacity: .8; font-variant-numeric: tabular-nums; }
        .eh-anim-status-badge.is-done {
            border-color: var(--eh-line); background: var(--eh-panel-sunken); color: var(--eh-text-dim);
        }
        .eh-anim-status-badge.is-done .eh-anim-count { color: var(--eh-text); }
        .eh-anim-status-badge.is-error { border-color: var(--eh-danger); background: rgba(90,25,25,.5); color: #ffb3aa; }
        .eh-anim-status-badge.is-paused { cursor: pointer; border-color: var(--eh-warn); background: rgba(74,51,18,.6); color: #e8c98a; }
        .eh-anim-status-badge.is-paused:hover { background: rgba(99,67,15,.75); color: #fff; }

        /* ---------- Settings panel ---------- */
        #eh-settings-panel {
            position: fixed; top: 0; left: 0; z-index: 100001;
            width: 330px; max-width: calc(100vw - 24px);
            background: var(--eh-panel); border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius); box-shadow: 0 10px 34px var(--eh-shadow);
            font-family: var(--eh-font); font-size: 12px; color: var(--eh-text);
            display: none; box-sizing: border-box;
        }
        #eh-settings-panel.is-open { display: block; animation: ehFadeScaleIn .14s ease-out; }
        .eh-set-head {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 10px; background: var(--eh-panel-raised);
            border-bottom: 1px solid var(--eh-line); font-weight: bold;
        }
        .eh-set-close {
            background: none; border: none; color: var(--eh-text-dim);
            font-size: 15px; cursor: pointer; line-height: 1; padding: 0 2px;
        }
        .eh-set-close:hover { color: var(--eh-text-strong); }
        .eh-set-body { padding: 11px 12px 12px; display: flex; flex-direction: column; gap: 13px; }
        .eh-set-row { display: flex; flex-direction: column; gap: 7px; }
        .eh-set-label {
            font-size: 10px; color: var(--eh-text-dim); font-weight: bold;
            text-transform: uppercase; letter-spacing: .5px;
        }
        .eh-set-note { font-size: 10px; color: var(--eh-text-dim); line-height: 1.45; }
        .eh-set-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }

        /* Each option draws a miniature thumbnail with the button in place. */
        .eh-pos-opt {
            position: relative; height: 38px; border: 1px solid var(--eh-line);
            border-radius: 2px; background: var(--eh-panel-sunken);
            cursor: pointer; transition: border-color .15s, background .15s;
        }
        .eh-pos-opt:hover { border-color: var(--eh-line-lit); }
        .eh-pos-opt.is-active { border-color: #27ae60; background: var(--eh-ok-deep); }
        .eh-pos-opt > i {
            position: absolute; display: block; height: 6px;
            border-radius: 1px; background: var(--eh-line-lit);
        }
        .eh-pos-opt.is-active > i { background: var(--eh-ok); }
        .eh-pos-opt[data-pos="bottom"] > i { left: 15%; right: 15%; bottom: 4px; }
        .eh-pos-opt[data-pos="top"]    > i { left: 15%; right: 15%; top: 4px; }
        .eh-pos-opt[data-pos="tl"]     > i { left: 4px; width: 45%; top: 4px; }
        .eh-pos-opt[data-pos="tr"]     > i { right: 4px; width: 45%; top: 4px; }
        .eh-pos-opt[data-pos="br"]     > i { right: 4px; width: 45%; bottom: 4px; }

        .eh-set-inline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .eh-set-inline > span { font-size: 11px; }
        .eh-set-range { display: flex; align-items: center; gap: 8px; }
        .eh-set-range input[type="range"] { flex: 1; accent-color: var(--eh-ok); height: 4px; }
        .eh-set-range output {
            min-width: 22px; text-align: right; font-variant-numeric: tabular-nums;
            font-weight: bold; color: var(--eh-ok-dim);
        }
        .eh-set-danger {
            background: #5c1f1f; border: 1px solid #7d2b2b; color: #f0c8c8;
            border-radius: var(--eh-radius); height: 24px; font-size: 11px; font-weight: bold;
            font-family: var(--eh-font); cursor: pointer;
        }
        .eh-set-danger:hover { background: #822e2e; color: #fff; }
        .eh-set-text {
            width: 100%; box-sizing: border-box; height: var(--eh-ctl-h);
            padding: 0 8px; background: var(--eh-panel-sunken);
            border: 1px solid var(--eh-line); border-radius: var(--eh-radius);
            color: var(--eh-text); font-family: var(--eh-font); font-size: 12px;
        }
        .eh-set-text:focus { outline: 2px solid var(--eh-ok); outline-offset: 1px; }
        .eh-set-preview {
            font-size: 11px; color: var(--eh-ok-dim); background: var(--eh-panel-sunken);
            border: 1px solid var(--eh-line); border-radius: var(--eh-radius);
            padding: 5px 8px; word-break: break-all; line-height: 1.4;
        }
        .eh-set-preview.is-bad { color: #ffb3aa; border-color: var(--eh-danger); }

        /* ---------- Download manager ---------- */
        #eh-dl-manager {
            position: fixed; bottom: 20px; right: 20px; width: 360px; max-width: calc(100vw - 24px);
            background: var(--eh-panel);
            border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius);
            box-shadow: 0 8px 24px var(--eh-shadow);
            font-family: var(--eh-font); font-size: 12px; color: var(--eh-text);
            z-index: 99999; overflow: hidden;
            opacity: 0; transform: translateY(12px); pointer-events: none;
            transition: opacity .2s ease, transform .2s ease;
        }
        #eh-dl-manager.active { opacity: 1; transform: translateY(0); pointer-events: auto; }
        #eh-dl-manager.collapsed .eh-mgr-body { display: none; }
        .eh-mgr-header {
            display: flex; justify-content: space-between; align-items: center;
            background: var(--eh-panel-raised); border-bottom: 1px solid var(--eh-line);
            padding: 7px 10px; font-weight: bold; cursor: move; user-select: none;
        }
        .eh-mgr-header-actions { display: flex; align-items: center; gap: 8px; font-weight: normal; font-size: 11px; color: var(--eh-text-dim); }
        .eh-mgr-stop-btn, .eh-mgr-min-btn {
            background: #5c1f1f; border: 1px solid #7d2b2b; color: #f0c8c8;
            border-radius: 2px; padding: 2px 7px; font-size: 10px; font-weight: bold;
            cursor: pointer; font-family: var(--eh-font); transition: background .15s;
        }
        .eh-mgr-min-btn { background: var(--eh-panel); border-color: var(--eh-line); color: var(--eh-text-dim); }
        .eh-mgr-stop-btn:hover { background: #822e2e; color: #fff; }
        .eh-mgr-min-btn:hover  { background: var(--eh-hover); color: var(--eh-text); }
        .eh-mgr-body { padding: 9px 10px 10px; }
        .eh-mgr-title {
            font-size: 11px; color: var(--eh-text); margin-bottom: 7px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .eh-progress-bg {
            position: relative; height: 16px; background: var(--eh-panel-sunken);
            border: 1px solid var(--eh-line); border-radius: 2px; overflow: hidden;
        }
        .eh-progress-fill {
            height: 100%; width: 0;
            background: linear-gradient(90deg, #1f8a4d, var(--eh-ok));
            transition: width .12s linear;
        }
        .eh-progress-text {
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
            font-size: 10px; font-weight: bold; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.85);
            font-variant-numeric: tabular-nums;
        }
        .eh-mgr-stats {
            display: flex; justify-content: space-between; gap: 8px;
            margin-top: 6px; font-size: 10px; color: var(--eh-text-dim);
            font-variant-numeric: tabular-nums;
        }
        .eh-mgr-queue-list { margin-top: 8px; max-height: 132px; overflow-y: auto; overscroll-behavior: contain; }
        .eh-mgr-queue-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 3px 6px; border-radius: 2px; font-size: 11px; color: var(--eh-text-dim);
        }
        .eh-mgr-queue-item:hover { background: var(--eh-panel-raised); color: var(--eh-text); }
        .eh-mgr-queue-item.is-failed { color: #e69c94; }
        .eh-queue-item-remove { cursor: pointer; color: #b06a6a; font-weight: bold; padding: 0 3px; }
        .eh-queue-item-remove:hover { color: #ff6b6b; }
        .eh-mgr-alert {
            margin-top: 8px; padding: 6px 8px; border-radius: 2px;
            background: rgba(90, 25, 25, .5); border: 1px solid var(--eh-danger);
            color: #ffb3aa; font-size: 11px; line-height: 1.4; display: none;
        }
        .eh-mgr-alert.is-shown { display: block; }

        /* ---------- Viewer bar ---------- */
        /* Floating: the reader scrolls the picture constantly, and a bar that
           scrolled away meant hunting for it before every page turn. */
        #eh-viewer-control-bar {
            position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
            z-index: 1000;
            display: flex; justify-content: space-between; align-items: center;
            flex-wrap: wrap; gap: 8px;
            background: var(--eh-panel-raised);
            border: 1px solid var(--eh-line); border-radius: var(--eh-radius);
            box-shadow: 0 4px 18px var(--eh-shadow), inset 0 1px 0 rgba(255,255,255,.05);
            padding: 7px 12px;
            max-width: min(1212px, calc(100vw - 24px));
            box-sizing: border-box;
            font-family: var(--eh-font); font-size: 12px; color: var(--eh-text);
            opacity: .97;
            transition: opacity .15s;
        }
        #eh-viewer-control-bar:hover { opacity: 1; }
        @supports (backdrop-filter: blur(8px)) {
            #eh-viewer-control-bar { backdrop-filter: blur(8px); }
        }
        /* Keep the first screenful clear of the floating bar. */
        body.eh-viewer-floating #i1 { padding-top: 58px; }
        #eh-viewer-control-bar .eh-viewer-nav-btn.disabled { opacity: .3; }
        .eh-viewer-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .eh-viewer-sep { width: 1px; height: 18px; background: var(--eh-line); flex-shrink: 0; }
        .eh-viewer-nav-btn {
            display: inline-flex; align-items: center; justify-content: center;
            height: var(--eh-ctl-h); padding: 0 12px; box-sizing: border-box;
            background: var(--eh-panel); border: 1px solid var(--eh-line); border-radius: var(--eh-radius);
            color: var(--eh-text) !important; text-decoration: none !important;
            font-size: 12px; font-weight: bold; white-space: nowrap;
            transition: background .15s, color .15s, border-color .15s;
        }
        .eh-viewer-nav-btn:hover { background: var(--eh-hover); color: var(--eh-text-strong) !important; border-color: var(--eh-line-lit); }
        .eh-viewer-nav-btn.disabled { opacity: .35; pointer-events: none; }
        .eh-viewer-btn {
            height: var(--eh-ctl-h); padding: 0 12px; box-sizing: border-box;
            background: var(--eh-ok-deep); color: var(--eh-ok-dim);
            border: 1px solid #27ae60; border-radius: var(--eh-radius);
            font-family: var(--eh-font); font-size: 12px; font-weight: bold;
            cursor: pointer; white-space: nowrap;
            display: inline-flex; align-items: center; justify-content: center; gap: 5px;
            transition: background .15s, color .15s;
        }
        .eh-viewer-btn:hover { background: #1d5a32; color: #fff; }
        .eh-viewer-btn.state-saved { background: var(--eh-panel); border-color: #27ae60; color: var(--eh-ok-dim); }
        .eh-viewer-btn.state-dl { background: #14324a; border-color: #2c6ea8; color: #7fb8e6; cursor: default; }
        .eh-viewer-btn.state-err { background: #5a1919; border-color: var(--eh-danger); color: #ffb3aa; }
        .eh-viewer-cancel-btn {
            height: var(--eh-ctl-h); padding: 0 10px; box-sizing: border-box;
            background: #5c1f1f; color: #f0c8c8; border: 1px solid #7d2b2b;
            border-radius: var(--eh-radius); font-family: var(--eh-font);
            font-size: 11px; font-weight: bold; cursor: pointer; display: none; white-space: nowrap;
        }
        .eh-viewer-cancel-btn:hover { background: #822e2e; color: #fff; }

        /* ---------- Floating popovers ---------- */
        /* The outer shell owns nothing but the cursor position. A CSS
           animation outranks inline styles, so the entrance effect has to
           live on an inner element -- put it on the shell and it overwrites
           the transform that follows the mouse, freezing the popup in place. */
        #eh-image-preview-popup, #eh-gallery-peek-popup {
            position: fixed; top: 0; left: 0; z-index: 100000;
            display: none; pointer-events: none; will-change: transform;
        }
        #eh-image-preview-popup.is-open, #eh-gallery-peek-popup.is-open { display: block; }
        .eh-pop-inner {
            background: var(--eh-panel);
            border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius);
            box-shadow: 0 8px 30px var(--eh-shadow);
            box-sizing: border-box;
            animation: ehFadeScaleIn .16s cubic-bezier(.16,1,.3,1) forwards;
        }
        #eh-image-preview-popup .eh-pop-inner {
            padding: 8px; display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            max-width: 92vw; max-height: 88vh;
        }
        .eh-preview-stage {
            position: relative; display: flex; align-items: center; justify-content: center;
            background: var(--eh-panel-sunken); border-radius: 2px; overflow: hidden;
        }
        .eh-preview-stage.is-skeleton {
            background: linear-gradient(90deg, var(--eh-panel-sunken) 25%, var(--eh-panel-raised) 50%, var(--eh-panel-sunken) 75%);
            background-size: 200% 100%; animation: ehShimmer 1.4s infinite linear;
        }
        #eh-preview-img {
            display: block; max-width: 100%; max-height: 100%;
            object-fit: contain; opacity: 0; transition: opacity .18s ease-in;
        }
        #eh-preview-img.img-ready { opacity: 1; }
        .eh-preview-spinner {
            position: absolute; color: var(--eh-text-dim); font-size: 11px;
            display: flex; align-items: center; gap: 6px; font-family: var(--eh-font);
        }
        .eh-preview-caption {
            margin-top: 6px; font-family: var(--eh-font); font-size: 11px;
            color: var(--eh-text-dim); text-align: center; font-weight: bold;
            max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .eh-preview-caption b { color: var(--eh-ok-dim); }

        /* ---------- Gallery peeker ---------- */
        #eh-gallery-peek-popup .eh-pop-inner {
            padding: 10px; width: 470px; max-width: 95vw;
            font-family: var(--eh-font); color: var(--eh-text); font-size: 11px;
        }
        .eh-peek-header {
            font-weight: bold; font-size: 12px; color: var(--eh-text-strong);
            margin-bottom: 6px; line-height: 1.3;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
            overflow: hidden; min-height: 16px;
        }
        .eh-peek-meta {
            display: flex; flex-wrap: wrap; align-items: center; gap: 5px 12px;
            color: var(--eh-text-dim); font-size: 11px; margin-bottom: 8px;
            border-bottom: 1px solid var(--eh-line); padding-bottom: 6px;
        }
        .eh-peek-meta span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
        .eh-peek-meta b { color: var(--eh-ok-dim); font-weight: bold; }
        .eh-peek-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; max-height: 40px; overflow: hidden; }
        .eh-peek-tag {
            background: var(--eh-panel-sunken); border: 1px solid var(--eh-line);
            border-radius: 2px; padding: 1px 5px; font-size: 10px; color: var(--eh-text-dim); white-space: nowrap;
        }
        .eh-peek-grid {
            display: grid; grid-template-columns: repeat(4, 1fr);
            gap: 6px; box-sizing: border-box;
        }
        .eh-peek-thumb {
            position: relative; aspect-ratio: 105 / 148;
            background-color: var(--eh-panel-sunken);
            border: 1px solid var(--eh-line); border-radius: 2px;
            overflow: hidden; display: flex; align-items: center; justify-content: center;
        }
        .eh-peek-thumb > img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .eh-peek-thumb > .eh-sprite {
            position: absolute; top: 50%; left: 50%;
            transform-origin: center center; background-repeat: no-repeat;
        }
        .eh-peek-thumb.skeleton {
            background: linear-gradient(90deg, var(--eh-panel-sunken) 25%, var(--eh-panel-raised) 50%, var(--eh-panel-sunken) 75%);
            background-size: 200% 100%; animation: ehShimmer 1.4s infinite linear;
        }
        .eh-peek-empty { grid-column: 1 / -1; text-align: center; color: var(--eh-text-dim); padding: 24px 0; }

        /* ---------- Favourite markers in listings ---------- */
        .eh-fav-mark {
            position: absolute; top: 3px; left: 3px; z-index: 15;
            display: inline-flex; align-items: center; gap: 3px;
            max-width: calc(100% - 6px); box-sizing: border-box;
            padding: 2px 5px; border-radius: 2px;
            background: var(--eh-ok-deep); border: 1px solid #27ae60;
            color: var(--eh-ok-dim);
            font-family: var(--eh-font); font-size: 9px; font-weight: bold;
            line-height: 1; letter-spacing: .3px; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis;
            pointer-events: none; user-select: none;
            box-shadow: 0 1px 4px rgba(0, 0, 0, .5);
        }
        .eh-fav-row-mark {
            display: inline-flex; align-items: center; gap: 3px;
            margin-right: 5px; padding: 1px 5px; border-radius: 2px;
            background: var(--eh-ok-deep); border: 1px solid #27ae60;
            color: var(--eh-ok-dim); font-size: 10px; font-weight: bold;
            vertical-align: middle; white-space: nowrap;
        }
        .eh-fav-progress {
            display: inline-flex; align-items: center; gap: 6px;
            font-size: 11px; color: var(--eh-text-dim);
        }

        /* ---------- What's-new notice ---------- */
        #eh-whatsnew {
            position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
            z-index: 100002; width: 440px; max-width: calc(100vw - 24px);
            background: var(--eh-panel); border: 1px solid var(--eh-line);
            border-radius: var(--eh-radius); box-shadow: 0 10px 34px var(--eh-shadow);
            font-family: var(--eh-font); font-size: 12px; color: var(--eh-text);
            animation: ehFadeScaleIn .18s cubic-bezier(.16,1,.3,1);
        }
        #eh-whatsnew .eh-wn-head {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 10px; background: var(--eh-panel-raised);
            border-bottom: 1px solid var(--eh-line); font-weight: bold;
        }
        #eh-whatsnew .eh-wn-ver { color: var(--eh-ok-dim); font-weight: bold; }
        #eh-whatsnew .eh-wn-body { padding: 9px 12px 4px; max-height: 46vh; overflow-y: auto; }
        #eh-whatsnew h4 {
            margin: 10px 0 4px; font-size: 11px; color: var(--eh-text-dim);
            text-transform: uppercase; letter-spacing: .5px; font-weight: bold;
        }
        #eh-whatsnew h4:first-child { margin-top: 0; }
        #eh-whatsnew ul { margin: 0 0 6px; padding-left: 16px; }
        #eh-whatsnew li { margin: 3px 0; line-height: 1.45; }
        #eh-whatsnew li b { color: var(--eh-ok-dim); }
        #eh-whatsnew .eh-wn-foot {
            display: flex; justify-content: space-between; align-items: center;
            gap: 8px; padding: 8px 10px; border-top: 1px solid var(--eh-line);
        }
        #eh-whatsnew .eh-wn-older {
            background: none; border: none; color: var(--eh-text-dim);
            font-family: var(--eh-font); font-size: 11px; cursor: pointer; padding: 0; text-decoration: underline;
        }
        #eh-whatsnew .eh-wn-older:hover { color: var(--eh-text); }
    `;

    if (typeof GM_addStyle === 'function') {
        GM_addStyle(CSS);
    } else {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
    }
    // =====================================================================
    // === SMALL UTILITIES =================================================
    // =====================================================================
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

    /** Coalesce bursts of calls into one call per animation frame. */
    function rafThrottle(fn) {
        let queued = false;
        let lastArgs = null;
        return function throttled(...args) {
            lastArgs = args;
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                fn.apply(this, lastArgs);
            });
        };
    }

    /** Bounded cache so long browsing sessions cannot grow without limit. */
    class LruMap extends Map {
        constructor(limit) { super(); this.limit = limit; }
        get(key) {
            if (!super.has(key)) return undefined;
            const val = super.get(key);
            super.delete(key);
            super.set(key, val);
            return val;
        }
        set(key, val) {
            if (super.has(key)) super.delete(key);
            super.set(key, val);
            while (this.size > this.limit) super.delete(super.keys().next().value);
            return this;
        }
    }

    function formatBytes(n) {
        if (!n && n !== 0) return '';
        if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
        if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
        return n + ' B';
    }

    function formatDuration(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '--';
        const s = Math.round(seconds);
        if (s < 60) return s + 's';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
        return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
    }

    const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

    /**
     * Produce a name every mainstream filesystem accepts. Beyond stripping
     * illegal characters this also trims trailing dots/spaces and caps the
     * length, both of which silently break saves on Windows.
     */
    function sanitizeFilename(name, maxLen = 120) {
        let out = String(name || '')
            .replace(/\p{Cc}/gu, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/, '');
        if (WINDOWS_RESERVED.test(out)) out = '_' + out;
        if (out.length > maxLen) out = out.slice(0, maxLen).replace(/[. ]+$/, '');
        return out || 'ExHentai_Gallery';
    }

    // =====================================================================
    // === PERSISTENT STORAGE ==============================================
    // The old build re-parsed and re-serialised the whole history on every
    // single page mark. Keep one in-memory copy and flush it lazily.
    // =====================================================================
    const HAS_GM_STORE = typeof GM_getValue !== 'undefined' && typeof GM_setValue !== 'undefined';
    const HISTORY_KEY = 'eh_download_history_v1';

    function rawGet(key, def) {
        if (HAS_GM_STORE) return GM_getValue(key, def);
        const v = localStorage.getItem(key);
        return v === null ? def : v;
    }

    function rawSet(key, val) {
        if (HAS_GM_STORE) GM_setValue(key, val);
        else localStorage.setItem(key, String(val));
    }

    function getSetting(key, def) {
        const raw = rawGet(key, undefined);
        if (raw === undefined || raw === null) return def;
        if (typeof def === 'boolean') return raw === true || raw === 'true';
        if (typeof def === 'number') {
            const n = Number(raw);
            return isNaN(n) ? def : n;
        }
        return raw;
    }

    function setSetting(key, val) { rawSet(key, val); }

    // Defaults in one place so the panel and the consumers cannot drift.
    const DEFAULTS = {
        eh_open_in_new_tab: true,
        eh_gallery_peeker: true,
        eh_live_thumbs: false,
        eh_btn_pos: 'bottom',
        eh_btn_hover: false,
        eh_anim_play_budget: 4,
        eh_anim_concurrency: 2,
        eh_anim_size_cap_mb: 8,
        eh_preview_size_cap_mb: 24,
        eh_filename_template: '{title} - {num}.{ext}'
    };

    const pref = key => getSetting(key, DEFAULTS[key]);

    const BUTTON_POSITIONS = [
        { id: 'bottom', label: 'Bottom bar' },
        { id: 'top',    label: 'Top bar' },
        { id: 'tl',     label: 'Top left' },
        { id: 'tr',     label: 'Top right' },
        { id: 'br',     label: 'Bottom right' }
    ];

    /** Placement is pure CSS: flip two attributes and every button moves. */
    function applyButtonPlacement() {
        const root = document.documentElement;
        const pos = pref('eh_btn_pos');
        root.setAttribute('data-eh-btnpos', BUTTON_POSITIONS.some(p => p.id === pos) ? pos : 'bottom');
        root.setAttribute('data-eh-btnhover', pref('eh_btn_hover') ? '1' : '0');
    }

    const History = (() => {
        let cache = null;
        let dirty = false;
        let flushTimer = null;

        function load() {
            if (cache) return cache;
            try {
                cache = JSON.parse(rawGet(HISTORY_KEY, '{}')) || {};
            } catch {
                cache = {};
            }
            return cache;
        }

        function flush() {
            if (!dirty) return;
            dirty = false;
            clearTimeout(flushTimer);
            flushTimer = null;
            try {
                rawSet(HISTORY_KEY, JSON.stringify(load()));
            } catch (err) {
                console.warn('[ExHD] Could not persist download history', err);
            }
        }

        function scheduleFlush() {
            dirty = true;
            if (flushTimer) return;
            flushTimer = setTimeout(flush, 600);
        }

        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

        return {
            forGallery(gid) { return gid ? (load()[String(gid)] || {}) : {}; },
            isSaved(gid, page) {
                if (!gid || page == null) return false;
                const g = load()[String(gid)];
                return !!(g && g[String(page)]);
            },
            mark(gid, page, meta = {}) {
                if (!gid || page == null) return;
                const db = load();
                const g = (db[String(gid)] = db[String(gid)] || {});
                g[String(page)] = { time: Date.now(), res: meta.res || '', size: meta.size || '' };
                scheduleFlush();
            },
            clearGallery(gid) {
                if (!gid) return 0;
                const db = load();
                const n = Object.keys(db[String(gid)] || {}).length;
                delete db[String(gid)];
                scheduleFlush();
                flush();
                return n;
            },
            clearAll() {
                const db = load();
                const n = Object.keys(db).length;
                for (const k of Object.keys(db)) delete db[k];
                scheduleFlush();
                flush();
                return n;
            },
            galleryCount() { return Object.keys(load()).length; },
            flush
        };
    })();

    function getGalleryIdFromLocation() {
        const g = location.pathname.match(/\/g\/(\d+)\//);
        if (g) return g[1];
        const s = location.pathname.match(/\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/);
        return s ? s[1] : null;
    }

    function getGalleryTitle() {
        const src = ($('#gn') && $('#gn').textContent) ||
                    ($('#gj') && $('#gj').textContent) ||
                    ($('#i1 h1') && $('#i1 h1').textContent) ||
                    'ExHentai_Gallery';
        return sanitizeFilename(src);
    }

    /**
     * Read the viewer's "page / total" counter.
     *
     * #i2 holds the counter and the filename line as sibling divs, and
     * textContent glues them with no separator. On a gallery whose files are
     * named 006.jpg that yields "6 / 129006.jpg", and a greedy \d+ happily
     * reports 129006 pages. So never match across the whole node: prefer the
     * child that is exactly "N / M", and otherwise scope the loose match to
     * the counter div alone.
     */
    function readPageNav(root) {
        const scope = root || document;
        const i2 = scope.querySelector ? scope.querySelector('#i2') : null;
        if (!i2) return null;

        for (const el of i2.children) {
            const m = (el.textContent || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
            if (m) return { page: parseInt(m[1], 10), total: parseInt(m[2], 10) };
        }

        const nav = i2.querySelector('.sn');
        if (nav) {
            const m = (nav.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
            if (m) return { page: parseInt(m[1], 10), total: parseInt(m[2], 10) };
        }
        return null;
    }

    /** Total pages, used only to pick a sane zero-pad width. */
    function getGalleryPageCount() {
        const gdd = $$('#gdd tr').find(tr => /Length:/i.test(tr.textContent));
        if (gdd) {
            const m = gdd.textContent.match(/(\d+)\s*page/i);
            if (m) return parseInt(m[1], 10);
        }
        const nav = readPageNav();
        if (nav) return nav.total;
        const gpc = $('.gpc');
        if (gpc) {
            const m = gpc.textContent.match(/of\s+([\d,]+)\s+images/i);
            if (m) return parseInt(m[1].replace(/,/g, ''), 10);
        }
        return 0;
    }

    function padWidthFor(total) {
        return total > 999 ? 4 : 3;
    }

    /** "[Artist] Title (Series)" is the house convention for gallery names. */
    function artistFromTitle(title) {
        const m = String(title || '').match(/^\s*[\[(]\s*([^\])]+?)\s*[\])]/);
        if (!m) return '';
        // "[Group (Artist)]" -> prefer the artist in the inner brackets.
        const inner = m[1].match(/\(([^)]+)\)\s*$/);
        return sanitizeFilename(inner ? inner[1] : m[1], 60);
    }

    const FILENAME_TOKENS = ['title', 'name', 'artist', 'num', 'page', 'total', 'gid', 'res', 'orig', 'ext'];

    /**
     * Expand the user's filename template.
     *
     * A forward slash is kept as a real path separator, because Chrome's
     * download attribute honours sub-directories -- that is what makes
     * "one folder per gallery" templates work. Each segment is sanitised on
     * its own so the separator survives, and traversal segments are dropped.
     */
    function buildFilename(template, vars) {
        const ext = (vars.ext || 'jpg').toLowerCase();
        const expanded = String(template || DEFAULTS.eh_filename_template)
            .replace(/\{(\w+)\}/g, (whole, key) => {
                const k = key.toLowerCase();
                if (k === 'ext') return '';                 // appended at the end
                if (!FILENAME_TOKENS.includes(k)) return whole;
                const v = vars[k];
                // Slashes inside a value must not invent new folders.
                return v === undefined || v === null
                    ? ''
                    : sanitizeFilename(String(v).replace(/[/\\]/g, '_'), 80);
            })
            .replace(/\.\s*$/, '')
            .trim();

        // Sanitise segments without the "" -> default-name fallback, or a
        // traversal segment would come back as a real folder called
        // ExHentai_Gallery instead of being dropped.
        const segments = expanded
            .split('/')
            .map(s => String(s).replace(/\p{Cc}/gu, '').replace(/[\\:*?"<>|]/g, '_')
                               .replace(/\s+/g, ' ').trim().replace(/[. ]+$/, ''))
            .filter(Boolean)
            .map(s => (WINDOWS_RESERVED.test(s) ? '_' + s : s).slice(0, 80).replace(/[. ]+$/, ''))
            .filter(Boolean);

        if (!segments.length) return `image.${ext}`;

        const last = segments.pop();
        const stem = sanitizeFilename(last, Math.max(16, 120 - ext.length));
        segments.push(stem);

        let out = segments.join('/');
        if (out.length > 200) out = out.slice(out.length - 200).replace(/^[^/]*\//, '');
        return `${out}.${ext}`;
    }

    function filenameVars({ title, page, total, gid, res, origName, ext }) {
        const pad = padWidthFor(total || 0);
        // {title} keeps the site's full name, which already begins with the
        // artist bracket; {name} drops it so "{artist}/{name}" reads cleanly.
        const bare = String(title || '').replace(/^\s*[\[(][^\])]*[\])]\s*/, '').trim();
        return {
            title: title || 'ExHentai_Gallery',
            name: sanitizeFilename(bare || title || 'Gallery', 100),
            artist: artistFromTitle(title),
            num: String(page).padStart(pad, '0'),
            page: String(page),
            total: String(total || ''),
            gid: String(gid || ''),
            res: res || '',
            orig: origName ? origName.replace(/\.[^.]+$/, '') : '',
            ext
        };
    }

    // =====================================================================
    // === NETWORK LAYER ===================================================
    // A promise wrapper over GM_xmlhttpRequest with abort, timeout,
    // classified errors and exponential-backoff retries.
    // =====================================================================
    class EhError extends Error {
        constructor(kind, message, detail) {
            super(message || kind);
            this.kind = kind;      // abort | timeout | network | http | quota | parse
            this.detail = detail;
        }
    }

    const QUOTA_HALT = 'quota';
    const OVERSIZE = 'oversize';

    function gmRequest(opts) {
        let handle = null;
        let settled = false;
        const promise = new Promise((resolve, reject) => {
            const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
            try {
                handle = GM_xmlhttpRequest({
                    method: 'GET',
                    timeout: 60000,
                    ...opts,
                    onload:     res => done(resolve, res),
                    onerror:    err => done(reject, new EhError('network', 'Network error', err)),
                    ontimeout:  ()  => done(reject, new EhError('timeout', 'Request timed out')),
                    onabort:    ()  => done(reject, new EhError('abort', 'Aborted'))
                });
            } catch (err) {
                done(reject, new EhError('network', 'Request could not start', err));
            }
        });
        promise.abort = () => { try { handle && handle.abort && handle.abort(); } catch { /* already gone */ } };
        return promise;
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /**
     * Retry transient failures only. Aborts and quota halts propagate at
     * once: retrying either one wastes requests and, for quota, makes the
     * ban worse.
     */
    async function withRetry(task, { attempts = 3, baseDelay = 1200, onRetry } = {}) {
        let lastErr;
        for (let i = 0; i < attempts; i++) {
            try {
                return await task(i);
            } catch (err) {
                lastErr = err;
                const fatal = err instanceof EhError &&
                    (err.kind === 'abort' || err.kind === QUOTA_HALT);
                if (fatal || i === attempts - 1) throw err;
                const wait = baseDelay * Math.pow(2, i);
                if (onRetry) onRetry(i + 1, attempts, wait, err);
                await sleep(wait);
            }
        }
        throw lastErr;
    }

    /**
     * The bandwidth notice is served as an image literally named 509.gif.
     * Match that filename and nothing else: H@H URLs carry long digit runs
     * in their hash and port, so a bare "509" substring test condemns
     * perfectly good images. That false positive used to halt the whole
     * loader on any page whose URL happened to contain those three digits.
     */
    const QUOTA_SENTINEL_URL = /\/509s?\.(?:gif|png|jpe?g)(?:[?#]|$)/i;

    /** Fetch and parse an HTML document, detecting the quota interstitial. */
    async function fetchDocument(url, opts = {}) {
        const res = await gmRequest({ url, ...opts });
        if (res.status !== 200) {
            throw new EhError('http', `HTTP ${res.status}`, res.status);
        }
        const text = res.responseText || '';
        if (/You have exceeded your image viewing limits/i.test(text)) {
            throw new EhError(QUOTA_HALT, 'Image viewing limit reached');
        }
        return new DOMParser().parseFromString(text, 'text/html');
    }

    // --- Binary sniffing -------------------------------------------------
    const CONTENT_TYPE_EXT = {
        'image/jpeg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png',
        'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
        'image/bmp': 'bmp', 'image/x-ms-bmp': 'bmp',
        'video/webm': 'webm', 'video/mp4': 'mp4', 'application/zip': 'zip'
    };

    /**
     * Original downloads come from /fullimg/ URLs that carry no extension,
     * and H@H nodes routinely answer with application/octet-stream. Reading
     * the magic bytes is the only way to name GIF/PNG/WebP originals right.
     */
    async function sniffExtension(blob) {
        try {
            const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
            const at = (i, ...bytes) => bytes.every((v, k) => b[i + k] === v);
            const ascii = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

            if (at(0, 0xFF, 0xD8, 0xFF)) return 'jpg';
            if (at(0, 0x89, 0x50, 0x4E, 0x47)) return 'png';
            if (ascii(0, 'GIF8')) return 'gif';
            if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
            if (at(0, 0x42, 0x4D)) return 'bmp';
            if (at(0, 0x1A, 0x45, 0xDF, 0xA3)) return 'webm';
            if (ascii(4, 'ftyp')) {
                const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
                if (/avi[fs]/i.test(brand)) return 'avif';
                if (/heic|heix|mif1/i.test(brand)) return 'heic';
                return 'mp4';
            }
            if (at(0, 0x50, 0x4B, 0x03, 0x04)) return 'zip';
        } catch { /* fall through to header/URL guessing */ }
        return null;
    }

    function extFromContentType(headerText) {
        const m = String(headerText || '').match(/content-type:\s*([^;\r\n]+)/i);
        if (!m) return null;
        return CONTENT_TYPE_EXT[m[1].trim().toLowerCase()] || null;
    }

    function extFromUrl(url) {
        const m = String(url || '').match(/\.(png|jpe?g|gif|webp|avif|bmp|webm|mp4)(?:\?|#|$)/i);
        if (!m) return null;
        const e = m[1].toLowerCase();
        return e === 'jpeg' ? 'jpg' : e;
    }

    /** The source filename, for the {orig} template token. */
    function origNameFromViewerDoc(doc) {
        const i2 = doc.querySelector('#i2');
        if (!i2) return null;
        for (const el of i2.children) {
            const m = (el.textContent || '').trim().match(/^(.+?\.[a-z0-9]{2,5})\s*::/i);
            if (m) return m[1].trim();
        }
        return null;
    }

    /** The viewer prints the true source filename in the first line of #i2. */
    function extFromViewerDoc(doc) {
        const i2 = doc.querySelector('#i2');
        if (!i2) return null;
        const first = i2.querySelector('div');
        const text = (first || i2).textContent || '';
        const m = text.match(/\.([a-z0-9]{2,5})\s*::/i);
        return m ? m[1].toLowerCase().replace(/^jpeg$/, 'jpg') : null;
    }

    /**
     * Separate a real limit notice from an ordinary failure. Only the first
     * deserves halting everything; an empty or malformed reply is transient
     * and should simply be retried.
     */
    function classifyImageResponse(blob, res) {
        if (res.status === 509) return 'quota';
        if (QUOTA_SENTINEL_URL.test(res.finalUrl || '')) return 'quota';
        if (!blob) return 'empty';
        const type = (blob.type || '').toLowerCase();
        if (type.startsWith('text/') || type === 'application/xhtml+xml') return 'html';
        if (blob.size === 0) return 'empty';
        return 'ok';
    }

    function assertRealImage(blob, res) {
        switch (classifyImageResponse(blob, res)) {
            case 'quota':
                throw new EhError(QUOTA_HALT, 'Image / bandwidth limit reached');
            case 'html':
                throw new EhError('http', 'Server returned a page instead of an image');
            case 'empty':
                throw new EhError('network', 'Empty response');
            default:
                return true;
        }
    }

    /** Download bytes, verifying we actually received an image. */
    async function fetchImageBlob(url, { referer, onprogress, onHandle } = {}) {
        const req = gmRequest({
            url,
            responseType: 'blob',
            headers: referer ? { Referer: referer } : undefined,
            timeout: 180000,
            onprogress
        });
        if (onHandle) onHandle(req);
        const res = await req;

        if (res.status === 509) throw new EhError(QUOTA_HALT, 'Bandwidth / image limit reached (509)');
        if (res.status !== 200) throw new EhError('http', `HTTP ${res.status}`, res.status);

        const blob = res.response;
        assertRealImage(blob, res);
        return { blob, res };
    }

    /** Hand the blob to the browser's downloader and release it promptly. */
    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(url);
        }, 1000);
    }
    // =====================================================================
    // === IMAGE-LIMIT (QUOTA) TRACKER =====================================
    // Previously the queue blocked on a home.php round trip between every
    // single image, doubling request count and stalling throughput. Now the
    // refresh is fire-and-forget and rate limited.
    // =====================================================================
    const Quota = (() => {
        const MIN_INTERVAL_MS = 15000;
        const IDLE_PERIOD_S = 60;

        let current = null;
        let limit = null;
        let lastFetchAt = 0;
        let inFlight = null;
        let countdown = IDLE_PERIOD_S;
        let tickerId = null;
        let busyProvider = () => false;

        function render(valueText, diffHtml, low) {
            const html = `Image Limits: <b>${valueText}</b>${diffHtml || ''}`;
            for (const sel of ['#eh-quota-value', '#eh-viewer-quota-value']) {
                const el = $(sel);
                if (el) el.innerHTML = html;
            }
            const mgr = $('#eh-mgr-quota');
            if (mgr) mgr.textContent = `Quota: ${valueText}`;
            $$('.eh-quota-badge').forEach(b => b.classList.toggle('eh-quota-low', !!low));
        }

        function renderTimer() {
            const busy = busyProvider();
            const state = busy            ? { text: 'DL', color: 'var(--eh-info)' }
                        : document.hidden ? { text: 'idle', color: 'var(--eh-text-dim)' }
                        :                   { text: countdown + 's', color: 'var(--eh-text-dim)' };
            for (const sel of ['#eh-quota-timer', '#eh-viewer-quota-timer']) {
                const el = $(sel);
                if (el) {
                    el.textContent = '⏱ ' + state.text;
                    el.style.color = state.color;
                }
            }
        }

        function parse(doc) {
            const p = $$('.homebox p', doc)
                .find(x => /towards your account limit of/i.test(x.textContent));
            if (!p) return null;
            const strongs = p.querySelectorAll('strong');
            if (strongs.length < 2) return null;
            return {
                currentText: strongs[0].textContent.trim(),
                limitText: strongs[1].textContent.trim(),
                currentNum: parseInt(strongs[0].textContent.replace(/[^\d]/g, ''), 10),
                limitNum: parseInt(strongs[1].textContent.replace(/[^\d]/g, ''), 10)
            };
        }

        function refresh({ force = false } = {}) {
            if (inFlight) return inFlight;
            if (!force && Date.now() - lastFetchAt < MIN_INTERVAL_MS) return Promise.resolve();

            lastFetchAt = Date.now();
            countdown = IDLE_PERIOD_S;

            inFlight = fetchDocument('https://e-hentai.org/home.php', { anonymous: false })
                .then(doc => {
                    const parsed = parse(doc);
                    if (!parsed) { render('not found', '', false); return; }

                    let diff = '';
                    if (current !== null && !isNaN(parsed.currentNum) && parsed.currentNum > current) {
                        diff = ` <span class="eh-quota-diff">(-${parsed.currentNum - current})</span>`;
                    }
                    current = isNaN(parsed.currentNum) ? current : parsed.currentNum;
                    limit = isNaN(parsed.limitNum) ? limit : parsed.limitNum;

                    const low = limit > 0 && current / limit > 0.9;
                    render(`${parsed.currentText} / ${parsed.limitText}`, diff, low);
                })
                .catch(err => {
                    render(err.kind === 'timeout' ? 'timed out' : 'unavailable', '', false);
                })
                .finally(() => {
                    inFlight = null;
                    renderTimer();
                });

            return inFlight;
        }

        function start(isBusy) {
            if (typeof isBusy === 'function') busyProvider = isBusy;
            if (tickerId) return;
            refresh({ force: true });
            tickerId = setInterval(() => {
                renderTimer();
                if (document.hidden || busyProvider()) return;
                if (--countdown <= 0) refresh({ force: true });
            }, 1000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && !busyProvider()) refresh();
                else renderTimer();
            });
        }

        return {
            start,
            refresh,
            renderTimer,
            get remaining() { return limit !== null && current !== null ? limit - current : null; }
        };
    })();

    // =====================================================================
    // === CURSOR-FOLLOWING POPUP POSITIONER ===============================
    // Uses transform instead of left/top so repositioning stays on the
    // compositor and never triggers layout while the mouse moves.
    // =====================================================================
    function positionPopupAtCursor(popup, clientX, clientY, expectedW, expectedH) {
        const pad = 16;
        const w = expectedW || popup.offsetWidth || 470;
        const h = expectedH || popup.offsetHeight || 380;

        let left = clientX + pad;
        let top = clientY + pad;

        if (left + w > window.innerWidth - 12) left = clientX - w - pad;
        if (left < 12) left = 12;
        if (top + h > window.innerHeight - 12) top = clientY - h - pad;
        if (top < 12) top = 12;

        popup.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    }

    // =====================================================================
    // === SHARED VIEWER-PAGE SCRAPER ======================================
    // One parser used by the downloader, the hover preview and the live
    // thumbnail engine, so a /s/ page is only ever fetched and parsed once.
    // =====================================================================
    const viewerPageCache = new LruMap(400);
    const viewerPageInflight = new Map();

    function parseViewerDoc(doc) {
        const origNode = doc.querySelector('div#i6 a[href*="/fullimg/"]') ||
                         doc.querySelector('a[href*="/fullimg/"]');
        const displayImg = doc.querySelector('img#img');
        const i2Text = (doc.querySelector('#i2') || {}).textContent || '';

        const origRes = origNode ? (origNode.textContent.match(/(\d+\s*x\s*\d+)/i) || [])[1] : null;
        const shownRes = (i2Text.match(/(\d+\s*x\s*\d+)/i) || [])[1];
        const sizeText = (i2Text.match(/::\s*([\d.]+\s*[KMG]B)/i) || [])[1];

        return {
            originalUrl: origNode ? origNode.href : null,
            originalRes: origRes ? origRes.replace(/\s/g, '') : null,
            displayUrl: displayImg ? displayImg.src : null,
            displayRes: shownRes ? shownRes.replace(/\s/g, '') : null,
            sizeText: sizeText || null,
            fileExt: extFromViewerDoc(doc),
            origName: origNameFromViewerDoc(doc),
            pageCount: (readPageNav(doc) || {}).total || null
        };
    }

    /** Fetch + parse a /s/ page once; concurrent callers share one request. */
    function loadViewerInfo(url) {
        const hit = viewerPageCache.get(url);
        if (hit) return Promise.resolve(hit);

        const pending = viewerPageInflight.get(url);
        if (pending) return pending;

        const p = fetchDocument(url)
            .then(doc => {
                const info = parseViewerDoc(doc);
                if (info.originalUrl || info.displayUrl) viewerPageCache.set(url, info);
                return info;
            })
            .finally(() => viewerPageInflight.delete(url));

        viewerPageInflight.set(url, p);
        return p;
    }
    // =====================================================================
    // === ANIMATED THUMBNAIL ENGINE =======================================
    //
    // Three problems with the previous governor, all fixed here:
    //
    //  1. It called getBoundingClientRect() inside a sort comparator and on
    //     every scroll event, forcing synchronous layout O(n log n) times
    //     per scroll. Positions are now measured once into a cache and
    //     recomputed from scrollY alone.
    //  2. Its pacing flag could swallow the "task finished" wake-up, leaving
    //     the queue permanently stalled. Pacing is now a timestamp gate.
    //  3. "Freezing" only toggled display:none, so thumbnails flickered
    //     between the native sprite and the live image while scrolling. A
    //     frozen thumbnail now shows a canvas holding its last frame, so the
    //     picture never disappears and the animated decode really does stop.
    // =====================================================================
    /**
     * The element that actually paints a thumbnail, across every grid layout.
     * Verified against the live site: in the current markup this is
     * `#gdt > a > div > div[title]`, sized to the image itself, while the
     * surrounding cell is ~16px taller because of the "Page N" caption. The
     * download button and the animation layer both anchor here so they sit
     * on the image rather than across the caption.
     *
     * The download button carries a title of its own, so exclude it.
     */
    function resolveThumbBox(itemEl) {
        const titled = itemEl.matches('[title]') && !itemEl.classList.contains('eh-dl-btn')
            ? itemEl
            : itemEl.querySelector('[title]:not(.eh-dl-btn)');
        if (titled) return titled.tagName === 'IMG' ? (titled.parentElement || itemEl) : titled;
        const bg = itemEl.querySelector('div[style*="background"]');
        if (bg) return bg;
        const img = itemEl.querySelector('img');
        if (img) return img.parentElement || itemEl;
        return itemEl.querySelector('a') || itemEl;
    }

    const LiveThumbs = (() => {
        const CONFIG = {
            maxConcurrentFetch: 2,   // parallel /s/ page lookups
            pacingMs: 320,           // minimum gap between lookups
            playBudget: 4,           // thumbnails animating at once
            mountBudget: 14,         // decoded <img> elements kept alive
            evictDistanceVh: 2,      // drop the <img> past this many viewports
            rootMargin: '300px 0px',
            frozenFrameMax: 512,     // cap for the still-frame canvas
            taskTimeoutMs: 90000,    // a task holding a slot longer is stalled
            seedDelayMs: 900         // fallback if the observer never fires
        };

        const STATIC_EXTS = new Set(['jpg', 'jpeg', 'png', 'bmp', 'avif', 'heic']);
        const ANIMATED_EXTS = new Set(['gif', 'webm', 'mp4', 'apng']);

        const states = new Map();
        const queue = [];
        const active = new Set();

        let enabled = false;
        let io = null;
        let pumpTimer = null;
        let lastDispatch = 0;
        let galleryIsAnimated = null;
        let resizeTimer = null;
        let pinnedState = null;
        let watchdogId = null;
        let seedTimer = null;

        /** 0 disables the cap entirely. */
        function sizeCapBytes() {
            const mb = clamp(pref('eh_anim_size_cap_mb'), 0, 512);
            return mb > 0 ? mb * 1024 * 1024 : 0;
        }

        /**
         * Decoding a large animated WebP blocks the main thread, so never let
         * two run at once. Galleries of 60 MB HD animations froze the tab
         * outright before this existed.
         */
        let decodeChain = Promise.resolve();
        function queueDecode(fn) {
            const run = decodeChain.then(fn, fn);
            decodeChain = run.catch(() => {});
            return run;
        }

        // ---------- gallery-level heuristics ----------
        function detectGalleryAnimated() {
            if (galleryIsAnimated !== null) return galleryIsAnimated;
            const tags = $$('#taglist a').map(a => a.textContent.trim().toLowerCase());
            const title = (document.title || '').toLowerCase();
            const h1 = (($('h1') || {}).textContent || '').toLowerCase();
            galleryIsAnimated =
                tags.some(t => t === 'animated' || t === 'other:animated' ||
                               t.includes('webanim') || t.includes('animated gif') ||
                               t.includes('animated webp')) ||
                /\[animated|\(animated/.test(title) ||
                /\[animated|\(animated/.test(h1);
            return galleryIsAnimated;
        }

        function classify(itemEl) {
            const titled = itemEl.matches('[title]') ? itemEl : itemEl.querySelector('[title]');
            const raw = titled ? (titled.getAttribute('title') || '') : '';
            const name = (raw.match(/^Page\s+\d+:\s*(.+)$/i) || [null, raw])[1] || '';
            const ext = ((name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '').toLowerCase();

            // Definitely static: never mount an <img>, keep the free CSS sprite.
            if (STATIC_EXTS.has(ext)) return { isAnimated: false, ext };
            if (ANIMATED_EXTS.has(ext)) return { isAnimated: true, ext };
            // WebP is the ambiguous one; fall back to the gallery's own tags.
            if (ext === 'webp') return { isAnimated: detectGalleryAnimated(), ext };
            return { isAnimated: detectGalleryAnimated(), ext };
        }

        function resolveLink(itemEl) {
            const a = itemEl.matches('a') ? itemEl : itemEl.querySelector('a[href*="/s/"]');
            return a ? a.href : null;
        }

        // ---------- layout cache ----------
        // One batched read pass. Nothing else in this module touches layout,
        // so scrolling never forces a reflow.
        function measureLayout() {
            const scrollY = window.scrollY;
            for (const st of states.values()) {
                const r = st.element.getBoundingClientRect();
                st.docTop = r.top + scrollY;
                st.height = r.height || 1;
            }
        }

        // ---------- status badge ----------
        // Built once, then updated field by field: rebuilding innerHTML on
        // every tick would restart the progress bar's CSS transition and
        // make it stutter instead of sliding.
        let totalAnimated = 0;
        let pausedReason = null;

        function badgeParts() {
            const badge = $('#eh-anim-status');
            if (!badge) return null;
            if (badge.dataset.built !== '1') {
                badge.innerHTML =
                    '<span class="eh-anim-icon">⏳</span>' +
                    '<span class="eh-anim-bar"><i></i></span>' +
                    '<span class="eh-anim-count"></span>' +
                    '<span class="eh-anim-pages"></span>';
                badge.dataset.built = '1';
            }
            return {
                badge,
                icon: badge.querySelector('.eh-anim-icon'),
                fill: badge.querySelector('.eh-anim-bar > i'),
                count: badge.querySelector('.eh-anim-count'),
                pages: badge.querySelector('.eh-anim-pages')
            };
        }

        // Download progress fires many times a second per file, and this
        // walks every state, so coalesce it to one pass per frame.
        const renderStatus = rafThrottle(renderStatusNow);

        function renderStatusNow() {
            const p = badgeParts();
            if (!p) return;

            if (!totalAnimated) { p.badge.style.display = 'none'; return; }

            // "ready" now means the bytes arrived and the frame decoded, so
            // the headline number matches what can actually animate. The bar
            // additionally credits partial downloads, so it keeps creeping
            // forward while a large GIF is still coming in.
            let ready = 0;
            let errored = 0;
            let working = 0;
            let partial = 0;
            let playing = 0;
            let oversize = 0;
            for (const st of states.values()) {
                if (!st.isAnimated) continue;
                if (st.status === 'ready') {
                    ready++;
                    if (st.playing) playing++;
                } else if (st.status === 'error') {
                    errored++;
                } else if (st.status === 'oversize') {
                    oversize++;
                } else if (st.status === 'probing' || st.status === 'loading') {
                    working++;
                    partial += st.progress || 0;
                }
            }

            const settled = ready + errored + oversize;
            const pct = Math.round(((settled + partial) / totalAnimated) * 100);
            const finished = settled >= totalAnimated;

            p.badge.style.display = 'inline-flex';
            p.badge.classList.toggle('is-done', finished && !pausedReason);
            p.badge.classList.toggle('is-paused', !!pausedReason);
            p.badge.classList.toggle('is-error', !pausedReason && finished && errored > 0);

            p.icon.textContent = pausedReason ? '⚠' : finished ? '🎬' : '⏳';
            p.icon.classList.toggle('eh-anim-spin-icon', !finished && !pausedReason && working > 0);

            p.fill.style.width = pct + '%';
            p.count.textContent = `${ready} / ${totalAnimated}`;

            if (pausedReason) {
                p.pages.textContent = pausedReason;
            } else if (working) {
                p.pages.textContent = `${working}↓` + (queue.length ? ` · +${queue.length}` : '');
            } else if (queue.length) {
                p.pages.textContent = `+${queue.length} queued`;
            } else if (finished) {
                p.pages.textContent = errored ? `${errored} failed`
                                    : oversize ? `${oversize} too big`
                                    : `${playing} playing`;
            } else {
                p.pages.textContent = '';
            }

            p.badge.title = pausedReason
                ? pausedReason + ' — click to resume'
                : [
                    `${ready} of ${totalAnimated} loaded and ready`,
                    working ? `${working} downloading` : null,
                    queue.length ? `${queue.length} waiting` : null,
                    oversize ? `${oversize} above the size limit (click one to load it)` : null,
                    errored ? `${errored} failed` : null,
                    CONFIG.playBudget === 0
                        ? `${playing} playing (hover-only mode)`
                        : `${playing} playing now (budget ${CONFIG.playBudget})`
                  ].filter(Boolean).join(' · ');
        }

        // ---------- fetch queue ----------
        function enqueue(st, front = false) {
            if (!enabled || st.status !== 'idle') return;
            st.status = 'queued';
            // Score now, from the cached layout, so the very first batch is
            // already ordered by distance rather than by document order.
            // A hovered thumbnail jumps the queue outright; pump() re-sorts
            // by distance, so "front" has to be expressed as a score that
            // the budget pass will not overwrite on the next frame.
            if (front) st.urgent = true;
            st.dist = front
                ? -1
                : Math.abs((st.docTop + st.height / 2) - (window.scrollY + window.innerHeight / 2));
            queue.push(st);
            renderStatus();
            pump();
        }

        function pump() {
            if (!enabled || pumpTimer) return;
            while (active.size < CONFIG.maxConcurrentFetch && queue.length) {
                const wait = CONFIG.pacingMs - (performance.now() - lastDispatch);
                if (wait > 0) {
                    // Timestamp gate, not a boolean lock: a task completing
                    // during the pause can never lose its wake-up.
                    pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, wait);
                    return;
                }
                queue.sort((a, b) => a.dist - b.dist);
                const st = queue.shift();
                if (!st) break;
                lastDispatch = performance.now();
                dispatch(st);
            }
        }

        /**
         * Show one thumbnail's real phase on the thumbnail itself. A still
         * picture must never be ambiguous: the user has to be able to tell
         * "still downloading" from "downloaded" from "downloaded but
         * deliberately paused to save CPU".
         */
        /**
         * One chip carries the whole lifecycle of a thumbnail, so there is
         * never a second indicator to collide with it or with the download
         * button. Rendering is wrapped defensively: a single malformed cell
         * must not be able to throw out of the queue's finally block and
         * wedge the loader.
         */
        function renderThumbState(st) {
            try {
                if (!st.box) return;
                const s = st.status;
                const busy = s === 'probing' || s === 'loading';

                if (s === 'idle' || s === 'queued') {
                    if (st.overlay) st.overlay.remove();
                    st.overlay = null;
                    st.chip = null;
                    st.bar = null;
                    st.box.classList.remove('eh-thumb-fetching');
                    return;
                }

                ensureOverlay(st);
                st.box.classList.toggle('eh-thumb-fetching', busy);

                const ext = (st.ext || 'anim').toUpperCase().slice(0, 4);
                const pct = Math.round((st.progress || 0) * 100);
                let cls = 'eh-chip';
                let text = '';
                let title = '';

                if (s === 'probing') {
                    cls += ' is-finding';
                    text = '⚙ finding…';
                    title = 'Looking up the image address';
                } else if (s === 'loading') {
                    cls += ' is-loading';
                    text = st.total ? `↓ ${pct}%` : `↓ ${formatBytes(st.loaded || 0)}`;
                    title = st.total
                        ? `Downloading ${ext} — ${formatBytes(st.loaded || 0)} of ${formatBytes(st.total)}`
                        : `Downloading ${ext}`;
                } else if (s === 'ready') {
                    if (st.playing) {
                        cls += ' is-playing';
                        text = `▶ ${ext}`;
                        title = `Loaded and playing · ${formatBytes(st.bytes || 0)}`;
                    } else {
                        cls += ' is-paused';
                        text = `❚❚ ${ext}`;
                        title = `Loaded (${formatBytes(st.bytes || 0)}) · paused to save CPU — hover to play`;
                    }
                } else if (s === 'oversize') {
                    cls += ' is-oversize';
                    text = `▶ ${formatBytes(st.bytes || 0)}`;
                    title = `${formatBytes(st.bytes || 0)} — above the auto-load limit. ` +
                            'Click to load this one anyway.';
                } else {
                    cls += ' is-error';
                    text = `⚠ ${st.errorText || 'failed'}`;
                    title = `${st.errorText || 'Failed'} — click to retry`;
                }

                st.chip.className = cls;
                st.chip.textContent = text;
                st.chip.title = title;

                if (s === 'loading') {
                    if (!st.bar || !st.bar.isConnected) {
                        st.bar = document.createElement('div');
                        st.bar.className = 'eh-thumb-bar';
                        st.bar.dataset.eh = '';
                        st.bar.innerHTML = '<i></i>';
                        st.overlay.appendChild(st.bar);
                    }
                    st.bar.firstChild.style.width = pct + '%';
                } else if (st.bar) {
                    st.bar.remove();
                    st.bar = null;
                }
            } catch (err) {
                console.warn('[ExHD] thumbnail indicator failed', err);
            }
        }

        /**
         * A thumbnail goes through two distinct network phases, and the slot
         * is held for both. The previous build marked a thumbnail finished
         * once phase one resolved, so the counter reported files that had
         * only had their URL discovered -- the bytes were often still in
         * flight, which is why far fewer thumbnails were animating than the
         * badge claimed.
         *
         *   probing  -- fetch the /s/ page to discover the image URL
         *   loading  -- pull the actual bytes, with real progress
         *   ready    -- decoded and mountable
         */
        async function dispatch(st) {
            st.urgent = false;
            st.startedAt = performance.now();
            active.add(st);
            st.status = 'probing';
            st.progress = 0;
            renderThumbState(st);
            renderStatus();

            try {
                const info = await loadViewerInfo(st.pageUrl);
                // The resampled view is animated too and costs far less
                // bandwidth and quota than pulling the original.
                st.src = info.displayUrl || info.originalUrl;
                if (!st.src) throw new EhError('parse', 'no image source');

                st.status = 'loading';
                renderThumbState(st);
                renderStatus();

                await downloadImage(st);
                await mount(st);

                st.status = 'ready';
            } catch (err) {
                if (err && err.kind === OVERSIZE) {
                    // Not a failure: the file is simply too heavy to play
                    // automatically. Offer it instead of forcing it.
                    st.status = 'oversize';
                    st.errorText = null;
                    return;
                }
                st.status = 'error';
                st.errorText = err && err.kind === 'timeout' ? 'timeout'
                             : err && err.kind === QUOTA_HALT ? 'limit'
                             : err && err.kind === 'http' ? 'HTTP ' + err.detail
                             : 'failed';
                if (err && err.kind === QUOTA_HALT) {
                    // Stop burning requests the moment limits are hit,
                    // but keep the thumbnails that already loaded.
                    pause('Animation paused — image limit reached');
                    Quota.refresh({ force: true });
                } else if (err && err.kind !== 'abort') {
                    console.warn('[ExHD] live thumb failed', st.pageUrl, err);
                }
            } finally {
                st.request = null;
                active.delete(st);
                renderThumbState(st);
                renderStatus();
                updateBudget();
                pump();
            }
        }

        /**
         * Pull the image through GM_xmlhttpRequest instead of assigning
         * img.src directly. A plain <img> reports no progress at all, and the
         * hath.network hosts that serve thumbnails send no CORS headers, so
         * fetch() cannot read them either. Keeping the blob means a thumbnail
         * evicted to free memory re-mounts without touching the network.
         */
        function downloadImage(st) {
            if (st.objectUrl) return Promise.resolve();

            const cap = sizeCapBytes();
            let refused = false;

            const req = gmRequest({
                url: st.src,
                responseType: 'blob',
                headers: { Referer: st.pageUrl },
                timeout: 120000,
                onprogress: p => {
                    if (!p.lengthComputable) return;
                    // Content-Length arrives with the first progress tick, so
                    // an oversized file costs a few KB rather than freezing the
                    // tab on a multi-hundred-megabyte animated decode.
                    if (cap && p.total > cap && !st.forced) {
                        refused = true;
                        st.bytes = p.total;
                        try { req.abort(); } catch { /* already settled */ }
                        return;
                    }
                    st.loaded = p.loaded;
                    st.total = p.total;
                    st.progress = p.total ? p.loaded / p.total : 0;
                    renderThumbState(st);
                    renderStatus();
                }
            });
            st.request = req;

            return req.then(res => {
                if (res.status !== 200) throw new EhError('http', 'HTTP ' + res.status, res.status);
                const blob = res.response;
                assertRealImage(blob, res);
                if (cap && !st.forced && blob.size > cap) {
                    st.bytes = blob.size;
                    throw new EhError(OVERSIZE, 'too large');
                }
                st.bytes = blob.size;
                st.loaded = blob.size;
                st.progress = 1;
                st.objectUrl = URL.createObjectURL(blob);
            }, err => {
                if (refused) throw new EhError(OVERSIZE, 'too large');
                throw err;
            });
        }

        // ---------- element lifecycle ----------
        /** The grid markup differs between thumbnail sizes, so guarantee the
         *  containing block here rather than trusting a selector to have
         *  matched this particular layout. */
        function ensureBoxIsContainer(st) {
            const cs = getComputedStyle(st.box);
            if (cs.position === 'static') st.box.style.position = 'relative';
            if (cs.overflow === 'visible') st.box.style.overflow = 'hidden';
        }

        function ensureLayer(st) {
            if (st.layer && st.layer.isConnected) return st.layer;
            ensureBoxIsContainer(st);

            const layer = document.createElement('div');
            layer.className = 'eh-live-layer';
            layer.dataset.eh = '';   // keeps the site's and our own box rules off it

            const img = document.createElement('img');
            img.decoding = 'async';
            img.alt = '';
            const canvas = document.createElement('canvas');

            layer.append(img, canvas);
            st.box.appendChild(layer);

            st.layer = layer;
            st.img = img;
            st.canvas = canvas;
            return layer;
        }

        /**
         * All indicators live inside one positioned container. Keeping them
         * as static children of a single slot means the site's own offset
         * rules cannot displace them, and only this one wrapper is ever the
         * thumbnail box's last child.
         */
        function ensureOverlay(st) {
            if (st.overlay && st.overlay.isConnected) return st.overlay;
            ensureBoxIsContainer(st);

            const overlay = document.createElement('div');
            overlay.className = 'eh-overlay';
            overlay.dataset.eh = '';

            const slot = document.createElement('div');
            slot.className = 'eh-overlay-slot';
            slot.dataset.eh = '';

            const chip = document.createElement('div');
            chip.className = 'eh-chip';
            chip.dataset.eh = '';
            chip.addEventListener('click', e => {
                if (st.status !== 'error' && st.status !== 'oversize') return;
                e.preventDefault();
                e.stopPropagation();
                // Clicking an oversized thumbnail is explicit consent to pay
                // the decode cost for that one file.
                if (st.status === 'oversize') st.forced = true;
                retry(st);
            });

            slot.appendChild(chip);
            overlay.appendChild(slot);
            st.box.appendChild(overlay);

            st.overlay = overlay;
            st.chip = chip;
            st.bar = null;
            return overlay;
        }

        /** Put a failed thumbnail back at the head of the queue. */
        function retry(st) {
            if (!enabled) return;
            st.status = 'idle';
            st.errorText = null;
            st.progress = 0;
            st.loaded = 0;
            st.total = 0;
            renderThumbState(st);
            enqueue(st, true);
        }

        /** Decode before showing, so a thumbnail never flashes half-painted. */
        function mount(st) {
            if (!enabled || !st.objectUrl || st.mounting) return Promise.resolve();
            ensureLayer(st);
            if (st.mounted) return Promise.resolve();

            st.mounting = true;
            st.img.src = st.objectUrl;   // already downloaded, so this is local

            // Serialised: two big animated decodes at once lock up the tab.
            const decoded = queueDecode(() => (st.img.decode
                ? st.img.decode()
                : new Promise((res, rej) => { st.img.onload = res; st.img.onerror = rej; })));

            return decoded.then(() => {
                st.mounted = true;
                st.mounting = false;
                st.layer.classList.add('is-shown');
                renderThumbState(st);
                updateBudget();
            }).catch(err => {
                st.mounting = false;
                throw err;
            });
        }

        /** Snapshot the current frame so freezing never blanks the thumbnail. */
        function captureFrame(st) {
            if (!st.mounted || !st.img.naturalWidth) return false;
            const { naturalWidth: nw, naturalHeight: nh } = st.img;
            const scale = Math.min(1, CONFIG.frozenFrameMax / Math.max(nw, nh));
            const w = Math.max(1, Math.round(nw * scale));
            const h = Math.max(1, Math.round(nh * scale));
            try {
                if (st.canvas.width !== w) st.canvas.width = w;
                if (st.canvas.height !== h) st.canvas.height = h;
                const ctx = st.canvas.getContext('2d');
                ctx.drawImage(st.img, 0, 0, w, h);
                st.hasFrame = true;
                return true;
            } catch {
                // Cross-origin draws are allowed; only readback would throw.
                return false;
            }
        }

        function play(st) {
            if (!st.mounted) { mount(st).catch(() => { st.status = 'error'; }); return; }
            if (st.playing) return;
            st.playing = true;
            st.layer.classList.remove('is-frozen');
            renderThumbState(st);
        }

        function freeze(st) {
            if (!st.layer) return;
            if (st.playing || !st.hasFrame) captureFrame(st);
            if (!st.hasFrame) return;      // nothing to show yet; keep playing
            st.playing = false;
            st.layer.classList.add('is-frozen');
            renderThumbState(st);
        }

        /** Release decoded animation frames while keeping the still visible. */
        function evict(st) {
            if (!st.layer || !st.mounted) return;
            if (!st.hasFrame && !captureFrame(st)) return;
            freeze(st);
            st.mounted = false;
            st.playing = false;
            st.img.removeAttribute('src');
        }

        // ---------- budget governor ----------
        const updateBudget = rafThrottle(() => {
            if (!enabled) return;

            const vh = window.innerHeight;
            const sy = window.scrollY;
            const viewCenter = sy + vh / 2;
            const evictBeyond = vh * CONFIG.evictDistanceVh;

            const ready = [];
            for (const st of states.values()) {
                if (!st.isAnimated) continue;
                const center = st.docTop + st.height / 2;
                st.dist = st.urgent ? -1 : Math.abs(center - viewCenter);
                st.inView = st.docTop < sy + vh && st.docTop + st.height > sy;
                if (st.status === 'ready') ready.push(st);
            }

            ready.sort((a, b) => a.dist - b.dist);

            let playing = 0;
            let mounted = 0;
            for (const st of ready) {
                if (st.pinned || (st.inView && playing < CONFIG.playBudget)) {
                    play(st);
                    playing++;
                    mounted++;
                } else if (mounted < CONFIG.mountBudget && st.dist < evictBeyond) {
                    freeze(st);
                    mounted++;
                } else {
                    evict(st);
                }
            }
        });

        /** Named so that resume() can re-attach the same observer callback. */
        function onIntersect(entries) {
            for (const entry of entries) {
                const st = states.get(entry.target);
                if (!st || !st.isAnimated) continue;
                if (entry.isIntersecting && st.status === 'idle') enqueue(st);
            }
            updateBudget();
        }

        const onScroll = () => updateBudget();

        function onResize() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { measureLayout(); updateBudget(); }, 200);
        }

        // Hover promotes a thumbnail past the budget, via one delegated
        // listener rather than one per grid item.
        function onPointerOver(e) {
            if (!enabled) return;
            const item = e.target.closest ? e.target.closest('#gdt > *') : null;
            if (!item) return;
            const st = states.get(item);
            if (!st || !st.isAnimated) return;

            if (st.status === 'idle') { enqueue(st, true); return; }
            if (st.status !== 'ready') return;

            if (pinnedState && pinnedState !== st) pinnedState.pinned = false;
            pinnedState = st;
            st.pinned = true;
            updateBudget();
        }

        function onPointerOut(e) {
            if (!enabled || !pinnedState) return;
            const item = e.target.closest ? e.target.closest('#gdt > *') : null;
            if (item && states.get(item) === pinnedState) {
                pinnedState.pinned = false;
                pinnedState = null;
                updateBudget();
            }
        }

        // ---------- public API ----------
        function enable() {
            const gdt = $('#gdt');
            if (!gdt || enabled) return;
            enabled = true;

            // One unreadable cell must not abort the whole setup pass.
            Array.from(gdt.children).forEach((itemEl, idx) => {
                let box, pageUrl, isAnimated = false, ext = '';
                try {
                    box = resolveThumbBox(itemEl);
                    pageUrl = resolveLink(itemEl);
                    ({ isAnimated, ext } = classify(itemEl));
                } catch (err) {
                    console.warn('[ExHD] skipping unreadable grid cell', idx + 1, err);
                    return;
                }

                states.set(itemEl, {
                    index: idx + 1, element: itemEl, box, pageUrl,
                    isAnimated: isAnimated && !!pageUrl && !!box, ext,
                    status: 'idle', src: null,
                    layer: null, img: null, canvas: null,
                    overlay: null, chip: null, bar: null, startedAt: 0,
                    mounted: false, mounting: false, playing: false,
                    hasFrame: false, pinned: false, urgent: false,
                    docTop: 0, height: 1, dist: Infinity, inView: false,
                    // download bookkeeping
                    objectUrl: null, request: null, forced: false,
                    progress: 0, loaded: 0, total: 0, bytes: 0, errorText: null
                });
            });

            totalAnimated = 0;
            for (const st of states.values()) if (st.isAnimated) totalAnimated++;
            pausedReason = null;

            CONFIG.playBudget = clamp(pref('eh_anim_play_budget'), 0, 12);
            CONFIG.maxConcurrentFetch = clamp(pref('eh_anim_concurrency'), 1, 4);

            measureLayout();

            io = new IntersectionObserver(onIntersect,
                { root: null, rootMargin: CONFIG.rootMargin, threshold: 0 });

            for (const st of states.values()) {
                if (st.isAnimated) io.observe(st.element);
            }

            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onResize, { passive: true });
            gdt.addEventListener('pointerover', onPointerOver, { passive: true });
            gdt.addEventListener('pointerout', onPointerOut, { passive: true });

            startWatchdog();
            clearTimeout(seedTimer);
            seedTimer = setTimeout(seedIfIdle, CONFIG.seedDelayMs);

            updateBudget();
            renderStatus();
        }

        function disable() {
            if (!enabled) return;
            enabled = false;

            if (io) { io.disconnect(); io = null; }
            clearTimeout(pumpTimer); pumpTimer = null;
            clearTimeout(resizeTimer); resizeTimer = null;
            clearTimeout(seedTimer); seedTimer = null;
            clearInterval(watchdogId); watchdogId = null;
            queue.length = 0;
            active.clear();

            // Drop in-flight transfers and release every blob before the
            // states that own them go away, or the memory leaks for the
            // lifetime of the tab.
            for (const st of states.values()) {
                if (st.request && st.request.abort) { try { st.request.abort(); } catch { /* done */ } }
                if (st.objectUrl) URL.revokeObjectURL(st.objectUrl);
                st.objectUrl = null;
                st.request = null;
            }

            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            const gdt = $('#gdt');
            if (gdt) {
                gdt.removeEventListener('pointerover', onPointerOver);
                gdt.removeEventListener('pointerout', onPointerOut);
            }

            $$('.eh-live-layer, .eh-overlay, .eh-anim-badge, .eh-thumb-status, .eh-thumb-bar')
                .forEach(el => el.remove());
            $$('.eh-thumb-fetching').forEach(el => el.classList.remove('eh-thumb-fetching'));

            states.clear();
            pinnedState = null;
            totalAnimated = 0;
            pausedReason = null;
            const badge = $('#eh-anim-status');
            if (badge) { badge.style.display = 'none'; delete badge.dataset.built; }
        }

        /**
         * Stop fetching more images but leave everything already on screen
         * alone. Used when the account hits its image limit: tearing the
         * whole grid down would throw away work that cost quota to load.
         */
        function pause(reason) {
            queue.forEach(st => { st.status = 'idle'; renderThumbState(st); });
            queue.length = 0;
            clearTimeout(pumpTimer);
            pumpTimer = null;
            if (io) { io.disconnect(); io = null; }

            // Cancel transfers that are still running; finishing them would
            // spend quota we already know we do not have.
            for (const st of active) {
                if (st.request && st.request.abort) { try { st.request.abort(); } catch { /* done */ } }
            }

            pausedReason = reason;
            renderStatus();
        }

        /**
         * Pausing used to be terminal: the observer was gone and nothing
         * could ever restart it short of reloading the page. A halt caused by
         * a transient limit must be recoverable.
         */
        function resume() {
            if (!enabled || !pausedReason) return;
            pausedReason = null;

            for (const st of states.values()) {
                if (st.status === 'error' && st.errorText === 'limit') {
                    st.status = 'idle';
                    st.errorText = null;
                    renderThumbState(st);
                }
            }

            if (!io) {
                io = new IntersectionObserver(onIntersect,
                    { root: null, rootMargin: CONFIG.rootMargin, threshold: 0 });
                for (const st of states.values()) if (st.isAnimated) io.observe(st.element);
            }

            seedIfIdle();
            renderStatus();
            pump();
        }

        /**
         * A task that never settles holds a concurrency slot for good, and
         * once both slots are held the pump can no longer dispatch anything:
         * the whole loader looks frozen even though nothing crashed. Reclaim
         * slots from stalled tasks so one bad file cannot stop the rest.
         */
        function startWatchdog() {
            clearInterval(watchdogId);
            watchdogId = setInterval(() => {
                if (!enabled) return;
                const now = performance.now();
                let reclaimed = 0;
                for (const st of Array.from(active)) {
                    if (now - (st.startedAt || now) < CONFIG.taskTimeoutMs) continue;
                    if (st.request && st.request.abort) {
                        try { st.request.abort(); } catch { /* already finished */ }
                    }
                    st.status = 'error';
                    st.errorText = 'stalled';
                    active.delete(st);
                    renderThumbState(st);
                    reclaimed++;
                }
                if (reclaimed) {
                    console.warn(`[ExHD] reclaimed ${reclaimed} stalled animation slot(s)`);
                    renderStatus();
                    pump();
                }
            }, 5000);
        }

        /**
         * IntersectionObserver occasionally delivers nothing on a freshly
         * restored page, leaving the queue empty and the grid inert. If no
         * work has appeared shortly after enabling, seed it by hand.
         */
        function seedIfIdle() {
            if (!enabled || queue.length || active.size) return;
            const limit = window.scrollY + window.innerHeight + 200;
            let seeded = 0;
            for (const st of states.values()) {
                if (!st.isAnimated || st.status !== 'idle') continue;
                if (st.docTop < limit) { enqueue(st); seeded++; }
            }
            if (seeded) console.info(`[ExHD] observer was quiet; seeded ${seeded} thumbnail(s)`);
        }

        /** Live-apply the budget sliders without reloading the grid. */
        function setConfig({ playBudget, concurrency }) {
            if (playBudget != null) CONFIG.playBudget = clamp(playBudget, 0, 12);
            if (concurrency != null) CONFIG.maxConcurrentFetch = clamp(concurrency, 1, 4);
            if (enabled) { updateBudget(); pump(); }
        }

        function countAnimatedCandidates() {
            const gdt = $('#gdt');
            if (!gdt) return 0;
            let n = 0;
            for (const item of gdt.children) if (classify(item).isAnimated) n++;
            return n;
        }

        return {
            enable, disable, setConfig, resume, countAnimatedCandidates,
            get isEnabled() { return enabled; },
            get isPaused() { return !!pausedReason; }
        };
    })();
    // =====================================================================
    // === DOWNLOAD QUEUE ==================================================
    // =====================================================================
    const PAGE_RE = /\/s\/[0-9a-fA-F]+\/(\d+)-(\d+)/;

    function setBtn(btn, state, text, title) {
        if (!btn) return;
        btn.className = 'eh-dl-btn' + (state ? ' state-' + state : '');
        btn.textContent = text;
        btn.title = title || '';
        if (state !== 'dl') btn.style.removeProperty('--eh-pct');
    }

    const DownloadQueue = (() => {
        const pending = [];
        const failures = new Map();      // pageNum -> task
        let current = null;
        let activeReq = null;
        let running = false;
        let halted = false;

        let completed = 0;
        let failedCount = 0;
        let totalAdded = 0;
        let bytesThisRun = 0;
        let runStartedAt = 0;

        let ui = null;

        const isBusy = () => running || pending.length > 0;

        // ---------- manager UI ----------
        function buildManager() {
            const el = document.createElement('div');
            el.id = 'eh-dl-manager';
            el.innerHTML = `
                <div class="eh-mgr-header" id="eh-mgr-drag">
                    <span>Download Manager</span>
                    <div class="eh-mgr-header-actions">
                        <span id="eh-mgr-count">0 queued</span>
                        <button type="button" id="eh-mgr-min" class="eh-mgr-min-btn" title="Collapse">–</button>
                        <button type="button" id="eh-mgr-stop-all" class="eh-mgr-stop-btn">✕ Cancel All</button>
                    </div>
                </div>
                <div class="eh-mgr-body">
                    <div id="eh-mgr-title" class="eh-mgr-title">Idle</div>
                    <div class="eh-progress-bg">
                        <div id="eh-progress-fill" class="eh-progress-fill"></div>
                        <div id="eh-progress-text" class="eh-progress-text">0%</div>
                    </div>
                    <div class="eh-mgr-stats">
                        <span id="eh-mgr-quota">Quota: …</span>
                        <span id="eh-mgr-rate"></span>
                        <span id="eh-mgr-total">0 / 0</span>
                    </div>
                    <div id="eh-mgr-alert" class="eh-mgr-alert"></div>
                    <div id="eh-mgr-queue-list" class="eh-mgr-queue-list"></div>
                </div>`;
            document.body.appendChild(el);

            ui = {
                root: el,
                title: $('#eh-mgr-title', el),
                fill: $('#eh-progress-fill', el),
                pct: $('#eh-progress-text', el),
                count: $('#eh-mgr-count', el),
                total: $('#eh-mgr-total', el),
                rate: $('#eh-mgr-rate', el),
                alert: $('#eh-mgr-alert', el),
                list: $('#eh-mgr-queue-list', el)
            };

            $('#eh-mgr-stop-all', el).addEventListener('click', cancelAll);
            $('#eh-mgr-min', el).addEventListener('click', () => {
                el.classList.toggle('collapsed');
                setSetting('eh_mgr_collapsed', el.classList.contains('collapsed'));
            });
            if (getSetting('eh_mgr_collapsed', false)) el.classList.add('collapsed');

            makeDraggable(el, $('#eh-mgr-drag', el));
            return el;
        }

        function makeDraggable(el, handle) {
            const saved = getSetting('eh_mgr_pos', '');
            if (saved) {
                const [x, y] = String(saved).split(',').map(Number);
                if (!isNaN(x) && !isNaN(y)) {
                    el.style.left = clamp(x, 0, Math.max(0, innerWidth - 80)) + 'px';
                    el.style.top = clamp(y, 0, Math.max(0, innerHeight - 40)) + 'px';
                    el.style.right = 'auto';
                    el.style.bottom = 'auto';
                }
            }

            let dragging = false;
            let offX = 0;
            let offY = 0;

            handle.addEventListener('pointerdown', e => {
                if (e.target.closest('button')) return;
                dragging = true;
                const r = el.getBoundingClientRect();
                offX = e.clientX - r.left;
                offY = e.clientY - r.top;
                handle.setPointerCapture(e.pointerId);
            });

            handle.addEventListener('pointermove', rafThrottle(e => {
                if (!dragging) return;
                const x = clamp(e.clientX - offX, 0, innerWidth - el.offsetWidth);
                const y = clamp(e.clientY - offY, 0, innerHeight - 40);
                el.style.left = x + 'px';
                el.style.top = y + 'px';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
            }));

            handle.addEventListener('pointerup', e => {
                if (!dragging) return;
                dragging = false;
                handle.releasePointerCapture(e.pointerId);
                setSetting('eh_mgr_pos', `${parseInt(el.style.left, 10)},${parseInt(el.style.top, 10)}`);
            });
        }

        function showAlert(msg) {
            if (!ui) return;
            ui.alert.textContent = msg;
            ui.alert.classList.add('is-shown');
        }

        function clearAlert() {
            if (ui) ui.alert.classList.remove('is-shown');
        }

        function setProgress(pct, loaded, total) {
            if (!ui) return;
            const p = clamp(Math.round(pct), 0, 100);
            ui.fill.style.width = p + '%';
            ui.pct.textContent = loaded != null && total
                ? `${p}%  ·  ${formatBytes(loaded)} / ${formatBytes(total)}`
                : p + '%';
        }

        const renderUI = rafThrottle(() => {
            if (!ui) return;
            const busy = isBusy();
            const topCancel = $('#eh-cancel-all-btn');
            if (topCancel) topCancel.style.display = busy ? 'inline-flex' : 'none';
            const topRetry = $('#eh-retry-btn');
            if (topRetry) topRetry.style.display = failures.size ? 'inline-flex' : 'none';

            ui.root.classList.toggle('active', busy || failures.size > 0);
            if (!busy && !failures.size) return;

            ui.count.textContent = `${pending.length} queued`;
            ui.total.textContent = `${completed} / ${totalAdded}` + (failedCount ? ` · ${failedCount} failed` : '');

            if (running && runStartedAt && bytesThisRun > 0) {
                const secs = (performance.now() - runStartedAt) / 1000;
                const rate = bytesThisRun / secs;
                const left = pending.length + (current ? 1 : 0);
                const avg = bytesThisRun / Math.max(1, completed || 1);
                ui.rate.textContent = `${formatBytes(rate)}/s · ~${formatDuration((left * avg) / Math.max(rate, 1))}`;
            } else {
                ui.rate.textContent = '';
            }

            ui.list.textContent = '';
            const rows = [];
            for (const task of failures.values()) rows.push({ task, failed: true });
            for (const task of pending.slice(0, 8)) rows.push({ task, failed: false });

            for (const { task, failed } of rows.slice(0, 10)) {
                const row = document.createElement('div');
                row.className = 'eh-mgr-queue-item' + (failed ? ' is-failed' : '');
                const label = document.createElement('span');
                label.textContent = failed ? `Page ${task.pageNum} — ${task.error || 'failed'}` : `Page ${task.pageNum}`;
                const action = document.createElement('span');
                action.className = 'eh-queue-item-remove';
                action.textContent = failed ? '↻' : '✕';
                action.title = failed ? 'Retry' : 'Remove from queue';
                action.addEventListener('click', ev => {
                    ev.stopPropagation();
                    if (failed) { failures.delete(task.pageNum); push(task); }
                    else remove(task.pageNum);
                });
                row.append(label, action);
                ui.list.appendChild(row);
            }

            if (pending.length > 8) {
                const more = document.createElement('div');
                more.className = 'eh-mgr-queue-item';
                more.style.fontStyle = 'italic';
                more.textContent = `…and ${pending.length - 8} more`;
                ui.list.appendChild(more);
            }
        });

        // ---------- queue operations ----------
        function restoreBtn(task) {
            const gid = task.galleryId || getGalleryIdFromLocation();
            if (History.isSaved(gid, task.pageNum)) {
                const meta = History.forGallery(gid)[String(task.pageNum)] || {};
                setBtn(task.btn, 'saved', '✓ Saved',
                    `Downloaded ${new Date(meta.time).toLocaleDateString()}. Click to re-download.`);
            } else {
                setBtn(task.btn, '', '⬇ Download');
            }
        }

        function push(task) {
            if (halted) return;
            if (current && current.pageNum === task.pageNum) return;
            if (pending.some(t => t.pageNum === task.pageNum)) return;

            if (failures.delete(task.pageNum)) failedCount = Math.max(0, failedCount - 1);
            task.error = null;
            setBtn(task.btn, 'queued', '⏳ Queued ✕', 'Click to remove from queue');
            pending.push(task);
            totalAdded++;
            renderUI();
            run();
        }

        function remove(pageNum) {
            const i = pending.findIndex(t => t.pageNum === pageNum);
            if (i === -1) return;
            const [task] = pending.splice(i, 1);
            restoreBtn(task);
            renderUI();
        }

        function cancelAll() {
            halted = false;
            clearAlert();
            if (activeReq) { try { activeReq.abort(); } catch { /* already done */ } }
            activeReq = null;

            if (current) { restoreBtn(current); current = null; }
            pending.forEach(restoreBtn);
            pending.length = 0;
            failures.clear();
            failedCount = 0;

            running = false;
            setProgress(0);
            if (ui) ui.title.textContent = 'Cancelled';
            Quota.renderTimer();
            renderUI();
        }

        function haltForQuota(message) {
            halted = true;
            pending.forEach(restoreBtn);
            pending.length = 0;
            showAlert(`${message} Downloads stopped. The counter above refreshes automatically — resume when it recovers.`);
            Quota.refresh({ force: true });
        }

        function run() {
            if (running || halted || !pending.length) return;
            running = true;
            if (!runStartedAt) runStartedAt = performance.now();
            Quota.renderTimer();

            current = pending.shift();
            renderUI();

            processTask(current).then(outcome => {
                if (outcome === 'ok') completed++;
                running = false;
                current = null;
                activeReq = null;
                renderUI();
                Quota.renderTimer();

                if (outcome === 'quota') return;      // haltForQuota already ran
                // Refresh the counter beside the next download, not before it.
                Quota.refresh();
                if (!pending.length) {
                    runStartedAt = 0;
                    bytesThisRun = 0;
                    if (ui) ui.title.textContent = failedCount ? `Finished with ${failedCount} failure(s)` : 'All downloads finished';
                }
                run();
            });
        }

        async function processTask(task) {
            const { viewerUrl, pageNum, btn } = task;
            const galleryId = task.galleryId || getGalleryIdFromLocation();

            setBtn(btn, 'scan', '⟳ Searching…');
            if (ui) ui.title.textContent = `Page ${pageNum} — resolving source…`;
            setProgress(0);

            try {
                const info = await withRetry(() => loadViewerInfo(viewerUrl), {
                    attempts: 3,
                    onRetry: n => setBtn(btn, 'scan', `⟳ Retry ${n}…`)
                });

                const targetUrl = info.originalUrl || info.displayUrl;
                if (!targetUrl) throw new EhError('parse', 'No image source on page');

                const isOriginal = !!info.originalUrl;
                const resLabel = (isOriginal ? info.originalRes : info.displayRes) ||
                                 (isOriginal ? 'original' : 'resampled');
                const label = isOriginal ? resLabel : `${resLabel} [resampled]`;

                setBtn(btn, 'dl', '↓ 0%');
                if (ui) ui.title.textContent = `Page ${pageNum} · ${label}`;

                let lastLoaded = 0;
                const onprogress = p => {
                    if (!p.lengthComputable) return;
                    bytesThisRun += Math.max(0, p.loaded - lastLoaded);
                    lastLoaded = p.loaded;
                    const pct = Math.round((p.loaded / p.total) * 100);
                    btn.style.setProperty('--eh-pct', pct + '%');
                    btn.textContent = `↓ ${pct}%`;
                    setProgress(pct, p.loaded, p.total);
                };

                const { blob, res } = await withRetry(
                    () => fetchImageBlob(targetUrl, {
                        referer: viewerUrl,
                        onprogress,
                        onHandle: req => { activeReq = req; }
                    }),
                    { attempts: 3, onRetry: n => setBtn(btn, 'dl', `↻ Retry ${n}…`) }
                );

                const ext = (await sniffExtension(blob)) ||
                            extFromContentType(res.responseHeaders) ||
                            info.fileExt ||
                            extFromUrl(targetUrl) ||
                            'jpg';

                const filename = buildFilename(pref('eh_filename_template'), filenameVars({
                    title: getGalleryTitle(),
                    page: pageNum,
                    total: info.pageCount || getGalleryPageCount(),
                    gid: galleryId,
                    res: resLabel,
                    origName: info.origName,
                    ext
                }));
                saveBlob(blob, filename);

                const sizeText = formatBytes(blob.size);
                History.mark(galleryId, pageNum, { res: label, size: sizeText });
                refreshGallerySavedStats();

                setBtn(btn, 'saved', `✓ Saved ${sizeText}`,
                    `Downloaded ${new Date().toLocaleDateString()} · ${label}. Click to re-download.`);
                setProgress(100);
                return 'ok';

            } catch (err) {
                if (err && err.kind === 'abort') { restoreBtn(task); return 'abort'; }

                if (err && err.kind === QUOTA_HALT) {
                    setBtn(btn, 'err', '⚠ Limit');
                    task.error = 'image limit';
                    failures.set(pageNum, task);
                    failedCount++;
                    haltForQuota(err.message + '.');
                    return 'quota';
                }

                const msg = err && err.kind === 'timeout' ? 'timeout'
                          : err && err.kind === 'http' ? `HTTP ${err.detail}`
                          : err && err.kind === 'parse' ? 'no source'
                          : 'network';
                task.error = msg;
                failures.set(pageNum, task);
                failedCount++;
                setBtn(btn, 'err', `✕ ${msg}`, 'Failed — click to try again');
                console.warn('[ExHD] download failed', viewerUrl, err);
                return 'fail';
            }
        }

        function retryAllFailed() {
            const tasks = Array.from(failures.values());
            failures.clear();
            failedCount = 0;
            halted = false;
            clearAlert();
            tasks.forEach(push);
        }

        return {
            init: buildManager,
            push, remove, cancelAll, retryAllFailed, renderUI,
            get isBusy() { return isBusy(); },
            get failedCount() { return failedCount; },
            get pendingCount() { return pending.length; }
        };
    })();

    // =====================================================================
    // === GALLERY PAGE (/g/*) =============================================
    // =====================================================================
    function refreshGallerySavedStats() {
        const gid = getGalleryIdFromLocation();
        if (!gid) return;

        const saved = History.forGallery(gid);
        const count = Object.keys(saved).length;

        const badge = $('#eh-saved-stats');
        if (badge) {
            badge.innerHTML = `Saved: <b>${count}</b> / ${$$('#gdt a[href*="/s/"]').length}`;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        for (const link of $$('#gdt a[href*="/s/"]')) {
            const btn = link.querySelector('.eh-dl-btn');
            if (!btn) continue;
            if (/state-(queued|scan|dl|err)/.test(btn.className)) continue;

            const m = link.href.match(PAGE_RE);
            if (!m) continue;
            const page = m[2];

            if (saved[page]) {
                setBtn(btn, 'saved', '✓ Saved',
                    `Downloaded ${new Date(saved[page].time).toLocaleDateString()}. Click to re-download.`);
            } else if (btn.classList.contains('state-saved')) {
                setBtn(btn, '', '⬇ Download');
            }
        }
    }

    function applyNewTabBehavior(on) {
        for (const a of $$('#gdt a, .gl1t a, .gl2t a, .gl3m a, .gl1e a, .glname a, .gl4t a')) {
            if (on) {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            } else {
                a.removeAttribute('target');
                a.removeAttribute('rel');
            }
        }
    }

    function collectPageTasks({ onlyMissing }) {
        const gid = getGalleryIdFromLocation();
        const saved = History.forGallery(gid);
        const tasks = [];

        for (const link of $$('#gdt a[href*="/s/"]')) {
            const m = link.href.match(PAGE_RE);
            if (!m) continue;
            const pageNum = m[2];
            if (onlyMissing && saved[pageNum]) continue;

            const btn = link.querySelector('.eh-dl-btn');
            if (!btn || /state-(queued|scan|dl)/.test(btn.className)) continue;

            tasks.push({ viewerUrl: link.href, galleryId: m[1] || gid, pageNum, btn });
        }
        return tasks;
    }

    function downloadAllOnPage() {
        let tasks = collectPageTasks({ onlyMissing: true });
        if (!tasks.length) {
            const all = collectPageTasks({ onlyMissing: false });
            if (!all.length) return;
            // The old build silently re-downloaded everything here. Ask first.
            if (!confirm(`Every image on this page is already saved.\n\nRe-download all ${all.length} of them?`)) return;
            tasks = all;
        }
        tasks.forEach(DownloadQueue.push);
    }

    // =====================================================================
    // === FAVOURITES INDEX ================================================
    // The site can only tell you a gallery is favourited once you open it.
    // Crawling favourites.php once into a local index lets every listing
    // show it up front, and makes the whole collection searchable offline.
    // =====================================================================
    const GALLERY_RE = /\/g\/(\d+)\/([0-9a-fA-F]+)/;

    const Favorites = (() => {
        const KEY = 'eh_fav_index_v1';
        const MAX_PAGES = 80;          // ~4000 galleries; a hard stop, not a target
        const PACE_MS = 700;

        let cache = null;
        let crawling = false;

        function load() {
            if (cache) return cache;
            try {
                cache = JSON.parse(rawGet(KEY, 'null')) || null;
            } catch { cache = null; }
            if (!cache || typeof cache !== 'object') cache = { updated: 0, names: {}, items: {} };
            if (!cache.items) cache.items = {};
            if (!cache.names) cache.names = {};
            return cache;
        }

        function save() {
            try { rawSet(KEY, JSON.stringify(load())); }
            catch (err) { console.warn('[ExHD] could not persist favourites index', err); }
        }

        const has = gid => !!load().items[String(gid)];
        const get = gid => load().items[String(gid)] || null;
        const size = () => Object.keys(load().items).length;
        const updatedAt = () => load().updated || 0;
        const isStale = () => !updatedAt() || Date.now() - updatedAt() > 7 * 24 * 3600 * 1000;

        function categoryName(index) {
            const n = load().names[String(index)];
            return n || `Favorites ${index}`;
        }

        function allCategoryNames() {
            const out = [];
            for (let i = 0; i < 10; i++) out.push(categoryName(i));
            return out;
        }

        /** Category names live on the sidebar of favourites.php. */
        function readCategoryNames(doc) {
            const names = {};
            [...doc.querySelectorAll('.fp')].forEach((el, i) => {
                if (i > 9) return;                       // the 11th is "Show All"
                const label = (el.children[2] || el.children[1] || {}).textContent;
                if (label) names[String(i)] = label.trim();
            });
            return names;
        }

        function readRows(doc) {
            const out = [];
            const itg = doc.querySelector('.itg');
            if (!itg) return out;

            for (const row of itg.children) {
                if (!row.querySelector) continue;
                const link = row.querySelector('a[href*="/g/"]');
                if (!link) continue;
                const m = (link.getAttribute('href') || '').match(GALLERY_RE);
                if (!m) continue;

                // The category is exposed as a title attribute inside the row.
                const catEl = [...row.querySelectorAll('[title]')]
                    .find(e => /^Favorites\s+\d/i.test(e.getAttribute('title') || ''));
                const catNum = catEl
                    ? parseInt((catEl.getAttribute('title').match(/(\d+)/) || [])[1], 10)
                    : null;

                const titleEl = row.querySelector('.glname, .gl4t, .gl3t a');
                const note = row.querySelector('.glfnote');

                out.push({
                    gid: m[1],
                    token: m[2],
                    cat: isNaN(catNum) ? null : catNum,
                    title: (titleEl ? titleEl.textContent : link.textContent || '').trim().slice(0, 160),
                    note: note && note.textContent.trim() ? note.textContent.trim().slice(0, 120) : ''
                });
            }
            return out;
        }

        function nextPageUrl(doc, currentUrl) {
            const byCursor = [...doc.querySelectorAll('a[href*="next="]')]
                .map(a => a.href)
                .find(h => h && h !== currentUrl);
            if (byCursor) return byCursor;
            const pager = [...doc.querySelectorAll('.ptt a, .ptb a')]
                .find(a => /next\s*>/i.test(a.textContent));
            return pager && pager.href !== currentUrl ? pager.href : null;
        }

        /**
         * Walk favourites.php page by page. Paced deliberately: this is the
         * user's own account and there is no reason to hammer it.
         */
        async function rebuild(onProgress) {
            if (crawling) return { ok: false, reason: 'already running' };
            crawling = true;

            const items = {};
            let names = {};
            let url = location.origin + '/favorites.php';
            let pages = 0;

            try {
                while (url && pages < MAX_PAGES) {
                    const doc = await fetchDocument(url);
                    if (!pages) names = readCategoryNames(doc);

                    const rows = readRows(doc);
                    if (!rows.length) break;
                    for (const r of rows) {
                        items[r.gid] = { t: r.token, c: r.cat, n: r.title, o: r.note };
                    }

                    pages++;
                    if (onProgress) onProgress({ pages, count: Object.keys(items).length });

                    const next = nextPageUrl(doc, url);
                    if (!next) break;
                    url = next;
                    await sleep(PACE_MS);
                }

                cache = { updated: Date.now(), names, items };
                save();
                return { ok: true, pages, count: Object.keys(items).length };
            } catch (err) {
                console.warn('[ExHD] favourites crawl failed', err);
                return { ok: false, reason: err && err.kind === QUOTA_HALT ? 'limit reached' : 'network error' };
            } finally {
                crawling = false;
            }
        }

        function clear() {
            cache = { updated: 0, names: {}, items: {} };
            save();
        }

        /** Tag every gallery link on the current page that we already own. */
        function markListings(root) {
            if (!size()) return 0;
            const scope = root || document;
            let marked = 0;

            for (const link of $$('a[href*="/g/"]', scope)) {
                const m = (link.getAttribute('href') || '').match(GALLERY_RE);
                if (!m) continue;
                const entry = get(m[1]);
                if (!entry) continue;

                // One marker per row, on the outermost cell we can find.
                const host = link.closest('.gl1t, .gl1e, .gl1c, .itg > tr, .itg > div') || link;
                if (host.dataset.ehFav) continue;
                host.dataset.ehFav = '1';
                marked++;

                const label = entry.c === null || entry.c === undefined
                    ? '★' : `★ ${categoryName(entry.c)}`;

                const thumb = host.querySelector('.gl3t, .gl2e, .gl1e') || host;
                const cs = getComputedStyle(thumb);
                if (cs.position === 'static') thumb.style.position = 'relative';

                const mark = document.createElement('div');
                mark.className = 'eh-fav-mark';
                mark.dataset.eh = '';
                mark.textContent = label;
                mark.title = entry.o ? `In favourites — ${label}\nNote: ${entry.o}` : `In favourites — ${label}`;
                thumb.appendChild(mark);
            }
            return marked;
        }

        return {
            has, get, size, updatedAt, isStale, rebuild, clear,
            markListings, categoryName, allCategoryNames,
            get isCrawling() { return crawling; },
            get items() { return load().items; }
        };
    })();

    // =====================================================================
    // === SETTINGS PANEL ==================================================
    // =====================================================================
    const SettingsPanel = (() => {
        let panel = null;

        function checkboxRow(id, label, checked, title) {
            return `<label class="eh-checkbox-label${checked ? ' is-on' : ''}" title="${title || ''}" style="width:100%;box-sizing:border-box;">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                        <span>${label}</span>
                    </label>`;
        }

        function rangeRow(id, label, value, min, max) {
            return `<div class="eh-set-inline">
                        <span>${label}</span>
                        <div class="eh-set-range" style="max-width:150px;">
                            <input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${value}">
                            <output for="${id}">${value}</output>
                        </div>
                    </div>`;
        }

        function build() {
            const onGallery = !!$('#gdt');
            const gid = getGalleryIdFromLocation();
            const savedHere = Object.keys(History.forGallery(gid)).length;

            panel = document.createElement('div');
            panel.id = 'eh-settings-panel';
            panel.innerHTML = `
                <div class="eh-set-head">
                    <span>⚙ ExH Downloader settings</span>
                    <span style="display:flex;align-items:center;gap:8px;">
                        <button type="button" class="eh-wn-older" id="eh-set-whatsnew">What's new</button>
                        <button type="button" class="eh-set-close" id="eh-set-close" title="Close">✕</button>
                    </span>
                </div>
                <div class="eh-set-body">
                    ${onGallery ? `
                    <div class="eh-set-row">
                        <div class="eh-set-label">Download button</div>
                        <div class="eh-set-grid" id="eh-pos-grid">
                            ${BUTTON_POSITIONS.map(p => `
                                <div class="eh-pos-opt${pref('eh_btn_pos') === p.id ? ' is-active' : ''}"
                                     data-pos="${p.id}" title="${p.label}" role="button" tabindex="0"><i></i></div>`).join('')}
                        </div>
                        ${checkboxRow('eh-set-btn-hover', 'Show only when hovering a thumbnail',
                                      pref('eh_btn_hover'),
                                      'Buttons stay hidden until you hover. Active downloads always stay visible.')}
                    </div>` : ''}

                    <div class="eh-set-row">
                        <div class="eh-set-label">Browsing</div>
                        ${checkboxRow('eh-set-newtab', 'Open links in a new tab', pref('eh_open_in_new_tab'))}
                        ${onGallery ? '' : checkboxRow('eh-set-peek', 'Gallery peeker on hover', pref('eh_gallery_peeker'))}
                        <div class="eh-set-note">Hold <b>Ctrl</b> and hover a thumbnail to preview the full image.</div>
                    </div>

                    ${onGallery ? `
                    <div class="eh-set-row">
                        <div class="eh-set-label">Animated thumbnails</div>
                        ${rangeRow('eh-set-play', 'Playing at once', pref('eh_anim_play_budget'), 0, 12)}
                        ${rangeRow('eh-set-conc', 'Parallel lookups', pref('eh_anim_concurrency'), 1, 4)}
                        ${rangeRow('eh-set-cap', 'Auto-load up to, MB', pref('eh_anim_size_cap_mb'), 0, 64)}
                        ${rangeRow('eh-set-pcap', 'Ctrl+hover preview up to, MB', pref('eh_preview_size_cap_mb'), 0, 128)}
                        <div class="eh-set-note">
                            Playing <b>0</b> means nothing animates on its own — only the thumbnail
                            under the cursor plays. Heavier files than the size limit show their
                            weight and load only when clicked; <b>0</b> lifts the limit.
                            Loading these images spends your image limit.
                        </div>
                    </div>` : ''}

                    <div class="eh-set-row">
                        <div class="eh-set-label">Favourites</div>
                        <div class="eh-set-note" id="eh-set-fav-note"></div>
                        <div style="display:flex;gap:6px;">
                            <button type="button" class="eh-top-btn" id="eh-set-fav-scan" style="flex:1;">
                                ⟳ Rebuild index
                            </button>
                            <button type="button" class="eh-set-danger" id="eh-set-fav-clear" style="flex:0 0 auto;">
                                Clear
                            </button>
                        </div>
                        <div class="eh-set-note">
                            Reads your own favourites once and remembers them, so every listing can
                            show what you already have. Nothing is sent anywhere and no images are
                            fetched, so it costs no image quota.
                        </div>
                    </div>

                    <div class="eh-set-row">
                        <div class="eh-set-label">Saved file names</div>
                        <input type="text" id="eh-set-tpl" class="eh-set-text"
                               value="${String(pref('eh_filename_template')).replace(/"/g, '&quot;')}"
                               spellcheck="false">
                        <div class="eh-set-note">
                            Tokens: <b>{title}</b> <b>{name}</b> <b>{artist}</b> <b>{num}</b> <b>{page}</b>
                            <b>{total}</b> <b>{gid}</b> <b>{res}</b> <b>{orig}</b> <b>{ext}</b>.
                            <b>{num}</b> is the zero-padded page number, <b>{orig}</b> the site's own
                            filename, <b>{name}</b> the title without its leading artist bracket.
                            A <b>/</b> makes a sub-folder, so <b>{artist}/{name}/{num}.{ext}</b> files
                            each gallery on its own.
                        </div>
                        <div class="eh-set-preview" id="eh-set-tpl-preview"></div>
                        <button type="button" class="eh-set-danger" id="eh-set-tpl-reset"
                                style="align-self:flex-start;background:var(--eh-panel);border-color:var(--eh-line);color:var(--eh-text-dim);">
                            Reset to default
                        </button>
                    </div>

                    <div class="eh-set-row">
                        <div class="eh-set-label">Download memory</div>
                        <div class="eh-set-note" id="eh-set-hist">
                            ${savedHere} page(s) remembered here · ${History.galleryCount()} gallery(ies) total
                        </div>
                        <div style="display:flex;gap:6px;">
                            ${gid ? '<button type="button" class="eh-set-danger" id="eh-set-forget" style="flex:1;">Forget this gallery</button>' : ''}
                            <button type="button" class="eh-set-danger" id="eh-set-forget-all" style="flex:1;">Clear all</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(panel);
            wire(gid);
        }

        function wire(gid) {
            $('#eh-set-close', panel).addEventListener('click', close);
            $('#eh-set-whatsnew', panel).addEventListener('click', () => {
                close();
                showWhatsNew(true);
            });

            const grid = $('#eh-pos-grid', panel);
            if (grid) {
                const pick = el => {
                    if (!el) return;
                    setSetting('eh_btn_pos', el.dataset.pos);
                    applyButtonPlacement();
                    $$('.eh-pos-opt', grid).forEach(o => o.classList.toggle('is-active', o === el));
                };
                grid.addEventListener('click', e => pick(e.target.closest('.eh-pos-opt')));
                grid.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick(e.target.closest('.eh-pos-opt'));
                    }
                });
            }

            const bindCheck = (id, key, after) => {
                const cb = $('#' + id, panel);
                if (!cb) return;
                cb.addEventListener('change', e => {
                    setSetting(key, e.target.checked);
                    e.target.closest('.eh-checkbox-label').classList.toggle('is-on', e.target.checked);
                    if (after) after(e.target.checked);
                });
            };
            bindCheck('eh-set-btn-hover', 'eh_btn_hover', applyButtonPlacement);
            bindCheck('eh-set-newtab', 'eh_open_in_new_tab', on => {
                applyNewTabBehavior(on);
                const mirror = $('#eh-setting-new-tab');
                if (mirror) {
                    mirror.checked = on;
                    mirror.closest('.eh-checkbox-label').classList.toggle('is-on', on);
                }
            });
            bindCheck('eh-set-peek', 'eh_gallery_peeker', on => {
                peekerEnabled = on;
                const mirror = $('#eh-setting-peeker');
                if (mirror) {
                    mirror.checked = on;
                    mirror.closest('.eh-checkbox-label').classList.toggle('is-on', on);
                }
            });

            const bindRange = (id, key, apply) => {
                const input = $('#' + id, panel);
                if (!input) return;
                input.addEventListener('input', e => {
                    const v = parseInt(e.target.value, 10);
                    panel.querySelector(`output[for="${id}"]`).textContent = v;
                    setSetting(key, v);
                    apply(v);
                });
            };
            bindRange('eh-set-play', 'eh_anim_play_budget', v => LiveThumbs.setConfig({ playBudget: v }));
            bindRange('eh-set-conc', 'eh_anim_concurrency', v => LiveThumbs.setConfig({ concurrency: v }));
            bindRange('eh-set-cap', 'eh_anim_size_cap_mb', () => { /* applies to the next load */ });
            bindRange('eh-set-pcap', 'eh_preview_size_cap_mb', () => { /* applies to the next preview */ });

            // ---- favourites index ----
            const favNote = $('#eh-set-fav-note', panel);
            const favScan = $('#eh-set-fav-scan', panel);
            const refreshFavNote = () => {
                const n = Favorites.size();
                if (!n) { favNote.textContent = 'No index yet — nothing is marked in listings.'; return; }
                const when = new Date(Favorites.updatedAt()).toLocaleString();
                favNote.textContent = `${n} galleries indexed · last read ${when}` +
                    (Favorites.isStale() ? ' · getting old, consider rebuilding' : '');
            };
            refreshFavNote();

            favScan.addEventListener('click', async () => {
                if (Favorites.isCrawling) return;
                favScan.disabled = true;
                const done = await Favorites.rebuild(p => {
                    favNote.textContent = `Reading page ${p.pages}… ${p.count} galleries so far`;
                });
                favScan.disabled = false;
                if (done.ok) {
                    refreshFavNote();
                    Favorites.markListings();
                } else {
                    favNote.textContent = `Could not finish: ${done.reason}`;
                }
            });

            $('#eh-set-fav-clear', panel).addEventListener('click', () => {
                if (!confirm('Forget the local favourites index? Your account is not touched.')) return;
                Favorites.clear();
                $$('.eh-fav-mark').forEach(el => el.remove());
                $$('[data-eh-fav]').forEach(el => delete el.dataset.ehFav);
                refreshFavNote();
            });

            // Live filename preview, built from the real gallery when there
            // is one, so the sample is not a fiction.
            const tpl = $('#eh-set-tpl', panel);
            if (tpl) {
                const preview = $('#eh-set-tpl-preview', panel);
                const sampleVars = () => filenameVars({
                    title: $('#gdt') ? getGalleryTitle() : '[Artist] Sample Gallery Title',
                    page: 7,
                    total: getGalleryPageCount() || 129,
                    gid: gid || '1234567',
                    res: '1280x1810',
                    origName: '007.jpg',
                    ext: 'png'
                });
                const refresh = () => {
                    const value = tpl.value;
                    const unknown = (value.match(/\{(\w+)\}/g) || [])
                        .map(t => t.slice(1, -1).toLowerCase())
                        .filter(t => !FILENAME_TOKENS.includes(t));
                    const name = buildFilename(value, sampleVars());
                    preview.textContent = unknown.length
                        ? `Unknown token: {${unknown[0]}} — left as text · ${name}`
                        : name;
                    preview.classList.toggle('is-bad', unknown.length > 0);
                };
                tpl.addEventListener('input', () => {
                    setSetting('eh_filename_template', tpl.value.trim() || DEFAULTS.eh_filename_template);
                    refresh();
                });
                $('#eh-set-tpl-reset', panel).addEventListener('click', () => {
                    tpl.value = DEFAULTS.eh_filename_template;
                    setSetting('eh_filename_template', tpl.value);
                    refresh();
                });
                refresh();
            }

            const forget = $('#eh-set-forget', panel);
            if (forget) {
                forget.addEventListener('click', () => {
                    const n = Object.keys(History.forGallery(gid)).length;
                    if (!confirm(`Forget ${n} remembered page(s) for this gallery?`)) return;
                    History.clearGallery(gid);
                    refreshGallerySavedStats();
                    refreshHistoryNote(gid);
                });
            }
            $('#eh-set-forget-all', panel).addEventListener('click', () => {
                if (!confirm('Clear the download memory for every gallery? This cannot be undone.')) return;
                History.clearAll();
                refreshGallerySavedStats();
                refreshHistoryNote(gid);
            });
        }

        function refreshHistoryNote(gid) {
            const note = $('#eh-set-hist', panel);
            if (!note) return;
            note.textContent =
                `${Object.keys(History.forGallery(gid)).length} page(s) remembered here · ${History.galleryCount()} gallery(ies) total`;
        }

        function place(anchor) {
            const r = anchor.getBoundingClientRect();
            const w = panel.offsetWidth || 330;
            const h = panel.offsetHeight || 300;
            panel.style.left = Math.round(clamp(r.left, 8, innerWidth - w - 8)) + 'px';
            panel.style.top = Math.round(
                r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6
            ) + 'px';
        }

        function close() {
            if (panel) panel.classList.remove('is-open');
            document.removeEventListener('pointerdown', onOutside, true);
        }

        function onOutside(e) {
            if (panel.contains(e.target) || e.target.closest('#eh-settings-btn')) return;
            close();
        }

        function toggle(anchor) {
            if (!panel) build();
            if (panel.classList.contains('is-open')) { close(); return; }
            panel.classList.add('is-open');
            place(anchor);
            document.addEventListener('pointerdown', onOutside, true);
            document.addEventListener('keydown', function esc(e) {
                if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
            });
        }

        return { toggle };
    })();

    function buildGalleryBar() {
        const gdt = $('#gdt');
        if (!gdt || $('#eh-top-control-bar')) return;

        const openNewTab = getSetting('eh_open_in_new_tab', true);
        const liveThumbs = getSetting('eh_live_thumbs', false);
        const animCount = LiveThumbs.countAnimatedCandidates();

        const bar = document.createElement('div');
        bar.id = 'eh-top-control-bar';
        bar.innerHTML = `
            <div class="eh-top-left">
                <button type="button" id="eh-batch-dl-btn" class="eh-top-btn"
                        title="Queue every image on this page that is not saved yet">⬇ Download page</button>
                <button type="button" id="eh-retry-btn" class="eh-top-btn eh-btn-warn" style="display:none;">↻ Retry failed</button>
                <button type="button" id="eh-cancel-all-btn" class="eh-top-btn eh-btn-danger" style="display:none;">✕ Cancel all</button>
                <button type="button" id="eh-archive-btn" class="eh-top-btn" style="display:none;"
                        title="Open the site's own Archive Download dialog for the whole gallery">🗜 Archive</button>
                <label class="eh-checkbox-label${liveThumbs ? ' is-on' : ''}"
                       title="Play animated GIF/WebP images inside the grid. Loading them counts towards your image limit.">
                    <input type="checkbox" id="eh-setting-live-thumbs" ${liveThumbs ? 'checked' : ''}>
                    <span>🎬 Animated${animCount ? ` (${animCount})` : ''}</span>
                </label>
                <div id="eh-anim-status" class="eh-badge eh-anim-status-badge" style="display:none;"
                     title="Animated thumbnail progress"></div>
                <div id="eh-saved-stats" class="eh-badge eh-saved-count-badge" style="display:none;"></div>
                <div class="eh-badge eh-quota-badge">
                    <span id="eh-quota-value">Image Limits: <i>checking…</i></span>
                    <span id="eh-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div class="eh-top-right">
                <button type="button" id="eh-settings-btn" class="eh-top-btn" title="Settings">⚙</button>
                <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" title="Project page">v${VERSION}</a>
            </div>`;
        gdt.parentNode.insertBefore(bar, gdt);

        const gear = $('#eh-settings-btn', bar);
        gear.addEventListener('click', () => SettingsPanel.toggle(gear));

        $('#eh-batch-dl-btn', bar).addEventListener('click', downloadAllOnPage);
        $('#eh-cancel-all-btn', bar).addEventListener('click', DownloadQueue.cancelAll);
        $('#eh-retry-btn', bar).addEventListener('click', DownloadQueue.retryAllFailed);

        // The site already offers a whole-gallery archive; surface its own
        // dialog rather than reimplementing it, and only when it exists.
        const archiveBtn = $('#eh-archive-btn', bar);
        const nativeArchive = $$('#gd5 a').find(a =>
            /archiver/i.test(a.getAttribute('onclick') || '') || /archiver/i.test(a.href || ''));
        if (nativeArchive) {
            archiveBtn.style.display = 'inline-flex';
            archiveBtn.addEventListener('click', () => nativeArchive.click());
        }

        // A halted loader is recoverable now, so let the badge restart it.
        $('#eh-anim-status', bar).addEventListener('click', () => {
            if (LiveThumbs.isPaused) LiveThumbs.resume();
        });

        const liveCb = $('#eh-setting-live-thumbs', bar);
        liveCb.addEventListener('change', e => {
            const on = e.target.checked;
            // Live thumbnails pull real images, which spends image limits.
            // Say so once instead of quietly draining the quota.
            if (on && !getSetting('eh_live_thumbs_warned', false)) {
                const ok = confirm(
                    'Animated thumbnails load the real images from the server.\n\n' +
                    'That counts towards your image limit, exactly like opening each page.\n\n' +
                    'Enable them?'
                );
                if (!ok) { e.target.checked = false; return; }
                setSetting('eh_live_thumbs_warned', true);
            }
            setSetting('eh_live_thumbs', on);
            e.target.closest('.eh-checkbox-label').classList.toggle('is-on', on);
            if (on) LiveThumbs.enable(); else LiveThumbs.disable();
        });

        applyNewTabBehavior(openNewTab);
    }

    function initGalleryPage() {
        const links = $$('#gdt a[href*="/s/"]');
        if (!links.length) return;

        const gid = getGalleryIdFromLocation();
        const saved = History.forGallery(gid);

        buildGalleryBar();
        DownloadQueue.init();
        Quota.start(() => DownloadQueue.isBusy);
        initGalleryImagePreview();

        for (const link of links) {
            const m = link.href.match(PAGE_RE);
            const pageNum = m ? m[2] : '000';
            const galleryId = m ? m[1] : gid;

            // Anchor the button to the painted thumbnail rather than the
            // grid cell: the cell is taller by the height of the "Page N"
            // caption, so anchoring there pushes the button off the image
            // and onto the caption.
            const item = link.closest('#gdt > *') || link;
            const host = resolveThumbBox(item) || link;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            if (getComputedStyle(link).display === 'inline') link.style.display = 'inline-block';

            const btn = document.createElement('button');
            btn.type = 'button';
            if (saved[pageNum]) {
                setBtn(btn, 'saved', '✓ Saved',
                    `Downloaded ${new Date(saved[pageNum].time).toLocaleDateString()}. Click to re-download.`);
            } else {
                setBtn(btn, '', '⬇ Download');
            }

            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.classList.contains('state-queued')) { DownloadQueue.remove(pageNum); return; }
                if (/state-(scan|dl)/.test(btn.className)) return;
                DownloadQueue.push({ viewerUrl: link.href, galleryId, pageNum, btn });
            });

            host.appendChild(btn);
        }

        refreshGallerySavedStats();
        if (getSetting('eh_live_thumbs', false)) LiveThumbs.enable();

        window.addEventListener('beforeunload', e => {
            if (!DownloadQueue.isBusy) return;
            e.preventDefault();
            e.returnValue = '';
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && DownloadQueue.isBusy) DownloadQueue.cancelAll();
        });
    }
    // =====================================================================
    // === CTRL+HOVER FULL IMAGE PREVIEW ===================================
    // One delegated listener instead of three per thumbnail, and the popup
    // is sized from the reported resolution before the bytes arrive, so it
    // no longer jumps around as the image decodes.
    // =====================================================================
    function initGalleryImagePreview() {
        const gdt = $('#gdt');
        if (!gdt || $('#eh-image-preview-popup')) return;

        const popup = document.createElement('div');
        popup.id = 'eh-image-preview-popup';
        popup.innerHTML = `
            <div class="eh-pop-inner">
                <div class="eh-preview-stage" id="eh-preview-stage">
                    <img id="eh-preview-img" alt="">
                    <div id="eh-preview-spin" class="eh-preview-spinner">⟳ loading…</div>
                </div>
                <div id="eh-preview-caption" class="eh-preview-caption"></div>
            </div>`;
        document.body.appendChild(popup);

        const stage = $('#eh-preview-stage', popup);
        const imgEl = $('#eh-preview-img', popup);
        const capEl = $('#eh-preview-caption', popup);
        const spinEl = $('#eh-preview-spin', popup);

        const MAX_W = 620;
        const maxH = () => Math.round(innerHeight * 0.72);

        let hovered = null;          // { url, pageNum }
        let cursor = { x: 0, y: 0 };
        let openFor = null;
        let loadToken = 0;
        let activePreviewReq = null;
        let previewObjectUrl = null;

        function revokePreviewUrl() {
            if (!previewObjectUrl) return;
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }

        function fitStage(resText) {
            const m = String(resText || '').match(/(\d+)x(\d+)/i);
            const w = m ? parseInt(m[1], 10) : 480;
            const h = m ? parseInt(m[2], 10) : 640;
            const scale = Math.min(MAX_W / w, maxH() / h, 1);
            stage.style.width = Math.round(w * scale) + 'px';
            stage.style.height = Math.round(h * scale) + 'px';
        }

        const reposition = rafThrottle(() => {
            if (!popup.classList.contains('is-open')) return;
            positionPopupAtCursor(popup, cursor.x, cursor.y, popup.offsetWidth, popup.offsetHeight);
        });

        function close() {
            openFor = null;
            loadToken++;
            // Stop the transfer as soon as the cursor leaves; otherwise a
            // heavy file keeps streaming for a preview nobody is looking at.
            if (activePreviewReq && activePreviewReq.abort) {
                try { activePreviewReq.abort(); } catch { /* already settled */ }
            }
            activePreviewReq = null;
            popup.classList.remove('is-open');
            imgEl.classList.remove('img-ready');
            imgEl.removeAttribute('src');
            revokePreviewUrl();
            stage.classList.add('is-skeleton');
            spinEl.textContent = '⟳ loading…';
            spinEl.style.display = 'flex';
        }

        function show(info, pageNum, byteSize) {
            spinEl.style.display = 'none';
            stage.classList.remove('is-skeleton');
            imgEl.classList.add('img-ready');
            const bits = [`Page ${pageNum}`];
            if (info.displayRes) bits.push(info.displayRes);
            const size = byteSize ? formatBytes(byteSize) : info.sizeText;
            if (size) bits.push(size);
            capEl.innerHTML = bits.map((b, i) => (i ? `<b>${b}</b>` : b)).join(' · ');
        }

        function open() {
            if (!hovered || openFor === hovered.url) return;
            openFor = hovered.url;
            const token = ++loadToken;
            const { url, pageNum } = hovered;

            capEl.textContent = `Page ${pageNum}`;
            imgEl.classList.remove('img-ready');
            imgEl.removeAttribute('src');
            stage.classList.add('is-skeleton');
            spinEl.style.display = 'flex';
            popup.classList.add('is-open');

            const cached = viewerPageCache.get(url);
            fitStage(cached && cached.displayRes);
            reposition();

            loadViewerInfo(url).then(info => {
                if (token !== loadToken) return;
                const src = info.displayUrl || info.originalUrl;
                if (!src) { capEl.textContent = `Page ${pageNum} — no source`; return; }
                fitStage(info.displayRes);
                reposition();

                // Streaming this instead of assigning img.src is what keeps a
                // 60 MB animated WebP from locking the tab: the size is known
                // from the first progress tick, so an oversized file is
                // refused after a few kilobytes and never decoded.
                const capMb = clamp(pref('eh_preview_size_cap_mb'), 0, 512);
                const cap = capMb > 0 ? capMb * 1024 * 1024 : 0;
                let refused = false;

                const req = fetchImageBlob(src, {
                    referer: url,
                    onHandle: r => { activePreviewReq = r; },
                    onprogress: p => {
                        if (token !== loadToken || !p.lengthComputable) return;
                        if (cap && p.total > cap) {
                            refused = true;
                            spinEl.textContent = `⚠ ${formatBytes(p.total)} — too large to preview`;
                            try { activePreviewReq && activePreviewReq.abort(); } catch { /* done */ }
                            return;
                        }
                        spinEl.textContent =
                            `⟳ ${Math.round((p.loaded / p.total) * 100)}%  ${formatBytes(p.loaded)} / ${formatBytes(p.total)}`;
                    }
                });

                req.then(({ blob }) => {
                    if (token !== loadToken) return;
                    revokePreviewUrl();
                    previewObjectUrl = URL.createObjectURL(blob);
                    imgEl.src = previewObjectUrl;
                    const done = () => { if (token === loadToken) show(info, pageNum, blob.size); };
                    if (imgEl.decode) imgEl.decode().then(done).catch(done);
                    else imgEl.onload = done;
                }).catch(err => {
                    if (token !== loadToken || refused) return;
                    if (err && err.kind === 'abort') return;
                    spinEl.textContent = err && err.kind === QUOTA_HALT
                        ? '⚠ image limit reached'
                        : '⚠ could not load';
                });
            }).catch(err => {
                if (token !== loadToken) return;
                spinEl.textContent = err && err.kind === QUOTA_HALT ? '⚠ image limit reached' : '⚠ could not load';
            });
        }

        gdt.addEventListener('pointerover', e => {
            const link = e.target.closest('a[href*="/s/"]');
            if (!link) return;
            const m = link.href.match(PAGE_RE);
            hovered = { url: link.href, pageNum: m ? m[2] : '?' };
            cursor = { x: e.clientX, y: e.clientY };
            if (e.ctrlKey) open();
        });

        gdt.addEventListener('pointermove', e => {
            cursor = { x: e.clientX, y: e.clientY };
            if (!hovered) return;
            if (e.ctrlKey) {
                if (!popup.classList.contains('is-open')) open();
                else reposition();
            } else if (popup.classList.contains('is-open')) {
                close();
            }
        }, { passive: true });

        gdt.addEventListener('pointerout', e => {
            if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#gdt a[href*="/s/"]')) return;
            hovered = null;
            close();
        });

        window.addEventListener('keydown', e => {
            if (e.key === 'Control' && hovered) open();
        });

        window.addEventListener('keyup', e => {
            if (e.key === 'Control' || !e.ctrlKey) close();
        });

        window.addEventListener('blur', close);
    }

    // =====================================================================
    // === SINGLE IMAGE VIEWER (/s/*) ======================================
    // =====================================================================
    function initViewerPage() {
        const i1 = $('#i1');
        if (!i1 || !$('img#img') || $('#eh-viewer-control-bar')) return;

        let activeReq = null;
        let downloading = false;

        const bar = document.createElement('div');
        bar.id = 'eh-viewer-control-bar';
        bar.innerHTML = `
            <div class="eh-viewer-left">
                <a id="eh-vback" class="eh-viewer-nav-btn" href="#" title="Back to the gallery (Backspace)">↩ Gallery</a>
                <div class="eh-viewer-sep"></div>
                <a id="eh-vp" class="eh-viewer-nav-btn" href="#" title="Previous page (← or A)">◀ Prev</a>
                <a id="eh-vn" class="eh-viewer-nav-btn" href="#" title="Next page (→ or D)">Next ▶</a>
                <div class="eh-viewer-sep"></div>
                <button type="button" id="eh-vdl" class="eh-viewer-btn" title="Download (S)">⬇ Download original</button>
                <button type="button" id="eh-vcancel" class="eh-viewer-cancel-btn">✕ Cancel</button>
                <div class="eh-badge eh-quota-badge">
                    <span id="eh-viewer-quota-value">Image Limits: <i>checking…</i></span>
                    <span id="eh-viewer-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div id="eh-vpage-info" class="eh-top-right">
                <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">v${VERSION}</a>
            </div>`;
        i1.parentNode.insertBefore(bar, i1);
        document.body.classList.add('eh-viewer-floating');

        const backBtn = $('#eh-vback', bar);
        const prevBtn = $('#eh-vp', bar);
        const nextBtn = $('#eh-vn', bar);
        const dlBtn = $('#eh-vdl', bar);
        const cancelBtn = $('#eh-vcancel', bar);
        const pageInfo = $('#eh-vpage-info', bar);

        Quota.start(() => downloading);

        function readPageState() {
            return readPageNav() || { page: 1, total: 1 };
        }

        const syncUI = rafThrottle(() => {
            const { page, total } = readPageState();
            const gid = getGalleryIdFromLocation();
            const info = parseViewerDoc(document);

            pageInfo.innerHTML =
                `Page ${page} / ${total} · <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">v${VERSION}</a>`;

            prevBtn.classList.toggle('disabled', page <= 1);
            nextBtn.classList.toggle('disabled', page >= total);
            const prevA = $('a#prev');
            const nextA = $('a#next');
            prevBtn.href = prevA ? prevA.href : '#';
            nextBtn.href = nextA ? nextA.href : '#';

            if (downloading) return;

            const res = info.originalRes || info.displayRes;
            const suffix = res ? ` (${res})` : '';
            if (History.isSaved(gid, page)) {
                dlBtn.className = 'eh-viewer-btn state-saved';
                dlBtn.textContent = `✓ Saved${suffix} — re-download`;
            } else {
                dlBtn.className = 'eh-viewer-btn';
                dlBtn.textContent = info.originalUrl ? `⬇ Download original${suffix}` : `⬇ Download image${suffix}`;
            }
            cancelBtn.style.display = 'none';
        });

        /**
         * The site turns pages in place via load_image(), so click its own
         * anchor rather than reloading the URL — that keeps the fast path.
         *
         * The guard fails open on purpose. It used to read the counter and
         * bail whenever it could not parse one, which silently swallowed
         * clicks during the in-place swap; that is what made a page turn feel
         * like it needed two or three presses.
         */
        function navigate(dir) {
            const nav = readPageNav();
            if (nav) {
                if (dir < 0 && nav.page <= 1) return;
                if (dir > 0 && nav.page >= nav.total) return;
            }

            const anchor = dir < 0 ? $('a#prev') : $('a#next');
            const fallback = dir < 0 ? prevBtn : nextBtn;

            if (anchor) {
                anchor.click();
                // If the site's handler did not take over within a frame or
                // two, fall back to a real navigation instead of doing nothing.
                const before = location.href;
                const href = anchor.href;
                if (href && href !== before) {
                    setTimeout(() => {
                        if (location.href === before && readPageNav() &&
                            readPageNav().page === (nav ? nav.page : -1)) {
                            location.assign(href);
                        }
                    }, 220);
                }
                return;
            }
            if (fallback.href && fallback.href !== '#') location.assign(fallback.href);
        }

        // pointerdown fires before the browser settles a click, so the bar
        // reacts the instant the button is pressed.
        const bindNav = (btn, dir) => {
            let armed = false;
            btn.addEventListener('pointerdown', e => {
                if (e.button !== 0) return;
                armed = true;
            });
            btn.addEventListener('click', e => {
                e.preventDefault();
                if (!armed) { navigate(dir); return; }
                armed = false;
                navigate(dir);
            });
        };
        bindNav(prevBtn, -1);
        bindNav(nextBtn, 1);

        // Back to the gallery this page belongs to.
        const galleryHref = (() => {
            const direct = $$('a[href*="/g/"]')
                .map(a => a.href)
                .find(h => /\/g\/\d+\/[0-9a-fA-F]+\//.test(h));
            return direct || null;
        })();
        if (galleryHref) {
            backBtn.href = galleryHref;
        } else {
            backBtn.classList.add('disabled');
            backBtn.title = 'Gallery link not found on this page';
        }

        document.addEventListener('keydown', e => {
            // Never hijack browser shortcuts such as Ctrl+D or Alt+Arrow.
            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
            if (e.defaultPrevented) return;
            const tag = (document.activeElement || {}).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement || {}).isContentEditable) return;

            switch (e.key) {
                case 'ArrowLeft': case 'a': case 'A':
                    e.preventDefault(); navigate(-1); break;
                case 'ArrowRight': case 'd': case 'D':
                    e.preventDefault(); navigate(1); break;
                case 's': case 'S':
                    e.preventDefault(); startDownload(); break;
                case 'Backspace':
                    if (backBtn.href && backBtn.href !== '#' && !backBtn.classList.contains('disabled')) {
                        e.preventDefault();
                        location.assign(backBtn.href);
                    }
                    break;
                case 'Escape':
                    if (activeReq) { try { activeReq.abort(); } catch { /* gone */ } }
                    break;
            }
        });

        cancelBtn.addEventListener('click', () => {
            if (activeReq) { try { activeReq.abort(); } catch { /* gone */ } }
            activeReq = null;
            downloading = false;
            cancelBtn.style.display = 'none';
            syncUI();
            Quota.renderTimer();
        });

        async function startDownload() {
            if (downloading) return;

            const info = parseViewerDoc(document);
            const targetUrl = info.originalUrl || info.displayUrl;
            if (!targetUrl) {
                dlBtn.className = 'eh-viewer-btn state-err';
                dlBtn.textContent = '✕ No source found';
                return;
            }

            const { page } = readPageState();
            const gid = getGalleryIdFromLocation();
            const resLabel = (info.originalUrl ? info.originalRes : info.displayRes) || 'image';

            downloading = true;
            cancelBtn.style.display = 'inline-flex';
            dlBtn.className = 'eh-viewer-btn state-dl';
            dlBtn.textContent = `↓ 0% (${resLabel})`;
            Quota.renderTimer();

            try {
                const { blob, res } = await withRetry(
                    () => fetchImageBlob(targetUrl, {
                        referer: location.href,
                        onHandle: req => { activeReq = req; },
                        onprogress: p => {
                            if (!p.lengthComputable) return;
                            const pct = Math.round((p.loaded / p.total) * 100);
                            dlBtn.textContent = `↓ ${pct}% · ${formatBytes(p.loaded)} / ${formatBytes(p.total)}`;
                        }
                    }),
                    { attempts: 3, onRetry: n => { dlBtn.textContent = `↻ Retry ${n}…`; } }
                );

                const ext = (await sniffExtension(blob)) ||
                            extFromContentType(res.responseHeaders) ||
                            info.fileExt ||
                            extFromUrl(targetUrl) ||
                            'jpg';

                saveBlob(blob, buildFilename(pref('eh_filename_template'), filenameVars({
                    title: getGalleryTitle(),
                    page,
                    total: readPageState().total || getGalleryPageCount(),
                    gid,
                    res: resLabel,
                    origName: info.origName,
                    ext
                })));

                const sizeText = formatBytes(blob.size);
                History.mark(gid, page, { res: resLabel, size: sizeText });

                dlBtn.className = 'eh-viewer-btn state-saved';
                dlBtn.textContent = `✓ Saved ${sizeText}`;
                Quota.refresh({ force: true });

            } catch (err) {
                if (!err || err.kind !== 'abort') {
                    dlBtn.className = 'eh-viewer-btn state-err';
                    dlBtn.textContent = err && err.kind === QUOTA_HALT
                        ? '⚠ Image limit reached'
                        : `✕ ${err && err.kind === 'http' ? 'HTTP ' + err.detail : 'Failed'}`;
                    console.warn('[ExHD] viewer download failed', err);
                }
            } finally {
                downloading = false;
                activeReq = null;
                cancelBtn.style.display = 'none';
                Quota.renderTimer();
            }
        }

        dlBtn.addEventListener('click', startDownload);

        // The viewer swaps pages in place; watch the caption and the original
        // link, coalescing bursts of mutations into a single UI sync.
        const observer = new MutationObserver(syncUI);
        for (const sel of ['#i2', '#i6', '#i3']) {
            const el = $(sel);
            if (el) observer.observe(el, { childList: true, subtree: true, characterData: true });
        }

        syncUI();
    }
    // =====================================================================
    // === FRONT PAGE / SEARCH GALLERY PEEKER ==============================
    // =====================================================================
    const peekCache = new LruMap(120);

    // Cached so the delegated hover handler never touches GM storage.
    let peekerEnabled = getSetting('eh_gallery_peeker', true);

    function extractPeekThumbs(doc, limit = 8) {
        const out = [];
        const nodes = Array.from(doc.querySelectorAll('#gdt > a, #gdt > div, #gdt .gdtm, #gdt .gdtl'));

        for (const node of nodes) {
            if (out.length >= limit) break;

            // Large-thumbnail mode serves plain <img> elements.
            const img = node.querySelector('img[src]');
            if (img && !/^data:/.test(img.src)) { out.push({ type: 'img', src: img.src }); continue; }

            // Every other mode paints a slice of a sprite sheet.
            const spriteEl = node.querySelector('div[style*="url("]') ||
                             (String(node.getAttribute('style') || '').includes('url(') ? node : null);
            if (!spriteEl) continue;

            const style = spriteEl.getAttribute('style') || '';
            const url = (style.match(/url\((['"]?)([^'")]+)\1\)/) || [])[2];
            if (!url) continue;

            out.push({
                type: 'sprite',
                url,
                offset: (style.match(/(-?\d+)px\s+(-?\d+)/) || [null, '0', '0']).slice(1).map(Number),
                w: parseInt((style.match(/width:\s*(\d+)/i) || [])[1], 10) || 100,
                h: parseInt((style.match(/height:\s*(\d+)/i) || [])[1], 10) || 141
            });
        }
        return out;
    }

    function extractPeekData(doc) {
        const gddVal = label => {
            const row = Array.from(doc.querySelectorAll('#gdd tr')).find(tr => tr.textContent.includes(label));
            const cell = row && row.querySelector('.gdt2');
            return cell ? cell.textContent.trim().replace(/\s+/g, ' ') : '';
        };
        const cat = doc.querySelector('#gdc .cs, #gdc div, .cs');
        const rating = doc.querySelector('#rating_label');

        return {
            title: (doc.querySelector('#gn') || doc.querySelector('#gj') || {}).textContent || 'Gallery',
            category: cat ? cat.textContent.trim() : '',
            uploader: ((doc.querySelector('#gdn a') || doc.querySelector('#gdn') || {}).textContent || '').trim(),
            language: gddVal('Language:'),
            fileSize: gddVal('File Size:'),
            length: gddVal('Length:'),
            rating: rating ? (rating.textContent.match(/([\d.]+)/) || [])[1] || '' : '',
            tags: Array.from(doc.querySelectorAll('#taglist a')).slice(0, 10).map(a => a.textContent.trim()),
            thumbs: extractPeekThumbs(doc)
        };
    }

    function initFrontPagePeeker() {
        if ($('#eh-gallery-peek-popup')) return;

        const popup = document.createElement('div');
        popup.id = 'eh-gallery-peek-popup';
        popup.innerHTML = `
            <div class="eh-pop-inner">
                <div id="eh-peek-title" class="eh-peek-header">Loading…</div>
                <div id="eh-peek-meta" class="eh-peek-meta"><span>fetching info…</span></div>
                <div id="eh-peek-tags" class="eh-peek-tags"></div>
                <div id="eh-peek-grid" class="eh-peek-grid"></div>
            </div>`;
        document.body.appendChild(popup);

        const titleEl = $('#eh-peek-title', popup);
        const metaEl = $('#eh-peek-meta', popup);
        const tagsEl = $('#eh-peek-tags', popup);
        const gridEl = $('#eh-peek-grid', popup);

        let hoverTimer = null;
        let activeReq = null;
        let cursor = { x: 0, y: 0 };
        let openUrl = null;
        let token = 0;

        const skeleton = () => {
            gridEl.textContent = '';
            for (let i = 0; i < 8; i++) {
                const d = document.createElement('div');
                d.className = 'eh-peek-thumb skeleton';
                gridEl.appendChild(d);
            }
        };

        const reposition = rafThrottle(() => {
            if (!popup.classList.contains('is-open')) return;
            positionPopupAtCursor(popup, cursor.x, cursor.y, popup.offsetWidth || 470, popup.offsetHeight || 380);
        });

        function close() {
            clearTimeout(hoverTimer);
            token++;
            openUrl = null;
            if (activeReq) { try { activeReq.abort(); } catch { /* gone */ } }
            activeReq = null;
            popup.classList.remove('is-open');
        }

        function render(data) {
            titleEl.textContent = data.title;

            const bits = [];
            if (data.category) bits.push(['Category', data.category]);
            if (data.rating) bits.push(['Rating', '★ ' + data.rating]);
            if (data.language) bits.push(['Language', data.language]);
            if (data.length) bits.push(['Pages', data.length]);
            if (data.fileSize) bits.push(['Size', data.fileSize]);
            if (data.uploader) bits.push(['By', data.uploader]);

            metaEl.textContent = '';
            for (const [k, v] of bits) {
                const span = document.createElement('span');
                span.append(k + ': ');
                const b = document.createElement('b');
                b.textContent = v;
                span.appendChild(b);
                metaEl.appendChild(span);
            }

            tagsEl.textContent = '';
            tagsEl.style.display = data.tags.length ? 'flex' : 'none';
            for (const tag of data.tags) {
                const t = document.createElement('span');
                t.className = 'eh-peek-tag';
                t.textContent = tag;
                tagsEl.appendChild(t);
            }

            gridEl.textContent = '';
            if (!data.thumbs.length) {
                const empty = document.createElement('div');
                empty.className = 'eh-peek-empty';
                empty.textContent = 'No preview thumbnails available';
                gridEl.appendChild(empty);
                reposition();
                return;
            }

            const cells = [];
            for (const t of data.thumbs) {
                const cell = document.createElement('div');
                cell.className = 'eh-peek-thumb';

                if (t.type === 'img') {
                    const im = document.createElement('img');
                    im.loading = 'lazy';
                    im.decoding = 'async';
                    im.src = t.src;
                    im.alt = '';
                    cell.appendChild(im);
                } else {
                    const sprite = document.createElement('div');
                    sprite.className = 'eh-sprite';
                    sprite.style.width = t.w + 'px';
                    sprite.style.height = t.h + 'px';
                    sprite.style.backgroundImage = `url("${t.url}")`;
                    sprite.style.backgroundPosition = `${t.offset[0]}px ${t.offset[1]}px`;
                    cell.appendChild(sprite);
                    cells.push({ cell, sprite, t });
                }
                gridEl.appendChild(cell);
            }

            // One batched read, then one batched write: no layout thrash.
            const widths = cells.map(c => c.cell.clientWidth);
            cells.forEach(({ sprite, t }, i) => {
                const scale = (widths[i] || 105) / t.w;
                sprite.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
            });

            reposition();
        }

        function open(url) {
            if (openUrl === url) return;
            openUrl = url;
            const myToken = ++token;

            popup.classList.add('is-open');
            reposition();

            const cached = peekCache.get(url);
            if (cached) { render(cached); return; }

            titleEl.textContent = 'Loading…';
            metaEl.textContent = 'fetching info…';
            tagsEl.textContent = '';
            skeleton();

            activeReq = gmRequest({ url });
            activeReq
                .then(res => {
                    if (myToken !== token) return;
                    if (res.status !== 200) throw new EhError('http', 'HTTP ' + res.status);
                    const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                    const data = extractPeekData(doc);
                    peekCache.set(url, data);
                    render(data);
                })
                .catch(err => {
                    if (myToken !== token || (err && err.kind === 'abort')) return;
                    titleEl.textContent = 'Preview unavailable';
                    metaEl.textContent = err && err.message ? err.message : '';
                    gridEl.textContent = '';
                })
                .finally(() => { activeReq = null; });
        }

        // A single delegated pair of listeners covers every gallery link on
        // the page, including ones added by later pagination.
        document.addEventListener('pointerover', e => {
            if (!peekerEnabled) return;
            const link = e.target.closest && e.target.closest('a[href*="/g/"]');
            if (!link || popup.contains(link)) return;

            const m = link.href.match(/(https?:\/\/[^/]+\/g\/\d+\/[0-9a-fA-F]+\/)/);
            if (!m) return;

            cursor = { x: e.clientX, y: e.clientY };
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => open(m[1]), 140);
        }, { passive: true });

        document.addEventListener('pointermove', e => {
            if (!popup.classList.contains('is-open')) return;
            cursor = { x: e.clientX, y: e.clientY };
            reposition();
        }, { passive: true });

        document.addEventListener('pointerout', e => {
            const link = e.target.closest && e.target.closest('a[href*="/g/"]');
            if (!link) return;
            const to = e.relatedTarget;
            if (to && to.closest && to.closest('a[href*="/g/"]') === link) return;
            close();
        }, { passive: true });

        window.addEventListener('scroll', close, { passive: true });
        window.addEventListener('blur', close);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }

    function buildFrontPageBar() {
        if ($('#eh-top-control-bar')) return;

        const anchor = $('table.itg') || $('div.itg') || $('#searchbox');
        if (!anchor || !anchor.parentNode) return;

        const openNewTab = getSetting('eh_open_in_new_tab', true);
        const peeker = getSetting('eh_gallery_peeker', true);

        const bar = document.createElement('div');
        bar.id = 'eh-top-control-bar';
        bar.innerHTML = `
            <div class="eh-top-left">
                <label class="eh-checkbox-label${peeker ? ' is-on' : ''}" title="Show a floating gallery preview on hover">
                    <input type="checkbox" id="eh-setting-peeker" ${peeker ? 'checked' : ''}>
                    <span>📑 Peeker</span>
                </label>
                <div class="eh-badge eh-quota-badge">
                    <span id="eh-quota-value">Image Limits: <i>checking…</i></span>
                    <span id="eh-quota-timer" class="eh-timer-badge">⏱ 60s</span>
                </div>
            </div>
            <div class="eh-top-right">
                <button type="button" id="eh-settings-btn" class="eh-top-btn" title="Settings">⚙</button>
                <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">ExH Downloader v${VERSION}</a>
            </div>`;
        anchor.parentNode.insertBefore(bar, anchor);

        const gear = $('#eh-settings-btn', bar);
        gear.addEventListener('click', () => SettingsPanel.toggle(gear));

        const peekCb = $('#eh-setting-peeker', bar);
        peekCb.addEventListener('change', e => {
            peekerEnabled = e.target.checked;
            setSetting('eh_gallery_peeker', peekerEnabled);
            e.target.closest('.eh-checkbox-label').classList.toggle('is-on', peekerEnabled);
        });

        applyNewTabBehavior(openNewTab);
        Quota.start(() => false);
    }

    // =====================================================================
    // === WHAT'S NEW NOTICE ===============================================
    // Shown once per version, top-centre, dismissible. The full history is
    // kept here so the notice can also answer "what changed before this?".
    // =====================================================================
    const CHANGELOG = [
        { v: '15.6.0', groups: [
            { t: 'Added', items: [
                'Favourites index. Read your own favourites once, and every listing then marks the galleries you already have, with the category name. It reads only HTML, so it costs no image quota. Build it from Settings.',
                'Back to gallery button in the image viewer, also on Backspace.'
            ] },
            { t: 'Changed', items: [
                'The interface now samples its colours from the page it is on, instead of guessing a light or dark palette. On e-hentai\'s cream skin the bar had been rendering near-white with grey rules; it now picks up the site\'s own cream and dark red.',
                'The viewer bar floats at the top of the window, so it stays put while you scroll a page.'
            ] },
            { t: 'Fixed', items: [
                'Page turns that needed two or three clicks. The guard read the page counter first and silently gave up whenever it could not parse one, which happens during the site\'s in-place page swap; it now fails open and falls back to a real navigation if the site\'s own handler does not take over.'
            ] }
        ] },
        { v: '15.5.0', groups: [
            { t: 'Fixed', items: [
                'Page counter and file numbering on galleries whose files are named 001.jpg. The counter div and the filename div sit side by side in the page markup, and reading them together turned "6 / 129" into "6 / 129006" — which also padded saved filenames to four digits instead of three.'
            ] },
            { t: 'Added', items: [
                'Custom filename template with live preview, in Settings.',
                'Archive Download shortcut in the gallery bar.',
                'This what\'s-new notice.'
            ] }
        ] },
        { v: '15.4.0', groups: [
            { t: 'Fixed', items: [
                'False "image limit reached" that stopped the loader for good. The detector matched the digits 509 anywhere in an image URL, and H@H addresses contain long digit runs, so ordinary pages were condemned at random. It now matches only the real 509.gif notice.',
                'An empty or malformed reply is treated as a transient error and retried, instead of halting everything.',
                'A halted loader can be restarted by clicking its badge; before, only a page reload helped.'
            ] },
            { t: 'Added', items: [
                'Size limit for animated thumbnails. Files heavier than the limit show their weight and load only on click, so a gallery of 60 MB animations no longer freezes the tab.',
                'Ctrl+hover preview streams with a progress readout, aborts when the cursor leaves, and refuses files above its own limit.',
                '"Playing at once" can now be set to 0 — nothing animates until hovered.',
                'Large decodes run one at a time.'
            ] }
        ] },
        { v: '15.3.0', groups: [
            { t: 'Fixed', items: [
                'Format badge stretching across the top of thumbnails. Giving the badge a tooltip added a title attribute, which made it match the script\'s own containing-block rule and be forced back into the layout flow.',
                'Stalled downloads no longer hold a slot forever; a watchdog reclaims them.',
                'The grid seeds itself if the intersection observer stays quiet, so animated thumbnails always start.'
            ] },
            { t: 'Changed', items: [
                'One status chip per thumbnail covering the whole lifecycle: finding, downloading with progress, playing, paused, failed. Failed chips retry on click.',
                'Indicators move to the corner opposite the download button.',
                'Top bar trimmed; secondary options moved into Settings.'
            ] }
        ] },
        { v: '15.2.0', groups: [
            { t: 'Fixed', items: [
                'The animation counter reported files whose address had merely been resolved, while the bytes were still in flight — which is why far fewer thumbnails animated than the badge claimed. It now counts only decoded, ready files.'
            ] },
            { t: 'Added', items: [
                'Per-file download progress on each thumbnail, with a progress bar.',
                'Thumbnails are fetched through the userscript transport, so an evicted one re-mounts without touching the network.'
            ] }
        ] },
        { v: '15.1.0', groups: [
            { t: 'Fixed', items: [
                'Hover previews stayed frozen where they appeared: the entrance animation wrote to the same transform used to follow the cursor, and a CSS animation outranks inline styles.',
                'The download button sat across the "Page N" caption because it was anchored to the grid cell rather than to the picture.'
            ] },
            { t: 'Added', items: [
                'Settings panel behind the gear icon.',
                'Five download-button positions, plus a reveal-on-hover mode.',
                'Animated-thumbnail progress badge.'
            ] }
        ] },
        { v: '15.0.0', groups: [
            { t: 'Fixed', items: [
                'Original downloads were always saved as .jpg, because /fullimg/ URLs carry no extension. The real format is now read from the file\'s magic bytes.',
                'Limit notices could be saved as if they were images.',
                'Scroll stutter in the grid: positions were re-measured inside a sort comparator and on every scroll event.',
                'Frozen animations flickered between the sprite and the live image, and were never really paused.'
            ] },
            { t: 'Added', items: [
                'Retries with backoff, a failure list, and per-item retry.',
                'Draggable, collapsible download manager with speed and ETA.',
                'Theme detection so the interface matches the site\'s colour scheme.',
                'Automatic updates from the project repository.'
            ] }
        ] }
    ];

    function buildChangelogHtml(entry) {
        return entry.groups.map(g =>
            `<h4>${g.t}</h4><ul>${g.items.map(i => `<li>${i}</li>`).join('')}</ul>`
        ).join('');
    }

    function showWhatsNew(force) {
        if ($('#eh-whatsnew')) return;
        const seen = String(getSetting('eh_seen_version', ''));
        if (!force && seen === VERSION) return;

        const current = CHANGELOG.find(c => c.v === VERSION) || CHANGELOG[0];
        const older = CHANGELOG.filter(c => c !== current);

        const box = document.createElement('div');
        box.id = 'eh-whatsnew';
        box.innerHTML = `
            <div class="eh-wn-head">
                <span>ExH Downloader — what's new <span class="eh-wn-ver">v${current.v}</span></span>
                <button type="button" class="eh-set-close" id="eh-wn-close" title="Dismiss">✕</button>
            </div>
            <div class="eh-wn-body" id="eh-wn-body">${buildChangelogHtml(current)}</div>
            <div class="eh-wn-foot">
                <button type="button" class="eh-wn-older" id="eh-wn-older">Show earlier versions</button>
                <button type="button" class="eh-top-btn eh-btn-go" id="eh-wn-ok">Got it</button>
            </div>`;
        document.body.appendChild(box);

        const dismiss = () => {
            setSetting('eh_seen_version', VERSION);
            box.remove();
        };
        $('#eh-wn-close', box).addEventListener('click', dismiss);
        $('#eh-wn-ok', box).addEventListener('click', dismiss);

        const olderBtn = $('#eh-wn-older', box);
        let expanded = false;
        olderBtn.addEventListener('click', () => {
            expanded = !expanded;
            $('#eh-wn-body', box).innerHTML = expanded
                ? buildChangelogHtml(current) +
                  older.map(e => `<h4>v${e.v}</h4>${buildChangelogHtml(e)}`).join('')
                : buildChangelogHtml(current);
            olderBtn.textContent = expanded ? 'Hide earlier versions' : 'Show earlier versions';
        });

        document.addEventListener('keydown', function esc(e) {
            if (e.key !== 'Escape') return;
            document.removeEventListener('keydown', esc);
            dismiss();
        });
    }

    // =====================================================================
    // === BOOTSTRAP =======================================================
    // =====================================================================
    function bootstrap() {
        const path = location.pathname;
        try { applySampledPalette(SITE_THEME); } catch (err) { console.warn('[ExHD] palette sampling failed', err); }
        applyButtonPlacement();
        try {
            if (path.startsWith('/s/')) {
                initViewerPage();
            } else if (path.startsWith('/g/')) {
                initGalleryPage();
            } else if (path.startsWith('/mpv/')) {
                // The multi-page viewer has its own downloader; stay out of it.
            } else if ($$('a[href*="/g/"]').length) {
                buildFrontPageBar();
                initFrontPagePeeker();
            }

            // Mark anything already in the collection, on every page that
            // lists galleries — including the gallery page itself.
            if (!path.startsWith('/s/')) {
                try { Favorites.markListings(); } catch (err) { console.warn('[ExHD] fav marks failed', err); }
            }
        } catch (err) {
            console.error('[ExHD] initialisation failed', err);
        }
        // Never on the single-image viewer: it would cover the picture.
        if (!path.startsWith('/s/')) {
            try { showWhatsNew(false); } catch (err) { console.warn('[ExHD] notice failed', err); }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }
})();
