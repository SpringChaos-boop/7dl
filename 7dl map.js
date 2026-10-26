// ==UserScript==
// @name         Семидневный лабиринт CatWar
// @version      1.4
// @description  Встроенная карта 7ДЛ
// @author       Основа была написана игроком Медвянка [406811], доработан и улучшен игроком Горицвет [1705753]
// @supportURL   https://catwar.su/cat1705753
// @match        *://catwar.net/*
// @match        *://catwar.su/*
// @updateURL    https://github.com/SpringChaos-boop/7dl/blob/main/7dl%20map.js
// @downloadURL  https://github.com/SpringChaos-boop/7dl/blob/main/7dl%20map.js
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @require      https://reireirei72.github.io/zero-t-18883/shed/jquery-3.4.1.min.js
// @require      https://raw.githubusercontent.com/litera/jquery-scrollintoview/master/jquery.scrollintoview.min.js
// @require      https://reireirei72.github.io/zero-t-18883/shed/jquery-ui.js
// ==/UserScript==

(function (window, document, $) {
    'use strict';

    // ============================================================
    //  Настройки (localStorage)
    // ============================================================
    function setSettings(key, val) {
        const setting = 'cws7dl_sett_' + key;
        let str;
        if (val === null || val === undefined) {
            str = '';
        } else if (typeof val === 'object') {
            str = JSON.stringify(val);
        } else {
            str = String(val);
        }
        window.localStorage.setItem(setting, str);
    }

    function getSettings(key, defaultValue) {
        if (defaultValue === undefined) defaultValue = null;
        const setting = 'cws7dl_sett_' + key;
        const val = window.localStorage.getItem(setting);
        if (val === null || val === '') return defaultValue;
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (val.charAt(0) === '{' || val.charAt(0) === '[') {
            try { return JSON.parse(val); } catch (e) { /* fall through */ }
        }
        return val;
    }

    // ============================================================
    //  Данные таймера действия (обратная совместимость)
    // ============================================================
    let actionData = getSettings('action_data');
    if (!actionData || typeof actionData !== 'object') {
        actionData = {ts: Date.now(), sec: 0};
    } else {
        if (typeof actionData.ts !== 'number') {
            if (actionData.date) {
                const parsed = new Date(actionData.date).getTime();
                actionData.ts = isNaN(parsed) ? Date.now() : parsed;
            } else {
                actionData.ts = Date.now();
            }
        }
        if (typeof actionData.sec !== 'number') actionData.sec = 0;
    }

    // ============================================================
    //  Таймеры в шапке главной страницы
    // ============================================================
    if (/^https:\/\/\w*\.?catwar.(su|net)\/$/.test(window.location.href)) {
        const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                        'июля','августа','сентября','октября','ноября','декабря'];
        const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const NBSP = '\u00A0';

        function getTimeStr() {
            const d = new Date();
            return d.toLocaleTimeString() + NBSP.repeat(3)
                + DAYS[d.getDay()] + ', '
                + d.getDate() + ' ' + MONTHS[d.getMonth()];
        }

        function getActionTimeStr() {
            const elapsedSec = Math.floor((Date.now() - actionData.ts) / 1000);
            const secLeft = Math.max(0, actionData.sec - elapsedSec);
            if (secLeft < 1) return 'Персонаж не совершает действий';
            const hr = Math.floor(secLeft / 3600);
            const mi = Math.floor((secLeft - hr * 3600) / 60);
            const se = secLeft - hr * 3600 - mi * 60;
            let str = '';
            if (hr) str += hr + ' ч ';
            if (mi || hr) str += mi + ' мин ';
            str += se + ' с';
            return str + ' до конца действия';
        }

        document.head.insertAdjacentHTML('beforeend',
            '<style>#cws_localTimer,#cws_actionTimer{padding:0 .5em;font-size:12px}</style>');

        function updateTimers() {
            const lt = document.getElementById('cws_localTimer');
            const at = document.getElementById('cws_actionTimer');
            if (lt) lt.textContent = getTimeStr();
            if (at) at.textContent = getActionTimeStr();
        }

        const otherList = document.querySelector('.other_cats_list');
        const timerHtml = '| <span id="cws_localTimer">' + getTimeStr() + '</span> | '
                        + '<span id="cws_actionTimer">' + getActionTimeStr() + '</span>';
        if (otherList) {
            otherList.insertAdjacentHTML('beforeend', timerHtml);
        } else {
            document.body.insertAdjacentHTML('afterbegin',
                '<span style="background:white;">' + timerHtml + '</span>');
        }

        setInterval(function () { if (!document.hidden) updateTimers(); }, 1000);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) updateTimers();
        });
    }

    // ============================================================
    //  Карта 7ДЛ
    // ============================================================
    if (/^https:\/\/\w*\.?catwar.(su|net)\/cw3(?!(\/kns|\/jagd))/.test(window.location.href)) {

        // ---------- Парсинг таймера действия из #block_mess ----------
        function handleMessageChange() {
            const el = document.getElementById('block_mess');
            if (!el) return;
            const fullText = (el.textContent || '').replace(/\s+/g, ' ').trim();
            const firstDigitIndex = fullText.search(/\d/);
            if (firstDigitIndex === -1) return;
            let timeStr = fullText.slice(firstDigitIndex);
            timeStr = timeStr.replace(/\s*Отменить.*$/i, '');
            timeStr = timeStr.replace(/\.+$/, '').trim();

            let totalSeconds = 0;
            const dayMatch  = timeStr.match(/(\d+)\s*дн(?:я|ей)?(?![а-яё])/i);
            const hourMatch = timeStr.match(/(\d+)\s*ч(?:ас(?:а|ов)?)?(?![а-яё])/i);
            const minMatch  = timeStr.match(/(\d+)\s*мин(?:ут(?:а|ы)?)?(?![а-яё])/i);
            const secMatch  = timeStr.match(/(\d+)\s*с(?:ек(?:унд(?:а|ы)?)?)?(?![а-яё])/i);

            if (dayMatch)  totalSeconds += parseInt(dayMatch[1], 10) * 86400;
            if (hourMatch) totalSeconds += parseInt(hourMatch[1], 10) * 3600;
            if (minMatch)  totalSeconds += parseInt(minMatch[1], 10) * 60;
            if (secMatch)  totalSeconds += parseInt(secMatch[1], 10);

            setSettings('action_data', {ts: Date.now(), sec: totalSeconds});
        }

        const trActions = document.getElementById('tr_actions');
        if (trActions) {
            const actionsObserver = new MutationObserver(function (mutations) {
                for (const m of mutations) {
                    if (m.type === 'childList') {
                        let hit = false;
                        m.addedNodes.forEach(function (node) {
                            if (node.nodeType !== 1) return;
                            if (node.id === 'block_mess' || node.querySelector?.('#block_mess')) hit = true;
                        });
                        m.removedNodes.forEach(function (node) {
                            if (node.nodeType !== 1) return;
                            if (node.id === 'block_mess') hit = true;
                        });
                        if (hit) return handleMessageChange();
                    }
                    if (m.type === 'characterData') {
                        const p = m.target.parentElement;
                        if (p && (p.id === 'block_mess' || p.closest?.('#block_mess'))) {
                            return handleMessageChange();
                        }
                    }
                    if (m.type === 'attributes' && m.target.id === 'block_mess') {
                        return handleMessageChange();
                    }
                }
            });
            actionsObserver.observe(trActions, {
                childList: true, subtree: true,
                characterData: true, characterDataOldValue: true,
                attributes: true
            });
        }

        // ---------- Состояние карты ----------
        let map = {}, searchMap = {}, ready = false;
        let loc_now  = getSettings('loc_now',  'Лабиринт:0');
        let loc_prev = getSettings('loc_prev', 'Лабиринт:0');
        let isObserving = getSettings('is_observing', false) === true;
        let lab_choice = getSettings('lab_choice', 'Лабиринт Безумных Волн (нижний)');
        let loc_choice = +getSettings('loc_choice', 1) || 1;

        const lab_list = [
            'Лабиринт Безумных Волн', 'Лабиринт Зноя', 'Лабиринт Острых Зубьев',
            'Великий Путь', 'Лабиринт Жажды', 'Лабиринт Темноты',
            'Лабиринт Искушений', 'Лабиринт Внимательности', 'Лабиринт Бессилия',
            'Лабиринт Слабости', 'Лабиринт Забвения'
        ];

        // ---------- Стили панели (темы через CSS-переменные) ----------
        document.head.insertAdjacentHTML('beforeend', `
            <style>
                /* ---------- Светлая тема (по умолчанию) ---------- */
                #cws_7dl_div {
                    --cws-header-bg:       #6b705c;
                    --cws-header-text:     #f5f3ee;
                    --cws-panel-bg:        #dad7cd;
                    --cws-panel-text:      #344e41;
                    --cws-border:          #a3b18a;

                    --cws-btn-bg:          #a3b18a;
                    --cws-btn-text:        #2d332a;
                    --cws-btn-border:      #8a9a5b;
                    --cws-btn-hover-bg:    #6b705c;
                    --cws-btn-hover-text:  #f5f3ee;

                    --cws-input-bg:        #f5f3ee;
                    --cws-input-border:    #b7b7a4;
                    --cws-input-text:      #344e41;

                    --cws-cell-border:     #a3b18a;
                    --cws-cell-neutral:    #f5f3ee;
                    --cws-cell-green:      #8a9a5b;
                    --cws-cell-blue:       #5b7c99;

                    --cws-hr:              #b7b7a4;
                    --cws-small-text:      #6b705c;

                    --cws-switch-off:      #b7b7a4;
                    --cws-switch-on:       #6b705c;
                    --cws-switch-knob:     #f5f3ee;
                }

                /* ---------- Тёмная тема ---------- */
                #cws_7dl_div.cws-dark {
                    --cws-header-bg:       #3a5a40;
                    --cws-header-text:     #f5f3ee;
                    --cws-panel-bg:        #2d332a;
                    --cws-panel-text:      #dad7cd;
                    --cws-border:          #4a5240;

                    --cws-btn-bg:          #4a5240;
                    --cws-btn-text:        #dad7cd;
                    --cws-btn-border:      #6b705c;
                    --cws-btn-hover-bg:    #6b705c;
                    --cws-btn-hover-text:  #f5f3ee;

                    --cws-input-bg:        #1f251d;
                    --cws-input-border:    #4a5240;
                    --cws-input-text:      #dad7cd;

                    --cws-cell-border:     #4a5240;
                    --cws-cell-neutral:    #3d4436;
                    --cws-cell-green:      #a3b18a;
                    --cws-cell-blue:       #7ba7c9;

                    --cws-hr:              #4a5240;
                    --cws-small-text:      #a3b18a;

                    --cws-switch-off:      #4a5240;
                    --cws-switch-on:       #a3b18a;
                    --cws-switch-knob:     #dad7cd;
                }

                /* ---------- Общие стили ---------- */
                #cws_7dl_div {
                    position: fixed;
                    top: 80px;
                    left: 80px;
                    background-color: var(--cws-panel-bg);
                    color: var(--cws-panel-text);
                    border: 1px solid var(--cws-border);
                    border-radius: 6px;
                    box-shadow: 0 4px 16px rgba(0,0,0,.35);
                    z-index: 10000;
                    min-width: 260px;
                    max-width: 380px;
                    font-size: 12px;
                    transition: background-color .25s, color .25s, border-color .25s;
                }
                #cws_7dl_header {
                    background-color: var(--cws-header-bg);
                    color: var(--cws-header-text);
                    padding: 6px 10px;
                    cursor: move;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                    border-radius: 5px 5px 0 0;
                    font-weight: bold;
                    transition: background-color .25s, color .25s;
                }
                #cws_7dl_header .cws_7dl_btns {
                    display: flex;
                    gap: 4px;
                }
                /* Кнопки шапки — прозрачные, с контрастной рамкой */
                #cws_7dl_div #cws_7dl_header button {
                    background: transparent;
                    border: 1px solid var(--cws-header-text);
                    color: var(--cws-header-text);
                    cursor: pointer;
                    padding: 0 6px;
                    font-size: 12px;
                    line-height: 18px;
                    min-width: 22px;
                    border-radius: 3px;
                    transition: background-color .15s;
                }
                #cws_7dl_div #cws_7dl_header button:hover {
                    background: rgba(255,255,255,.2);
                }
                #cws_7dl_content {
                    padding: 8px 10px 10px;
                    max-height: 70vh;
                    overflow-y: auto;
                    transition: background-color .25s, color .25s;
                }
                #cws_7dl_content.collapsed { display: none; }

                #cws_7dl_div #cws_7dl_table {
                    border-collapse: collapse;
                    background-color: transparent;
                }
                #cws_7dl_div #cws_7dl_table td {
                    height: 30px;
                    width: 22px;
                    border: 1px solid var(--cws-cell-border);
                    transition: background-color .25s, border-color .25s;
                }
                #cws_7dl_div #cws_7dl_table .highlight--1 { background-color: var(--cws-cell-neutral); }
                #cws_7dl_div #cws_7dl_table .highlight-0  { background-color: var(--cws-cell-green); }
                #cws_7dl_div #cws_7dl_table .highlight-1  { background-color: var(--cws-cell-blue); }

                #cws_7dl_div hr {
                    border: none;
                    border-top: 1px solid var(--cws-hr);
                    margin: 8px 0;
                }
                #cws_7dl_div small {
                    color: var(--cws-small-text);
                    transition: color .25s;
                }

                /* Обычные кнопки в теле панели */
                #cws_7dl_div button {
                    background-color: var(--cws-btn-bg);
                    color: var(--cws-btn-text);
                    border: 1px solid var(--cws-btn-border);
                    border-radius: 3px;
                    padding: 3px 8px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background-color .15s, color .15s, border-color .15s;
                }
                #cws_7dl_div button:hover {
                    background-color: var(--cws-btn-hover-bg);
                    color: var(--cws-btn-hover-text);
                    border-color: var(--cws-btn-hover-bg);
                }

                /* Поля ввода / select */
                #cws_7dl_div select,
                #cws_7dl_div input[type="text"] {
                    background-color: var(--cws-input-bg);
                    color: var(--cws-input-text);
                    border: 1px solid var(--cws-input-border);
                    border-radius: 3px;
                    padding: 2px 4px;
                    font-size: 12px;
                    transition: background-color .25s, color .25s, border-color .25s;
                }

                /* ---------- Тумблер «Обновлять при переходе» ---------- */
                .cws-observe-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 0 2px;
                    cursor: pointer;
                    user-select: none;
                    -webkit-user-select: none;
                }
                .cws-switch {
                    position: relative;
                    display: inline-block;
                    width: 36px;
                    height: 20px;
                    flex-shrink: 0;
                }
                .cws-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                    position: absolute;
                    margin: 0;
                }
                .cws-slider {
                    position: absolute;
                    inset: 0;
                    background-color: var(--cws-switch-off);
                    border-radius: 20px;
                    transition: background-color .25s;
                }
                .cws-slider::before {
                    content: "";
                    position: absolute;
                    height: 14px;
                    width: 14px;
                    left: 3px;
                    top: 3px;
                    background-color: var(--cws-switch-knob);
                    border-radius: 50%;
                    transition: transform .25s, background-color .25s;
                    box-shadow: 0 1px 2px rgba(0,0,0,.25);
                }
                .cws-switch input:checked + .cws-slider {
                    background-color: var(--cws-switch-on);
                }
                .cws-switch input:checked + .cws-slider::before {
                    transform: translateX(16px);
                }
                .cws-switch-label {
                    color: var(--cws-panel-text);
                    font-size: 12px;
                    transition: color .25s;
                }
            </style>
        `);

        // ---------- HTML панели ----------
        let html = '<div id="cws_7dl_div">'
            + '<div id="cws_7dl_header">'
            +   '<span>Карта 7ДЛ</span>'
            +   '<div class="cws_7dl_btns">'
            +     '<button id="cws_7dl_theme" title="Тёмная тема">☾</button>'
            +     '<button id="cws_7dl_toggle" title="Свернуть">—</button>'
            +   '</div>'
            + '</div>'
            + '<div id="cws_7dl_content">'
            +   '<div style="padding-bottom:.5em" id="cws_7dl_loc_type">Неизвестный лабиринт</div>'
            +   '<div><table border="1" id="cws_7dl_table">';
        for (let y = 0; y < 6; y++) {
            html += '<tr>';
            for (let x = 0; x < 10; x++) html += '<td></td>';
            html += '</tr>';
        }
        html += '</table></div>'
            +   '<div><small>Зелёное — к ОВ (ОП), синее — к МВ (МП)</small></div><hr>'
            +   '<div id="cws_7dl_observe_alt">'
            +     '<div style="padding-bottom:.25em">Переключение вручную</div>'
            +     '<div style="padding-bottom:.25em"><select id="cws_7dl_lab_choice">';
        for (let i = 0; i < lab_list.length; i++) {
            const name = lab_list[i] + ' (нижний)';
            html += '<option' + (lab_choice === name ? ' selected' : '') + '>' + name + '</option>';
        }
        for (let i = lab_list.length - 1; i >= 0; i--) {
            const name = lab_list[i] + ' (верхний)';
            html += '<option' + (lab_choice === name ? ' selected' : '') + '>' + name + '</option>';
        }
        html += '</select></div>'
            +     '<div><button id="cws_7dl_left">ОП &lt;</button> '
            +     '<input type="text" id="cws_7dl_loc_choice" value="' + loc_choice + '" size="4"> '
            +     '<button id="cws_7dl_right">&gt; МП</button></div>'
            +     '<hr></div>'
            +   '<label class="cws-observe-row" title="Автоматически обновлять карту при переходе">'
            +     '<span class="cws-switch">'
            +       '<input type="checkbox" id="cws_7dl_observe">'
            +       '<span class="cws-slider"></span>'
            +     '</span>'
            +     '<span class="cws-switch-label">Обновлять при переходе</span>'
            +   '</label>'
            + '</div>'
            + '</div>';
        document.body.insertAdjacentHTML('beforeend', html);

        // ---------- Элементы панели ----------
        const panel         = document.getElementById('cws_7dl_div');
        const panelHeader   = document.getElementById('cws_7dl_header');
        const panelContent  = document.getElementById('cws_7dl_content');
        const toggleBtn     = document.getElementById('cws_7dl_toggle');
        const themeBtn      = document.getElementById('cws_7dl_theme');
        const locTypeEl     = document.getElementById('cws_7dl_loc_type');
        const labSelect     = document.getElementById('cws_7dl_lab_choice');
        const leftBtn       = document.getElementById('cws_7dl_left');
        const rightBtn      = document.getElementById('cws_7dl_right');
        const observeCheckbox = document.getElementById('cws_7dl_observe');
        const locInput      = document.getElementById('cws_7dl_loc_choice');
        const observeAlt    = document.getElementById('cws_7dl_observe_alt');

        // ---------- Позиция панели: сохранить / клампить ----------
        function savePanelPos() {
            const rect = panel.getBoundingClientRect();
            setSettings('panel_pos', {left: rect.left, top: rect.top});
        }

        function clampToScreen() {
            const rect = panel.getBoundingClientRect();
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            const nl = Math.max(0, Math.min(rect.left, window.innerWidth - w));
            const nt = Math.max(0, Math.min(rect.top,  window.innerHeight - h));
            if (nl !== rect.left || nt !== rect.top) {
                panel.style.left = nl + 'px';
                panel.style.top  = nt + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
                savePanelPos();
            }
        }

        // Восстановление позиции
        (function () {
            const pos = getSettings('panel_pos');
            if (pos && typeof pos === 'object'
                && typeof pos.left === 'number' && typeof pos.top === 'number') {
                panel.style.left = pos.left + 'px';
                panel.style.top  = pos.top  + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        })();

        // Восстановление свёрнутости
        if (getSettings('panel_collapsed', false) === true) {
            panelContent.classList.add('collapsed');
            toggleBtn.textContent = '+';
            toggleBtn.title = 'Развернуть';
        }

        // ---------- Восстановление темы ----------
        if (getSettings('theme', 'light') === 'dark') {
            panel.classList.add('cws-dark');
            themeBtn.textContent = '☀';
            themeBtn.title = 'Светлая тема';
        }

        // ---------- Переключение темы ----------
        themeBtn.addEventListener('click', function () {
            const isDark = panel.classList.toggle('cws-dark');
            themeBtn.textContent = isDark ? '☀' : '☾';
            themeBtn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
            setSettings('theme', isDark ? 'dark' : 'light');
        });

        // ---------- Drag ----------
        (function () {
            let dragging = false;
            let startX = 0, startY = 0, startLeft = 0, startTop = 0;

            panelHeader.addEventListener('pointerdown', function (e) {
                if (e.target.closest('button')) return;
                if (e.button !== 0) return;
                dragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop  = rect.top;
                panel.style.left   = startLeft + 'px';
                panel.style.top    = startTop  + 'px';
                panel.style.right  = 'auto';
                panel.style.bottom = 'auto';
                try { panelHeader.setPointerCapture(e.pointerId); } catch (err) {}
                e.preventDefault();
            });

            panelHeader.addEventListener('pointermove', function (e) {
                if (!dragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                let left = startLeft + dx;
                let top  = startTop  + dy;
                left = Math.max(0, Math.min(left, window.innerWidth  - panel.offsetWidth));
                top  = Math.max(0, Math.min(top,  window.innerHeight - panel.offsetHeight));
                panel.style.left = left + 'px';
                panel.style.top  = top  + 'px';
                e.preventDefault();
            });

            function endDrag(e) {
                if (!dragging) return;
                dragging = false;
                try { panelHeader.releasePointerCapture(e.pointerId); } catch (err) {}
                savePanelPos();
            }
            panelHeader.addEventListener('pointerup', endDrag);
            panelHeader.addEventListener('pointercancel', endDrag);
        })();

        // ---------- Свернуть / развернуть ----------
        toggleBtn.addEventListener('click', function () {
            panelContent.classList.toggle('collapsed');
            const collapsed = panelContent.classList.contains('collapsed');
            toggleBtn.textContent = collapsed ? '+' : '—';
            toggleBtn.title = collapsed ? 'Развернуть' : 'Свернуть';
            setSettings('panel_collapsed', collapsed);
            if (!collapsed) clampToScreen();
        });

        window.addEventListener('resize', clampToScreen);

        // ---------- Обработчики UI карты ----------
        labSelect.addEventListener('change', function () {
            if (!ready) return;
            const newChoice = this.value;
            if (newChoice === lab_choice) return;
            const prevIndex = Array.from(labSelect.options).findIndex(o => o.value === lab_choice);
            const direction = this.selectedIndex > prevIndex ? 1 : -1;
            const isRightSide = newChoice.indexOf('(верхний)') !== -1;
            lab_choice = newChoice;
            loc_choice = isRightSide
                ? (direction < 0 ? getLocCount() : 1)
                : (direction < 0 ? 1 : getLocCount());
            locInput.value = loc_choice;
            setSettings('lab_choice', lab_choice);
            setSettings('loc_choice', loc_choice);
            switchMap();
        });

        leftBtn.addEventListener('click', function () {
            if (!ready) return;
            const isRightSide = lab_choice.indexOf('(верхний)') !== -1;
            switchLoc(loc_choice + (isRightSide ? -1 : 1));
        });

        rightBtn.addEventListener('click', function () {
            if (!ready) return;
            const isRightSide = lab_choice.indexOf('(верхний)') !== -1;
            switchLoc(loc_choice + (isRightSide ? 1 : -1));
        });

        // ---------- Тумблер автообновления ----------
        observeCheckbox.addEventListener('change', function () {
            if (!ready) {
                this.checked = isObserving;
                return;
            }
            if (this.checked && !isObserving) startObserving();
            else if (!this.checked && isObserving) stopObserving();
        });

        locInput.addEventListener('input', function () {
            if (!ready) return;
            const val = this.value;
            if (!val || isNaN(+val)) return;
            switchLoc(val);
        });

        // ---------- Наблюдатель за переходами ----------
        const mapObserver = new MutationObserver(function (mutations) {
            let shouldUpdate = false;
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(function (node) {
                        if (node.nodeType !== 1) return;
                        if (node.matches?.('.move_parent') || node.querySelector?.('.move_parent')) {
                            shouldUpdate = true;
                        }
                    });
                    m.removedNodes.forEach(function (node) {
                        if (node.nodeType !== 1) return;
                        if (node.matches?.('.move_parent') || node.querySelector?.('.move_parent')) {
                            shouldUpdate = true;
                        }
                    });
                } else if (m.type === 'attributes' && m.attributeName === 'class') {
                    if (m.target.classList.contains('move_parent')) shouldUpdate = true;
                }
                if (shouldUpdate) break;
            }
            if (shouldUpdate) refreshMap();
        });

        // ---------- Логика карты ----------
        function getLabName(fullName) {
            return fullName.split('(')[0].trim();
        }

        function getLocCount() {
            const lab = getLabName(lab_choice);
            if (!map[lab]) return 0;
            const sign = lab_choice.indexOf('(верхний)') !== -1 ? -1 : 1;
            return Object.keys(map[lab]).filter(v => sign > 0 ? +v > 0 : +v < 0).length;
        }

        function highlightCells(locData) {
            document.querySelectorAll('#cws_7dl_table td').forEach(function (td) {
                td.classList.remove('highlight-0', 'highlight-1', 'highlight--1');
            });
            if (!locData) return;
            const rows = document.querySelectorAll('#cws_7dl_table tr');
            for (const coord in locData) {
                const parts = coord.split('x');
                const x = +parts[0], y = +parts[1];
                const row = rows[y - 1];
                if (!row) continue;
                const cell = row.children[x - 1];
                if (!cell) continue;
                cell.classList.add('highlight-' + locData[coord]);
            }
        }

        function refreshMap() {
            if (!ready) return;
            locTypeEl.textContent = 'Неизвестный лабиринт';
            highlightCells(null);

            const locationEl = document.getElementById('location');
            if (!locationEl) return;
            const loc = locationEl.textContent.replace(/\u00AD/g, '');
            if (lab_list.indexOf(loc) === -1) return;
            const loc_type = loc;

            const moves = [];
            document.querySelectorAll('#cages > tbody > tr').forEach(function (tr, r) {
                tr.querySelectorAll('.cage').forEach(function (cage, c) {
                    if (cage.querySelector('.move_parent, .smell_move')) {
                        moves.push((c + 1) + 'x' + (r + 1));
                    }
                });
            });
            const key = moves.join('|');
            let loc_id = searchMap[loc_type] && searchMap[loc_type][key];

            if (Array.isArray(loc_id)) {
                const was = +(loc_now.split(':')[1]);
                if (was === 0) return;
                const was1 = loc_id.findIndex(v => v == was + 1);
                const was2 = loc_id.findIndex(v => v == was - 1);
                if (was1 !== -1 && was2 !== -1) return;
                if (was1 === -1 && was2 === -1) return;
                loc_id = was1 !== -1 ? loc_id[was1] : loc_id[was2];
            }

            if (loc_id == null) return;
            locTypeEl.textContent = loc_type + ' [' + loc_id + ']';
            loc_prev = loc_now;
            loc_now = loc_type + ':' + loc_id;
            setSettings('loc_prev', loc_prev);
            setSettings('loc_now',  loc_now);
            highlightCells(map[loc_type][loc_id]);
        }

        function switchMap() {
            if (!ready) return;
            const loc_type = getLabName(lab_choice);
            const loc = lab_choice.indexOf('(верхний)') !== -1 ? -loc_choice : loc_choice;
            locTypeEl.textContent = loc_type + ' [' + loc + ']';
            highlightCells(map[loc_type] && map[loc_type][loc]);
        }

        function switchLoc(newLoc) {
            if (!ready) return;
            if (+newLoc === loc_choice) return;
            const count = getLocCount();
            if (count === 0) return;
            newLoc = Math.max(1, Math.min(+newLoc, count));
            loc_choice = newLoc;
            setSettings('loc_choice', loc_choice);
            locInput.value = loc_choice;
            switchMap();
        }

        function startObserving() {
            if (isObserving) return;
            const cages = document.getElementById('cages');
            if (!cages) return;
            isObserving = true;
            setSettings('is_observing', true);
            observeCheckbox.checked = true;
            observeAlt.style.display = 'none';
            refreshMap();
            mapObserver.observe(cages, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['class']
            });
        }

        function stopObserving() {
            if (!isObserving) return;
            isObserving = false;
            setSettings('is_observing', false);
            observeCheckbox.checked = false;
            observeAlt.style.display = '';
            refreshMap();
            mapObserver.disconnect();
        }

        // Начальное отображение состояния тумблера/ручной панели
        if (isObserving) {
            observeCheckbox.checked = true;
            observeAlt.style.display = 'none';
        }

        // ---------- Загрузка данных карты ----------
        // ВАЖНО: именно здесь лежат данные карт.
        $.getJSON('https://reireirei72.github.io/zero-t-18883/shed/cws_7dl_map.json?' + Date.now())
            .done(function (r) {
                map = r.map;
                searchMap = r.searchMap;
                ready = true;
                if (isObserving) {
                    isObserving = false;
                    setSettings('lab_choice', 'Лабиринт Безумных Волн (нижний)');
                    setSettings('loc_choice', 1);
                    startObserving();
                } else {
                    switchMap();
                }
            })
            .fail(function (jqXHR, textStatus, errorThrown) {
                console.error('JSON failed:', textStatus, errorThrown);
            });
    }
})(window, document, jQuery);
