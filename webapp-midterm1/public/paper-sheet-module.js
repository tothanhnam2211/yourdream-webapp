(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.YourdreamPreview = Object.assign(root.YourdreamPreview || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VALID_KEY_RE = /^[A-Za-z0-9:._-]{1,100}$/;
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  function isValidKey(k) {
    return typeof k === 'string' && VALID_KEY_RE.test(k) && !FORBIDDEN_KEYS.has(k);
  }

  function formatPartLabel(partKey) {
    if (partKey === 'main') return 'Toàn bài';
    if (partKey === 'shared_domain') return 'ĐKXĐ chung';
    if (typeof partKey === 'string' && /^y_(.+)$/i.test(partKey)) {
      return `Ý ${partKey.slice(2)}`;
    }
    return `Ý ${partKey}`;
  }

  function getOrderedPartEntries(graph) {
    if (!graph || typeof graph !== 'object') return [];
    const raw = graph.subquestion_step_groups && typeof graph.subquestion_step_groups === 'object'
      ? Object.entries(graph.subquestion_step_groups).filter(
          ([k, ids]) => isValidKey(k) && Array.isArray(ids) && ids.length > 0
        )
      : [];
    if (!raw.length) {
      return [['main', Array.isArray(graph.step_ids) ? graph.step_ids.slice() : []]];
    }
    return raw.sort(([a], [b]) =>
      a === 'shared_domain' ? -1 : b === 'shared_domain' ? 1 : a.localeCompare(b, 'vi', { numeric: true })
    );
  }

  function resolvePartForStep(graph, stepId, preferredPartKey) {
    const entries = getOrderedPartEntries(graph);
    if (!entries.length) return 'main';
    if (preferredPartKey && isValidKey(preferredPartKey)) {
      const pref = entries.find(([k]) => k === preferredPartKey);
      if (pref && (!stepId || pref[1].includes(stepId))) return pref[0];
    }
    if (stepId && isValidKey(stepId)) {
      const found = entries.find(([, ids]) => ids.includes(stepId));
      if (found) return found[0];
    }
    return entries[0][0];
  }

  function findClosestDataEl(target, rootEl, attrNames) {
    let cur = target;
    while (cur && cur !== rootEl) {
      if (cur.dataset) {
        for (const name of attrNames) {
          if (cur.dataset[name]) return cur;
        }
      }
      if (typeof cur.getAttribute === 'function') {
        for (const name of attrNames) {
          const kebab = 'data-' + name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          const val = cur.getAttribute(kebab);
          if (val) {
            if (!cur.dataset) cur.dataset = {};
            cur.dataset[name] = val;
            return cur;
          }
        }
      }
      cur = cur.parentElement || cur.parentNode || null;
    }
    return null;
  }

  function createPaperSheetModule(config) {
    const {
      paperRoot = null,
      sheetHeaderRoot = null,
      subquestionRoot = null,
      ports = {},
      callbacks = {},
    } = config || {};

    const escapeHtml = typeof ports.escapeHtml === 'function' ? ports.escapeHtml : (s) => String(s ?? '');
    const renderMath = typeof ports.renderMath === 'function' ? ports.renderMath : (s) => escapeHtml(s);
    const onSelectPart = typeof callbacks.onSelectPart === 'function' ? callbacks.onSelectPart : () => {};
    const onSelectItem = typeof callbacks.onSelectItem === 'function' ? callbacks.onSelectItem : () => {};
    const onSelectStep = typeof callbacks.onSelectStep === 'function' ? callbacks.onSelectStep : () => {};
    const onBackToPaper = typeof callbacks.onBackToPaper === 'function' ? callbacks.onBackToPaper : () => {};

    let listenerMountCount = 0;
    let mounted = false;

    function mount() {
      if (mounted) return;
      mounted = true;
      listenerMountCount += 1;

      if (paperRoot) {
        paperRoot.onclick = function onPaperRootClick(e) {
          const el = findClosestDataEl(e && e.target, paperRoot, ['paperPart', 'paperItem']);
          if (!el || !el.dataset) return;
          const itemId = el.dataset.paperItem;
          const partKey = el.dataset.paperPart;
          if (isValidKey(itemId) && isValidKey(partKey)) {
            onSelectPart(itemId, partKey);
          } else if (isValidKey(itemId)) {
            onSelectItem(itemId);
          }
        };
      }

      if (sheetHeaderRoot) {
        sheetHeaderRoot.onclick = function onSheetHeaderClick(e) {
          const el = findClosestDataEl(e && e.target, sheetHeaderRoot, ['action', 'partStep']);
          if (!el || !el.dataset) return;
          if (el.dataset.action === 'back-to-paper') {
            onBackToPaper();
          } else if (isValidKey(el.dataset.partStep)) {
            onSelectStep(el.dataset.partStep);
          }
        };
      }

      if (subquestionRoot) {
        subquestionRoot.onclick = function onSubquestionRootClick(e) {
          const el = findClosestDataEl(e && e.target, subquestionRoot, ['sub']);
          if (!el || !el.dataset) return;
          const partKey = el.dataset.sub;
          const itemId = el.dataset.subItem;
          if (isValidKey(partKey)) {
            onSelectPart(isValidKey(itemId) ? itemId : null, partKey);
          }
        };
      }
    }

    function bindMockChildrenIfNeeded(rootEl, handler) {
      if (!rootEl || !Array.isArray(rootEl._children)) return;
      for (const child of rootEl._children) {
        child.onclick = () => handler({ target: child });
      }
    }

    function render(snapshot) {
      if (!mounted) mount();
      if (!snapshot || !Array.isArray(snapshot.exercises) || !snapshot.exercises.length) {
        if (paperRoot) paperRoot.innerHTML = '';
        if (sheetHeaderRoot) sheetHeaderRoot.innerHTML = '';
        if (subquestionRoot) {
          subquestionRoot.hidden = true;
          subquestionRoot.innerHTML = '';
        }
        return;
      }

      const inUnsubmittedExam = snapshot.examMode === 'exam' && !snapshot.examSubmitted;

      if (paperRoot) {
        const metaNote = snapshot.isBatch02A
          ? '<p class="paper-provenance-note"><strong>Lưu ý cấu trúc tờ đề (Batch 02A · DRAFT):</strong> Đề gồm 5 bài / 24 bước giải (Thang điểm 10,0 · 90 phút). Dữ liệu nguồn giữ nguyên văn đề từng bài và các nhóm ý (<code>subquestion_step_groups</code>); chưa tách chuỗi văn bản đề hay điểm/thời lượng riêng cho từng ý nên giữ nguyên văn đề gốc, không tự suy đoán điểm từ số bước. Bấm chọn một <strong>Ý</strong> bên dưới để mở <strong>Giấy làm bài</strong>.</p>'
          : '<p class="paper-provenance-note"><strong>Lưu ý cấu trúc tờ đề:</strong> Bấm chọn một <strong>Ý</strong> trong từng bài bên dưới để mở <strong>Giấy làm bài</strong> tương ứng.</p>';

        const itemsHtml = snapshot.exercises
          .map((ex) => {
            const isCurrentEx = ex.itemId === snapshot.activeItemId;
            const progLabel = inUnsubmittedExam
              ? `Đã ghi ${ex.answeredStepCount}/${ex.totalSteps} bước`
              : `Đã hoàn thành ${ex.completedStepCount}/${ex.totalSteps} bước`;
            const partButtonsHtml = ex.parts
              .map((p) => {
                const isCurrentPart = isCurrentEx && p.partKey === snapshot.activePartKey;
                const pProg = inUnsubmittedExam
                  ? `${p.answeredCount}/${p.stepIds.length} bước đã ghi`
                  : `${p.completedCount}/${p.stepIds.length} bước đúng`;
                return `<button type="button" class="paper-part-btn${isCurrentPart ? ' is-active-part' : ''}" data-paper-item="${escapeHtml(ex.itemId)}" data-paper-part="${escapeHtml(p.partKey)}" aria-pressed="${isCurrentPart}"><strong>${escapeHtml(p.label)}</strong><small>[${escapeHtml(p.partKey)}] · ${escapeHtml(pProg)}</small></button>`;
              })
              .join('');

            return `<article class="exam-paper-item${isCurrentEx ? ' is-active-exercise' : ''}" data-exercise-card="${escapeHtml(ex.itemId)}"><div class="exam-paper-item-head"><strong>Bài ${ex.index} (${ex.parts.length} ý · ${ex.totalSteps} bước giải)</strong><span class="paper-step-badge">${escapeHtml(progLabel)}</span></div><div class="math-text exam-paper-prompt">${renderMath(ex.prompt)}</div><small class="exam-paper-subtitle">Điều kiện / Xuất xứ: ${renderMath(ex.subtitle)}</small><div class="paper-part-actions" role="group" aria-label="Chọn ý làm bài của Bài ${ex.index}"><span class="paper-part-caption">Chọn ý để mở Giấy làm bài:</span>${partButtonsHtml}</div></article>`;
          })
          .join('');

        paperRoot.innerHTML = metaNote + itemsHtml;
        bindMockChildrenIfNeeded(paperRoot, paperRoot.onclick);
      }

      const activeEx =
        snapshot.exercises.find((ex) => ex.itemId === snapshot.activeItemId) || snapshot.exercises[0];
      const activePart =
        activeEx.parts.find((p) => p.partKey === snapshot.activePartKey) || activeEx.parts[0];

      if (sheetHeaderRoot && activeEx && activePart) {
        const partProg = inUnsubmittedExam
          ? `${activePart.answeredCount}/${activePart.stepIds.length} bước đã ghi`
          : `${activePart.completedCount}/${activePart.stepIds.length} bước đã làm đúng`;
        const pillsHtml = activePart.steps
          .map(
            (st) =>
              `<button type="button" class="part-step-pill${st.isActive ? ' is-active' : ''}${st.isCompleted && !inUnsubmittedExam ? ' is-done' : ''}" data-part-step="${escapeHtml(st.stepId)}" aria-pressed="${st.isActive}"><b>Bước ${st.orderInExercise}</b><span>${escapeHtml(st.title)}</span><small>${escapeHtml(st.statusText)}</small></button>`
          )
          .join('');

        sheetHeaderRoot.innerHTML = `<div class="sheet-nav-row"><button id="back-to-paper" type="button" class="back-to-paper-btn" data-action="back-to-paper">← Quay lại tờ đề (5 bài)</button><div id="active-part-badge" class="active-part-badge" role="status"><strong>Đang làm: Bài ${activeEx.index} · ${escapeHtml(activePart.label)}</strong> <code>[${escapeHtml(activePart.partKey)}]</code> · <span>${escapeHtml(partProg)}</span></div></div><p class="sheet-part-note">Hiển thị nguyên văn đề Bài ${activeEx.index} (không cắt chuỗi công thức) · Nhóm bước đang chọn: <strong>${escapeHtml(activePart.label)}</strong> (<code>${escapeHtml(activePart.partKey)}</code> · ${activePart.steps.length} bước).</p><div id="part-step-pills" class="part-step-pills" role="group" aria-label="Các bước trong ${escapeHtml(activePart.label)}">${pillsHtml}</div>`;
        bindMockChildrenIfNeeded(sheetHeaderRoot, sheetHeaderRoot.onclick);
      }

      if (subquestionRoot && activeEx) {
        if (activeEx.parts.length <= 1) {
          subquestionRoot.hidden = true;
          subquestionRoot.innerHTML = '';
        } else {
          subquestionRoot.hidden = false;
          subquestionRoot.innerHTML = activeEx.parts
            .map((p) => {
              const isAct = p.partKey === activePart.partKey;
              const cnt = inUnsubmittedExam ? p.answeredCount : p.completedCount;
              return `<button type="button" data-sub="${escapeHtml(p.partKey)}" data-sub-item="${escapeHtml(activeEx.itemId)}" aria-pressed="${isAct}">${escapeHtml(p.label)} (${cnt}/${p.stepIds.length})</button>`;
            })
            .join('');
          bindMockChildrenIfNeeded(subquestionRoot, subquestionRoot.onclick);
        }
      }
    }

    function destroy() {
      if (paperRoot) paperRoot.onclick = null;
      if (sheetHeaderRoot) sheetHeaderRoot.onclick = null;
      if (subquestionRoot) subquestionRoot.onclick = null;
      mounted = false;
    }

    mount();

    return {
      render,
      destroy,
      getListenerMountCount: () => listenerMountCount,
    };
  }

  return {
    createPaperSheetModule,
    formatPartLabel,
    getOrderedPartEntries,
    resolvePartForStep,
  };
});
