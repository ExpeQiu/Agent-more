(() => {
  const $ = (sel) => document.querySelector(sel);
  const out = $("#out");
  const statusEl = $("#status");
  const meta = $("#meta");
  const goalEl = $("#goal");
  const packEl = $("#pack");
  const kbEl = $("#kb");

  let mode = "auto";
  let tab = "delivery";
  let current = null;
  let runsCache = [];

  const MODE_FLOWS = {
    auto: {
      title: "auto · 选型后进入对应模式",
      blurb: "不预先锁定编排；由选型器按目标特征挑一种模式，再按该模式的流转执行。",
      steps: [
        { label: "目标输入", detail: "用户给出 goal / 议题" },
        { label: "模式选型", detail: "开放需冲突 → 圆桌；需统一叙事 → Consult；可拆并行 → Swarm" },
        { label: "进入子模式", detail: "沿用所选模式的协调者与信息流" },
        { label: "唯一交付", detail: "对用户只输出一份 delivery + 全量轨迹" },
      ],
      rule: "嵌套时仍只保留一层协调者对用户负责。",
    },
    roundtable: {
      title: "圆桌 · 辩论交锋后融合",
      blurb: "主持人控场；多角色共享会话、串行发言；冲突暴露盲区后收束方案。",
      steps: [
        { label: "开场", detail: "主持人定议题、立规则" },
        { label: "轮询发言", detail: "Pack 角色按对立视角串行发声（多轮可选）" },
        { label: "升维冲突", detail: "主持人推动对立交锋，防跑题" },
        { label: "收束交付", detail: "主持人综合共识与分歧 → 唯一 delivery" },
      ],
      rule: "上下文共享全场对话；价值在观点质量，不在并行加速。",
    },
    consult: {
      title: "Consult · 主控调用专家工具箱",
      blurb: "主控是 Owner；专家按需 Consult，输出回主控综合，不对用户抢场。",
      steps: [
        { label: "主控接单", detail: "持有全局目标与用户对话权" },
        { label: "按需咨询", detail: "依 Pack 专家链（可裁剪）串行调用 Input→Output" },
        { label: "主控综合", detail: "专家结论内化，统一口吻与策略" },
        { label: "唯一交付", detail: "主控输出 delivery；专家过程写入轨迹" },
      ],
      rule: "专家是工具不是平等发言人；禁止把原始专家回复原样甩给用户。",
    },
    swarm: {
      title: "Swarm · 分解并行再聚合",
      blurb: "Orchestrator 拆任务；子 Agent 独立执行；Rollup 聚合成端到端交付。",
      steps: [
        { label: "任务分解", detail: "Orchestrator 切成弱依赖子任务" },
        { label: "上下文分片", detail: "子 Agent 只拿局部输入，互不共享可变状态" },
        { label: "并行执行", detail: "多路同时跑，以最慢子路径衡量关键路径" },
        { label: "Rollup 交付", detail: "Orchestrator 聚合精炼结论 → 唯一 delivery" },
      ],
      rule: "子任务独立完成、独立交付；禁止强依赖链硬并行。",
    },
  };

  function renderFlow(selected) {
    const flowEl = $("#flow");
    const data = MODE_FLOWS[selected] || MODE_FLOWS.auto;
    flowEl.innerHTML = `
      <p class="flow-title">${data.title}</p>
      <p class="flow-blurb">${data.blurb}</p>
      <ol class="flow-steps">
        ${data.steps
          .map(
            (s, i) => `
          <li>
            <span class="flow-idx">${i + 1}</span>
            <div>
              <strong>${s.label}</strong>
              <span class="flow-detail">${s.detail}</span>
            </div>
          </li>`
          )
          .join("")}
      </ol>
      <p class="flow-rule">${data.rule}</p>
    `;
  }

  document.querySelectorAll(".mode").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll(".mode").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderFlow(mode);
    });
  });

  renderFlow(mode);
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach((b) => {
        b.setAttribute("aria-selected", String(b === btn));
      });
      render();
    });
  });

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? ` ${kind}` : "");
  }

  function renderMeta(env) {
    if (!env) {
      meta.innerHTML = "";
      return;
    }
    const pills = [
      env.run_id,
      env.mode,
      env.coordinator,
      env.data_source ? `kb:${env.data_source}` : null,
      env.meta?.llm_mode ? `llm:${env.meta.llm_mode}` : null,
      env.status || "completed",
    ].filter(Boolean);
    meta.innerHTML = pills.map((p) => `<span class="pill">${escapeHtml(String(p))}</span>`).join("");
  }

  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function render() {
    if (tab === "runs") {
      if (!runsCache.length) {
        out.textContent = "暂无历史 run。";
        return;
      }
      out.innerHTML = "";
      const ul = document.createElement("ul");
      ul.className = "run-list";
      runsCache.forEach((r) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.innerHTML = `<strong>${escapeHtml(r.id)}</strong><span class="sub">${escapeHtml(
          `${r.mode} · ${r.status} · ${r.title || ""}`
        )}</span>`;
        b.addEventListener("click", () => openRun(r.id));
        li.appendChild(b);
        ul.appendChild(li);
      });
      out.appendChild(ul);
      return;
    }

    if (!current) {
      out.textContent = "选择模式并输入目标，或从历史中打开一次 run。";
      renderMeta(null);
      return;
    }

    renderMeta(current.envelope || current);
    if (tab === "delivery") {
      out.textContent =
        (current.delivery ||
          current.envelope?.delivery?.body_markdown ||
          "") || "(空交付)";
    } else if (tab === "trajectory") {
      out.textContent = current.trajectory || "(无轨迹)";
    } else if (tab === "json") {
      out.textContent = JSON.stringify(current.envelope || current, null, 2);
    }
  }

  async function refreshRuns() {
    const res = await fetch("/api/runs");
    if (!res.ok) throw new Error(`加载列表失败 ${res.status}`);
    const data = await res.json();
    runsCache = data.items || [];
  }

  async function openRun(runId) {
    setStatus(`加载 ${runId}…`);
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (!res.ok) {
      setStatus(`打开失败 ${res.status}`, "error");
      return;
    }
    current = await res.json();
    tab = "delivery";
    document.querySelectorAll(".tab").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.tab === "delivery"));
    });
    setStatus(`已打开 ${runId}`, "ok");
    render();
  }

  async function runOnce() {
    const goal = goalEl.value.trim();
    if (!goal) {
      setStatus("请填写目标 / 议题", "error");
      return;
    }
    const btn = $("#btn-run");
    btn.disabled = true;
    setStatus("运行中…");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          mode,
          pack: packEl.value,
          knowledge_base: kbEl.value || "none",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || `失败 ${res.status}`, "error");
        return;
      }
      current = data;
      tab = "delivery";
      document.querySelectorAll(".tab").forEach((b) => {
        b.setAttribute("aria-selected", String(b.dataset.tab === "delivery"));
      });
      await refreshRuns();
      setStatus(`完成 · ${data.envelope?.run_id || ""}`, "ok");
      render();
    } catch (err) {
      setStatus(String(err.message || err), "error");
    } finally {
      btn.disabled = false;
    }
  }

  $("#btn-run").addEventListener("click", runOnce);
  $("#btn-refresh").addEventListener("click", async () => {
    try {
      await refreshRuns();
      tab = "runs";
      document.querySelectorAll(".tab").forEach((b) => {
        b.setAttribute("aria-selected", String(b.dataset.tab === "runs"));
      });
      setStatus(`已刷新 ${runsCache.length} 条`, "ok");
      render();
    } catch (err) {
      setStatus(String(err.message || err), "error");
    }
  });

  async function loadPacks() {
    const res = await fetch("/api/packs");
    if (!res.ok) throw new Error(`加载 Pack 失败 ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    packEl.innerHTML = "";
    if (!items.length) {
      const opt = document.createElement("option");
      opt.value = "nev-tech";
      opt.textContent = "nev-tech";
      packEl.appendChild(opt);
      return;
    }
    items.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name ? `${p.id} · ${p.name}` : p.id;
      if (i === 0) opt.selected = true;
      packEl.appendChild(opt);
    });
  }

  async function loadKnowledgeBases() {
    const res = await fetch("/api/knowledge-bases");
    if (!res.ok) throw new Error(`加载知识库失败 ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    kbEl.innerHTML = "";
    if (!items.length) {
      const opt = document.createElement("option");
      opt.value = "none";
      opt.textContent = "不绑定";
      kbEl.appendChild(opt);
      return;
    }
    items.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k.id;
      const mark = k.id !== "none" && k.path_ok === false ? "（路径不可用）" : "";
      opt.textContent = k.name ? `${k.name}${mark}` : k.id;
      if (k.id === "tpd-rag-wiki") opt.selected = true;
      kbEl.appendChild(opt);
    });
    if (![...kbEl.options].some((o) => o.selected)) {
      kbEl.selectedIndex = 0;
    }
  }

  goalEl.value = "半固态电池如何包装成抖音脚本";
  Promise.all([refreshRuns(), loadPacks(), loadKnowledgeBases()])
    .then(() => {
      setStatus(`历史 ${runsCache.length} 条`);
    })
    .catch((err) => setStatus(String(err.message || err), "error"));
})();
