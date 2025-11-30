// ======================
// app.js
// ======================

const fileInput = document.getElementById("audioInput");
const uploadBtn = document.getElementById("uploadBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const generateCoversBtn = document.getElementById("generateCoversBtn");
const fileInfo = document.getElementById("fileInfo");
const uploadStatus = document.getElementById("uploadStatus");
const analysisResult = document.getElementById("analysisResult");

// ======================
// Upload Audio
// ======================
uploadBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return alert("בחר קובץ אודיו");
  if (file.size > 20 * 1024 * 1024)
    return alert("קובץ גדול מדי! (מקסימום 20MB)");

  fileInfo.textContent = `שם קובץ: ${file.name}`;
  const audio = document.createElement("audio");
  audio.src = URL.createObjectURL(file);
  audio.addEventListener("loadedmetadata", () => {
    fileInfo.textContent += ` | משך: ${audio.duration.toFixed(2)} שניות`;
  });

  const formData = new FormData();
  formData.append("audio", file);

  uploadStatus.textContent = "⏳ מעלה קובץ...";
  try {
    const res = await fetch("/analyze", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok && data.success) {
      uploadStatus.textContent = "✔ הקובץ הועלה בהצלחה!";
    } else {
      uploadStatus.textContent = `❌ שגיאה בהעלאה: ${
        data.error || data.message || "server error"
      }`;
      console.error("Upload error details:", data);
    }
  } catch {
    uploadStatus.textContent = "❌ שגיאה בשרת";
  }
});

// ======================
// Analyze Audio
// ======================
analyzeBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return alert("קודם העלה קובץ אודיו");

  const formData = new FormData();
  formData.append("audio", file);

  analysisResult.innerHTML = "⏳ מנתח אודיו...";
  try {
    const res = await fetch("/analyze", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) {
      analysisResult.innerHTML = `❌ שגיאה בניתוח: ${
        data.error || data.details || "server error"
      }`;
      console.error("Analyze error details:", data);
      return;
    }
    window.lastAnalysis = data.analysis;
    const a = data.analysis;
    analysisResult.innerHTML = `
            <h3>תוצאות הניתוח:</h3>
            <p><b>תוכן:</b> ${a.topic}</p>
            <p><b>מצב רוח:</b> ${a.mood}</p>
            <p><b>ז'אנר:</b> ${a.genre}</p>
            <p><b>קהל יעד:</b> ${a.audience}</p>
            <p><b>מילות מפתח:</b> ${a.keywords.join(", ")}</p>
        `;
  } catch {
    analysisResult.innerHTML = "❌ שגיאה בשרת";
  }
});

// ======================
// Generate Cover Images
// ======================
function displayCovers(covers) {
  const coverGrid = document.getElementById("coverGrid");
  coverGrid.innerHTML = "";
  covers.forEach((c) => {
    const div = document.createElement("div");
    div.className = "cover-item";
    div.innerHTML = `<img src="data:image/png;base64,${c.image}" alt="${c.title}"><button class="download-btn">הורד</button>`;
    div.addEventListener("click", () => {
      document
        .querySelectorAll(".cover-item")
        .forEach((el) => el.classList.remove("selected"));
      div.classList.add("selected");
    });
    div.querySelector(".download-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${c.image}`;
      link.download = `${c.title}.png`;
      link.click();
    });
    coverGrid.appendChild(div);
  });
}

generateCoversBtn.addEventListener("click", async () => {
  if (!window.lastAnalysis) return alert("קודם עליך לנתח את האודיו");
  analysisResult.innerHTML += "<p>⏳ מייצר תמונות Cover...</p>";

  try {
    const res = await fetch("/generate-covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(window.lastAnalysis),
    });
    const data = await res.json();
    if (!data.success) {
      analysisResult.innerHTML += "<p>❌ שגיאה ביצירת תמונות</p>";
      return;
    }
    window.generatedCovers = data.covers;
    displayCovers(data.covers);
  } catch {
    analysisResult.innerHTML += "<p>❌ שגיאה בשרת</p>";
  }
});

// ======================
// Download all as ZIP
// ======================
document
  .getElementById("downloadAllBtn")
  .addEventListener("click", async () => {
    if (!window.generatedCovers) return alert("אין תמונות להורדה");
    const JSZip = await import(
      "https://cdn.jsdelivr.net/npm/jszip@3.10.0/dist/jszip.min.js"
    );
    const zip = new JSZip.default();
    window.generatedCovers.forEach((c) => {
      const byteCharacters = atob(c.image);
      const byteNumbers = Array.from(byteCharacters, (ch) => ch.charCodeAt(0));
      const byteArray = new Uint8Array(byteNumbers);
      zip.file(`${c.title}.png`, byteArray);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "covers.zip";
    link.click();
  });
