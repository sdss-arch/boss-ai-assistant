/* BOSS 在线简历的 DOM 适配：读取、定位编辑框、回填；不提交网页表单。 */
(() => {
  const compact = value => String(value || "").replace(/\s+/g, "").trim();
  const visible = node => !!node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  const labels = ["个人优势", "工作经历", "实习经历", "项目经历", "专业技能", "在校经历", "社团/组织经历"];
  let sections = new Map(), lastFill = null;
  const onPage = () => location.hostname.endsWith("zhipin.com") && /^\/web\/geek\/resume\/?$/.test(location.pathname);
  function text(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("button,input,select,textarea,script,style,.op,.operate,.item-operate,[role=button]").forEach(item => item.remove());
    clone.querySelectorAll("br").forEach(item => item.replaceWith("\n"));
    return (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function scan() {
    if (!onPage()) throw new Error("请先打开 BOSS 个人中心的在线简历页面");
    const boundaryLabels = [...labels, "个人信息", "期望职位", "期望岗位", "教育经历", "资格证书", "自定义添加", "志愿者经历"];
    const labelOf = node => {
      const value = compact(text(node));
      return boundaryLabels.find(label => value === label || (value.startsWith(label) && /^(编辑|添加|新增|\+|＋)*$/.test(value.slice(label.length))));
    };
    let headings = [...document.querySelectorAll("h2,h3,h4,[role=heading],.title,.resume-item-title,.item-title,.section-title")].filter(node => labelOf(node) && !node.closest("nav,aside,.resume-menu,.resume-nav"));
    headings = headings.filter(node => !headings.some(other => other !== node && node.contains(other)));
    const found = [], seen = new Set();
    for (let n = 0; n < headings.length; n++) {
      const heading = headings[n], label = labelOf(heading), next = headings[n + 1];
      if (!labels.includes(label)) continue;
      const range = document.createRange(); range.setStartAfter(heading);
      if (next) range.setEndBefore(next);
      else { const parent = heading.parentElement; range.setEnd(parent, parent.childNodes.length); }
      let descriptions = [...document.querySelectorAll('[class*="desc"],[class*="content"],[class*="text"],[data-resume-description]')].filter(node => visible(node) && range.intersectsNode(node) && !node.contains(heading) && (!next || !node.contains(next)) && compact(text(node)).length >= 15);
      descriptions = descriptions.filter(node => !descriptions.some(other => other !== node && node.contains(other)));
      const rangeText = () => {
        const fragment = range.cloneContents();
        fragment.querySelectorAll("button,input,select,textarea,script,style,.op,.operate,[role=button]").forEach(node => node.remove());
        fragment.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
        return (fragment.textContent || "").trim();
      };
      const entries = descriptions.map(description => ({ description, getOriginal: () => text(description) }));
      if (!entries.length && ["个人优势", "专业技能"].includes(label)) entries.push({ description: heading, getOriginal: rangeText, fromRange: true });
      for (const entry of entries) {
        const original = entry.getOriginal().replace(/^\s*(工作内容|工作职责|项目描述|项目职责|项目内容|内容)\s*[:：]\s*/, "");
        if (compact(original).length < 15 || seen.has(compact(original))) continue;
        seen.add(compact(original));
        let root = entry.description.parentElement;
        while (root?.parentElement && root.parentElement !== document.body && !headings.some(other => other !== heading && root.parentElement.contains(other))) root = root.parentElement;
        const index = found.filter(item => item.section === label).length;
        const titleNode = root?.querySelector(".company-name,.project-name,.item-title,h4");
        const title = titleNode && !headings.includes(titleNode) ? text(titleNode).slice(0, 60) : "";
        found.push({ id: label + ":" + index, section: label, label: label + (index ? " " + (index + 1) : "") + " · " + (title || original.replace(/\s+/g, " ").slice(0, 32)), original, root, ...entry });
      }
    }
    return found;
  }
  function read() {
    const found = scan(); sections = new Map(found.map(item => [item.id, item]));
    return { ok: true, url: location.href, sections: found.map(({ id, section, label, original }) => ({ id, section, label, original })) };
  }
  function matchedRange(value, original) {
    const source = String(value || ""), positions = []; let normalized = "";
    for (let i = 0; i < source.length; i++) if (!/\s/.test(source[i])) { normalized += source[i]; positions.push(i); }
    const needle = compact(original), index = normalized.indexOf(needle);
    if (!needle || index < 0 || normalized.indexOf(needle, index + 1) >= 0) return null;
    return { start: positions[index], end: positions[index + needle.length - 1] + 1 };
  }
  function editorFor(original) {
    return [...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(visible).filter(field => matchedRange(field.value ?? field.innerText, original));
  }
  function editContainer(field) {
    let parent = field.parentElement;
    for (let depth = 0; parent && parent !== document.body && depth < 7; depth++, parent = parent.parentElement) {
      const save = [...parent.querySelectorAll('button,[role="button"],input[type="submit"]')].filter(visible).some(button => /^(保存|完成|确定|确认保存)$/.test(compact(button.innerText || button.value)));
      if (save) return parent;
    }
    return null;
  }
  function setValue(field, value) {
    if (Number(field.maxLength) > 0 && value.length > field.maxLength) throw new Error("草稿超出网页字数限制（" + field.maxLength + " 字），请先缩短");
    if (field instanceof HTMLTextAreaElement) Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, value);
    else field.innerText = value;
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    if (compact(field.value ?? field.innerText) !== compact(value)) throw new Error("网页未接受回填，请重新读取后再试");
    field.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  async function fill(request) {
    if (!onPage()) throw new Error("网页已离开在线简历，请重新打开后再回填");
    const item = sections.get(request.id), draft = String(request.text || "").trim();
    if (!item || item.original !== request.original || !draft) throw new Error("简历段落已变化，请重新读取并核对草稿");
    const ownEditor = lastFill?.id === item.id && lastFill.field.isConnected && compact(lastFill.field.value ?? lastFill.field.innerText) === compact(lastFill.draft) ? lastFill : null;
    if (!ownEditor && !item.fromRange && item.description.isConnected && visible(item.description) && !compact(item.getOriginal()).includes(compact(item.original))) throw new Error("网页原文已变化，请重新读取，避免覆盖新的内容");
    let fields = ownEditor ? [ownEditor.field] : editorFor(item.original);
    if (!fields.length) {
      if (!item.description.isConnected || !compact(item.getOriginal()).includes(compact(item.original))) throw new Error("网页原文已变化，请重新读取，避免覆盖新的内容");
      const buttons = [...item.root.querySelectorAll('button,a,span,[role="button"],i')].filter(node => compact(node.textContent) === "编辑" || /编辑/.test(node.getAttribute("aria-label") || node.title || "") || /(?:^|\s)(?:edit|icon-edit)(?:\s|$)/.test(node.className || ""));
      const unique = buttons.filter(node => !buttons.some(other => other !== node && node.contains(other)));
      if (unique.length === 1) unique[0].click();
      else if (!unique.length && !item.fromRange && !item.description.closest("a,button") && visible(item.description)) item.description.click();
      for (let i = 0; i < 20; i++) { fields = editorFor(item.original); if (fields.length) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    if (fields.length !== 1) throw new Error("未能唯一定位这段的编辑框。请在 BOSS 网页点击该段「编辑」，再回填；不会改写其他字段。");
    const field = fields[0];
    if (!editContainer(field)) throw new Error("未找到独立的保存/完成按钮，无法确认页面是否自动提交，已停止回填");
    const before = ownEditor ? ownEditor.original : String(field.value ?? field.innerText), range = matchedRange(before, item.original);
    if (!range) throw new Error("编辑框原文已经变化，未覆盖当前内容");
    const after = before.slice(0, range.start) + draft + before.slice(range.end);
    setValue(field, after); lastFill = { id: item.id, field, original: before, draft: after };
    return { ok: true, filled: true, submitted: false, original: before };
  }
  function restore() {
    if (!onPage() || !lastFill?.field.isConnected) throw new Error("原编辑框已关闭；原文仍在助手对照框和本地备份中");
    if (compact(lastFill.field.value ?? lastFill.field.innerText) !== compact(lastFill.draft)) throw new Error("编辑框已有人工修改，请自行核对，未覆盖内容");
    setValue(lastFill.field, lastFill.original); lastFill = null;
    return { ok: true, submitted: false };
  }
  window.BossOnlineResume = { read, fill, restore };
})();
