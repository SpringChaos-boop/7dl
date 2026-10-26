// ==UserScript==
// @name         Семидневный лабиринт CatWar
// @version      1.3
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
        // Старый формат {date, sec} → новый {ts, sec}
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

        // ---------- Стили панели ----------
        document.head.insertAdjacentHTML('beforeend', `
            <style>
                #cws_7dl_div {
                    position: fixed;
                    top: 80px;
                    left: 80px;
                    background: #fff;
                    border: 1px solid #555;
                    border-radius: 5px;
                    box-shadow: 0 4px 16px rgba(0,0,0,.35);
                    z-index: 10000;
                    min-width: 260px;
                    max-width: 380px;
                    font-size: 12px;
                    color: #000;
                }
                #cws_7dl_header {
                    background: #4a6fa5;
                    color: #fff;
                    padding: 5px 8px;
                    cursor: move;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                    border-radius: 4px 4px 0 0;
                    font-weight: bold;
                }
                #cws_7dl_header .cws_7dl_btns { display: flex; gap: 4px; }
                #cws_7dl_header button {
                    background: transparent;
                    border: 1px solid #fff;
                    color: #fff;
                    cursor: pointer;
                    padding: 0 6px;
                    font-size: 11px;
                    line-height: 16px;
                    border-radius: 2px;
                }
                #cws_7dl_header button:hover { background: rgba(255,255,255,.2); }
                #cws_7dl_content {
                    padding: 8px;
                    max-height: 70vh;
                    overflow-y: auto;
                }
                #cws_7dl_content.collapsed { display: none; }
                #cws_7dl_table { border-collapse: collapse; }
                #cws_7dl_table td {
                    height: 30px;
                    width: 22px;
                    border: 1px solid #999;
                }
                #cws_7dl_table .highlight--1 { background-color: #fff; }
                #cws_7dl_table .highlight-0  { background-color: #92d050; }
                #cws_7dl_table .highlight-1  { background-color: #002060; }
            </style>
        `);

        // ---------- HTML панели ----------
        let html = '<div id="cws_7dl_div">'
            + '<div id="cws_7dl_header">'
            +   '<span>Карта 7ДЛ</span>'
            +   '<div class="cws_7dl_btns"><button id="cws_7dl_toggle" title="Свернуть">—</button></div>'
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
            +   '<div><button id="cws_7dl_observe">Обновлять при переходе</button></div>'
            + '</div>'
            + '</div>';
        document.body.insertAdjacentHTML('beforeend', html);

        // ---------- Элементы панели ----------
        const panel         = document.getElementById('cws_7dl_div');
        const panelHeader   = document.getElementById('cws_7dl_header');
        const panelContent  = document.getElementById('cws_7dl_content');
        const toggleBtn     = document.getElementById('cws_7dl_toggle');
        const locTypeEl     = document.getElementById('cws_7dl_loc_type');
        const labSelect     = document.getElementById('cws_7dl_lab_choice');
        const leftBtn       = document.getElementById('cws_7dl_left');
        const rightBtn      = document.getElementById('cws_7dl_right');
        const observeBtn    = document.getElementById('cws_7dl_observe');
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

        observeBtn.addEventListener('click', function () {
            if (!ready) return;
            if (isObserving) stopObserving();
            else startObserving();
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
            observeBtn.textContent = 'НЕ обновлять при переходе';
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
            observeBtn.textContent = 'Обновлять при переходе';
            observeAlt.style.display = '';
            refreshMap();
            mapObserver.disconnect();
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
