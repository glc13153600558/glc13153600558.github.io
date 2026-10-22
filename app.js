"use strict";

const PARAMS = {
  t2: { min: 10, max: 140, step: 1, initial: 75 },
  fat: { min: 0, max: 40, step: 0.5, initial: 6 },
  height: { min: 10, max: 100, step: 1, initial: 65 },
  age: { min: 18, max: 90, step: 1, initial: 45 },
  muscleFat: { min: 0, max: 100, step: 1, initial: 15 },
};

const EXAMPLES = {
  healthy: { t2: 110, fat: 3, height: 80, age: 25, muscleFat: 5 },
  moderate: { t2: 70, fat: 9, height: 55, age: 48, muscleFat: 22 },
  severe: { t2: 35, fat: 20, height: 28, age: 68, muscleFat: 55 },
};

const GRADE_ORDER = ["I", "II", "III", "IV", "V"];
const GRADE_MAP = [
  ["I", "髓核信号均匀（高），椎间隙正常"],
  ["I-II", "信号轻度不均，结构完整"],
  ["II", "信号不均但髓核-纤维环分界清晰，高度正常"],
  ["III", "信号不均、灰色，高度轻度丢失"],
  ["IV", "信号低/黑，高度中度丢失"],
  ["V", "椎间隙塌陷，信号极低"],
];

// 与原 app.py 中的演示规则保持一致；这些阈值不代表临床模型。
function predictDiscGrade({ t2, fat, height, age }) {
  let score = 0;
  if (t2 < 40) score += 3;
  else if (t2 < 60) score += 2;
  else if (t2 < 80) score += 1;

  if (height < 30) score += 2;
  else if (height < 50) score += 1;

  if (fat > 15) score += 2;
  else if (fat > 8) score += 1;

  if (age > 60) score += 1;
  else if (age > 40) score += 0.5;

  const index = Math.min(Math.trunc(score), 5);
  const [grade, description] = GRADE_MAP[index];
  const confidence = Object.fromEntries(GRADE_ORDER.map((item) => [item, 0]));
  const base = Math.max(0.15, 1 - Math.abs(score - index) * 0.1);
  confidence[GRADE_ORDER[Math.min(index, 4)]] = Math.round(base * 100) / 100;
  return { grade, description, confidence, score };
}

function predictMuscleGrade(muscleFat) {
  if (muscleFat < 10) return { grade: "0", description: "正常，无肉眼可见脂肪" };
  if (muscleFat < 25) return { grade: "1", description: "少量脂肪条纹" };
  if (muscleFat < 50) return { grade: "2", description: "脂肪明显但肌肉多于脂肪" };
  if (muscleFat < 75) return { grade: "3", description: "脂肪与肌肉各半" };
  return { grade: "4", description: "脂肪多于肌肉，重度退变" };
}

function clampToStep(value, { min, max, step, initial }) {
  if (!Number.isFinite(value)) return initial;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round((clamped - min) / step) * step + min;
}

function setParameter(name, value) {
  const parsed = String(value).trim() === "" ? NaN : Number(value);
  const normalized = clampToStep(parsed, PARAMS[name]);
  const range = document.getElementById(`${name}-range`);
  const number = document.getElementById(`${name}-number`);
  range.value = String(normalized);
  number.value = String(normalized);
  const { min, max } = PARAMS[name];
  range.style.setProperty("--fill", `${((normalized - min) / (max - min)) * 100}%`);
}

function getValues() {
  return Object.fromEntries(
    Object.keys(PARAMS).map((name) => [name, Number(document.getElementById(`${name}-number`).value)])
  );
}

function renderConfidence(confidence) {
  const ordered = GRADE_ORDER.slice().sort(
    (a, b) => confidence[b] - confidence[a] || GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b)
  );
  const container = document.getElementById("confidence-list");
  container.replaceChildren();
  for (const [index, grade] of ordered.entries()) {
    const percent = Math.round(confidence[grade] * 100);
    const row = document.createElement("div");
    row.className = `confidence-row${index === 0 ? " is-leading" : ""}`;
    const name = document.createElement("span");
    name.className = "confidence-name";
    name.textContent = grade;
    const track = document.createElement("span");
    track.className = "confidence-track";
    track.setAttribute("role", "meter");
    track.setAttribute("aria-label", `${grade} 置信度`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(percent));
    const fill = document.createElement("span");
    fill.className = "confidence-fill";
    fill.style.width = `${percent}%`;
    track.append(fill);
    const percentage = document.createElement("span");
    percentage.className = "confidence-percent";
    percentage.textContent = `${percent}%`;
    row.append(name, track, percentage);
    container.append(row);
  }
  document.getElementById("primary-grade").textContent = ordered[0];
}

function renderPrediction() {
  const values = getValues();
  const disc = predictDiscGrade(values);
  const muscle = predictMuscleGrade(values.muscleFat);
  renderConfidence(disc.confidence);
  document.getElementById("report-grade").textContent = disc.grade;
  document.getElementById("report-score").textContent = disc.score.toFixed(1);
  document.getElementById("report-description").textContent = disc.description;
  document.getElementById("muscle-grade").textContent = muscle.grade;
  document.getElementById("muscle-description").textContent = muscle.description;
  document.getElementById("trend").textContent =
    Math.trunc(disc.score) >= 3 && ["2", "3", "4"].includes(muscle.grade)
      ? "⚠️ 两者均提示退变，建议关注共退变分析"
      : "目前参数未同时提示明显退变";
  document.getElementById("form-status").textContent = "结果已根据当前参数更新";
}

function initializePage() {
  for (const [name, settings] of Object.entries(PARAMS)) {
    const range = document.getElementById(`${name}-range`);
    const number = document.getElementById(`${name}-number`);
    const reset = document.querySelector(`[data-parameter="${name}"] .reset-button`);
    setParameter(name, settings.initial);
    range.addEventListener("input", () => {
      setParameter(name, range.value);
      document.getElementById("form-status").textContent = "参数已修改，点击按钮更新结果";
    });
    number.addEventListener("change", () => {
      setParameter(name, number.value);
      document.getElementById("form-status").textContent = "参数已修改，点击按钮更新结果";
    });
    reset.addEventListener("click", () => {
      setParameter(name, settings.initial);
      document.getElementById("form-status").textContent = "参数已修改，点击按钮更新结果";
    });
  }

  document.getElementById("assessment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelectorAll(".example-card").forEach((button) => button.classList.remove("active"));
    renderPrediction();
  });

  document.querySelectorAll(".example-card").forEach((button) => {
    button.addEventListener("click", () => {
      for (const [name, value] of Object.entries(EXAMPLES[button.dataset.example])) setParameter(name, value);
      document.querySelectorAll(".example-card").forEach((item) => item.classList.toggle("active", item === button));
      document.getElementById("form-status").textContent = "示例参数已填入，点击按钮更新结果";
    });
  });

  renderPrediction();
  document.getElementById("form-status").textContent = "";
}

if (typeof document !== "undefined") initializePage();
