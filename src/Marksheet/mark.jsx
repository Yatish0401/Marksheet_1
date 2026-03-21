import { useState, useRef, useCallback } from "react";

const CLOUD_NAME = "ddiopuxcr";
const UPLOAD_PRESET = "Marksheet";
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
const TOTAL_STORAGE = 25 * 1024 * 1024 * 1024;
const ALERT_THRESHOLD = 24.5 * 1024 * 1024 * 1024;
const API_BASE = import.meta.env.VITE_API_URL || "https://marksheet-1-qy4u.onrender.com";

const Mark = () => {
  const [pdfs, setPdfs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("marksheet_meta") || "[]"); }
    catch { return []; }
  });
  const [storageUsed, setStorageUsed] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("marksheet_meta") || "[]");
      return stored.reduce((acc, p) => acc + (p.size || 0), 0);
    } catch { return 0; }
  });
  const [form, setForm] = useState({ studentName: "", className: "", board: "" });
  const [pendingFiles, setPendingFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState(1);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [progressFiles, setProgressFiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const fileInputRef = useRef();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };
  const handleFormChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const usedPercent = Math.min((storageUsed / TOTAL_STORAGE) * 100, 100);
  const isNearFull = storageUsed >= ALERT_THRESHOLD;
  const isWarning = storageUsed >= TOTAL_STORAGE * 0.75 && !isNearFull;
  const barColor = isNearFull
    ? "linear-gradient(90deg,#ef4444,#dc2626)"
    : isWarning
    ? "linear-gradient(90deg,#f97316,#ea580c)"
    : "linear-gradient(90deg,#a78bfa,#e0d7ff)";

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const handleNextStep = () => {
    if (!form.studentName.trim()) { showToast("Please enter student name!"); return; }
    if (!form.className.trim()) { showToast("Please enter class!"); return; }
    if (!form.board.trim()) { showToast("Please select board!"); return; }
    setUploadStatus("idle"); setPendingFiles([]); setStep(2);
  };

  const handleFiles = (files) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploadStatus("idle");
    setPendingFiles((prev) => {
      const existingNames = prev.map(f => f.name);
      return [...prev, ...fileArray.filter(f => !existingNames.includes(f.name))];
    });
  };

  const removeFile = (index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index));

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files);
  }, []);

 const uploadFiles = async () => {
  if (pendingFiles.length === 0) { showToast("Please select at least one file!"); return; }
  if (storageUsed >= ALERT_THRESHOLD) {
    showToast("🚫 Storage is full! Please delete some files before uploading.");
    return;
  }
    setUploadStatus("uploading");
    setProgress(0);
    setProgressFiles([...pendingFiles]);
    const results = [];

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      setCurrentFile(file.name);
      setProgress(Math.round((i / pendingFiles.length) * 100));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("tags", [form.studentName.replace(/,/g,""), form.className.replace(/,/g,""), form.board.replace(/,/g,"")].join(","));
        formData.append("context", `student=${form.studentName}|class=${form.className}|board=${form.board}|origName=${file.name}`);
        const res = await fetch(UPLOAD_URL, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
        const data = await res.json();
        results.push({
          id: data.public_id, name: form.studentName, className: form.className,
          board: form.board, originalName: file.name, size: data.bytes || file.size,
          date: Date.now(), url: data.secure_url, publicId: data.public_id,
          resourceType: data.resource_type, format: data.format,
        });
      } catch (err) { showToast(`❌ Failed: ${file.name}`); }
      setProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
      await new Promise(r => setTimeout(r, 200));
    }

    const stored = JSON.parse(localStorage.getItem("marksheet_meta") || "[]");
    const updated = [...results, ...stored];
    localStorage.setItem("marksheet_meta", JSON.stringify(updated));
    setPdfs(updated);
    setStorageUsed(updated.reduce((acc, p) => acc + (p.size || 0), 0));
    setSavedCount(results.length);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadStatus("done");
    setProgress(100);
    setCurrentFile("Done!");
  };

  const handleSubmit = () => {
    showToast(`✓ ${savedCount} file(s) saved!`);
    setUploadStatus("idle"); setProgress(0); setProgressFiles([]);
    setSavedCount(0); setForm({ studentName: "", className: "", board: "" });
    setPendingFiles([]); setStep(1);
  };

  const handleAddMore = () => {
    setUploadStatus("idle"); setProgress(0); setProgressFiles([]);
    if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); }
  };

  // ── Cloudinary delete ────────────────────────────────────────
  const deleteFromCloudinary = async (ids) => {
  const items = pdfs.filter(p => ids.includes(p.id));

  if (ids.length === 1) {
    const item = items[0];
    const resourceType = item.resourceType || "image";
    // ✅ Use full URL instead of /api/...
   const res = await fetch(
  `${API_BASE}/api/delete?publicId=${encodeURIComponent(item.publicId)}&resourceType=${resourceType}`,
  { method: "DELETE" }
);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Delete failed");
  } else {
    const byType = {};
    items.forEach(item => {
      const rt = item.resourceType || "image";
      if (!byType[rt]) byType[rt] = [];
      byType[rt].push(item.publicId);
    });
    for (const [resourceType, publicIds] of Object.entries(byType)) {
      // ✅ Use full URL instead of /api/...
     const res = await fetch(`${API_BASE}/api/delete-many`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIds, resourceType }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Bulk delete failed");
    }
  }
};

  const doDelete = async (ids) => {
    try {
      showToast("🗑️ Deleting from Database...");
      await deleteFromCloudinary(ids);
      const updated = pdfs.filter((x) => !ids.includes(x.id));
      setPdfs(updated);
      localStorage.setItem("marksheet_meta", JSON.stringify(updated));
      setStorageUsed(updated.reduce((acc, p) => acc + (p.size || 0), 0));
      if (viewingPdf && ids.includes(viewingPdf.id)) setViewingPdf(null);
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
      showToast(`✅ ${ids.length} file${ids.length > 1 ? "s" : ""} deleted from Database!`);
    } catch (err) {
      showToast(`❌ Delete failed: ${err.message}`);
    }
  };

  const deletePDF = (p) => setConfirmAction({ type: "delete", ids: [p.id], label: `"${p.originalName}"` });
  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    setConfirmAction({ type: "delete", ids: [...selectedIds], label: `${selectedIds.length} selected file${selectedIds.length > 1 ? "s" : ""}` });
  };
  const deleteAll = () => setConfirmAction({ type: "delete", ids: pdfs.map(p => p.id), label: `all ${pdfs.length} files` });

  const confirmAction_execute = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "download") {
      const toDownload = pdfs.filter(p => confirmAction.ids.includes(p.id));
      toDownload.forEach((p, i) => setTimeout(() => downloadFile(p), i * 400));
      showToast(`⬇️ Downloading ${toDownload.length} file${toDownload.length > 1 ? "s" : ""}...`);
      setConfirmAction(null);
    } else {
      setConfirmAction(null);
      await doDelete(confirmAction.ids);
      if (confirmAction.ids.length > 1) { setSelectMode(false); setSelectedIds([]); }
    }
  };

  const downloadFile = async (p) => {
    try {
      const response = await fetch(p.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl; link.download = p.originalName || p.name;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      const link = document.createElement("a");
      link.href = p.url; link.target = "_blank"; link.download = p.originalName || p.name; link.click();
    }
  };

  const downloadSelected = () => {
    const toDownload = pdfs.filter(p => selectedIds.includes(p.id));
    if (toDownload.length === 0) return;
    setConfirmAction({ type: "download", ids: toDownload.map(p => p.id), label: `${toDownload.length} selected file${toDownload.length > 1 ? "s" : ""}` });
  };

  const downloadAll = () => {
    if (pdfs.length === 0) return;
    setConfirmAction({ type: "download", ids: pdfs.map(p => p.id), label: `all ${pdfs.length} files` });
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(p => p.id));
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds([]); };

  const getFileIconByName = (name) => {
    if (!name) return "📄";
    const ext = name.split(".").pop().toLowerCase();
    if (["jpg","jpeg","png","gif","bmp","webp"].includes(ext)) return "🖼️";
    if (ext === "pdf") return "📄";
    if (ext === "txt") return "📝";
    if (["doc","docx"].includes(ext)) return "📃";
    return "📁";
  };

  const renderViewer = (p) => {
    const ext = (p.originalName || "").split(".").pop().toLowerCase();
    if (["jpg","jpeg","png","gif","bmp","webp"].includes(ext))
      return <img src={p.url} style={{ width:"100%", maxHeight:"60vw", objectFit:"contain", background:"#f8fafc", display:"block" }} alt={p.name} />;
    if (ext === "pdf")
      return <iframe src={p.url} style={styles.iframe} title={p.name} />;
    return (
      <div style={{ padding:"2rem", textAlign:"center", color:"#64748b" }}>
        <div style={{ fontSize:"40px", marginBottom:"12px" }}>📁</div>
        <p style={{ fontSize:"13px", marginBottom:"16px" }}>Preview not available.</p>
        <button onClick={() => downloadFile(p)} style={styles.btnDownloadLarge}>⬇ Download</button>
      </div>
    );
  };

  const filtered = pdfs.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.className?.toLowerCase().includes(search.toLowerCase()) ||
    p.board?.toLowerCase().includes(search.toLowerCase())
  );

  const getInitials = (name) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const totalSize = pendingFiles.reduce((acc, f) => acc + f.size, 0);
  const isIdle = uploadStatus === "idle";
  const isUploading = uploadStatus === "uploading";
  const isDone = uploadStatus === "done";
  const allFilteredSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulseBg { 0%,100%{opacity:1} 50%{opacity:0.75} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:scale(1)} }
        * { box-sizing: border-box; }
        @media (max-width: 600px) {
          .mh { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; padding: 0.85rem 1rem !important; }
          .mh-right { align-items: flex-start !important; width: 100% !important; }
          .storage-bar-track { width: 100% !important; }
          .storage-bar-wrap { width: 100% !important; }
          .body-wrap { padding: 1rem !important; }
          .form-grid { grid-template-columns: 1fr !important; }
          .summary-grid { grid-template-columns: 1fr !important; }
          .summary-item { padding: 10px !important; }
          .summary-val { font-size: 14px !important; }
          .step-label { display: none !important; }
          .toolbar { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .toolbar-right { flex-wrap: wrap !important; width: 100% !important; }
          .pdf-item { flex-wrap: wrap !important; gap: 8px !important; padding: 10px !important; }
          .pdf-actions { width: 100% !important; justify-content: flex-end !important; }
          .list-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .search-input { width: 100% !important; }
          .confirm-box { padding: 1.5rem 1.25rem !important; }
          .confirm-btns { flex-direction: column !important; }
          .done-btns { flex-direction: column !important; }
          .viewer-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .viewer-header-btns { width: 100% !important; justify-content: flex-end !important; }
          .drop-zone { padding: 1rem !important; }
          iframe { height: 400px !important; }
        }
      `}</style>

      <input ref={fileInputRef} type="file"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.txt,.doc,.docx"
        multiple style={{ display:"none", position:"absolute" }}
        onChange={(e) => handleFiles(e.target.files)} />

      {/* Confirm Dialog */}
      {confirmAction && (
        <div style={styles.overlay}>
          <div style={styles.confirmBox} className="confirm-box">
            <div style={{ fontSize:"42px", marginBottom:"10px" }}>
              {confirmAction.type === "download" ? "⬇️" : "🗑️"}
            </div>
            <p style={styles.confirmTitle}>{confirmAction.type === "download" ? "Download" : "Delete"} {confirmAction.label}?</p>
            <p style={styles.confirmSub}>
              {confirmAction.type === "download"
                ? `${confirmAction.ids.length} file${confirmAction.ids.length > 1 ? "s" : ""} will be downloaded.`
                : "This will permanently delete from database storage. This cannot be undone!"}
            </p>
            <div style={styles.confirmBtns} className="confirm-btns">
              <button style={styles.btnCancel} onClick={() => setConfirmAction(null)}>No, Cancel</button>
              <button style={confirmAction.type === "download" ? styles.btnConfirmDownload : styles.btnConfirmDel} onClick={confirmAction_execute}>
                {confirmAction.type === "download" ? "Yes, Download" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Banner */}
      {isNearFull && (
        <div style={styles.alertBanner}>
          <span style={{ fontSize:"20px" }}>⚠️</span>
          <div><strong>Storage Almost Full!</strong> — {formatSize(storageUsed)} used. Only <strong>{formatSize(TOTAL_STORAGE - storageUsed)}</strong> left.</div>
        </div>
      )}

      {/* Header */}
      <div style={styles.header} className="mh">
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/>
    <path d="M6 11.5v5c0 0 2 2.5 6 2.5s6-2.5 6-2.5v-5"/>
    <line x1="22" y1="8.5" x2="22" y2="14"/>
  </svg>
</div>
          <div>
            <h1 style={styles.title}>Marksheet Uploader</h1>
            <p style={styles.subtitle}>☁️ {formatSize(storageUsed)} used · {formatSize(TOTAL_STORAGE - storageUsed)} free · 25GB total</p>
          </div>
        </div>
        <div style={styles.headerRight} className="mh-right">
          <div style={styles.storageBarWrap} className="storage-bar-wrap">
            <div style={styles.storageBarTrack} className="storage-bar-track">
              <div style={{ height:"100%", borderRadius:"20px", transition:"width 0.5s ease", width:`${usedPercent.toFixed(2)}%`, background:barColor }} />
            </div>
            <span style={styles.storagePercent}>{usedPercent.toFixed(1)}%</span>
          </div>
          <div style={styles.badge}>{pdfs.length} stored</div>
        </div>
      </div>

      {/* Body */}
      <div style={styles.body} className="body-wrap">

        {/* Steps */}
        <div style={styles.stepRow}>
          <div style={styles.stepItem}>
            <div style={{ ...styles.stepCircle, ...(step >= 1 ? styles.stepCircleActive : {}) }}>1</div>
            <span style={{ ...styles.stepLabel, ...(step >= 1 ? styles.stepLabelActive : {}) }} className="step-label">Fill Details</span>
          </div>
          <div style={{ ...styles.stepLine, ...(step >= 2 ? styles.stepLineActive : {}) }} />
          <div style={styles.stepItem}>
            <div style={{ ...styles.stepCircle, ...(step >= 2 ? styles.stepCircleActive : {}) }}>2</div>
            <span style={{ ...styles.stepLabel, ...(step >= 2 ? styles.stepLabelActive : {}) }} className="step-label">Upload Files</span>
          </div>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>🎓 Student Details</p>
            <div style={styles.formGrid} className="form-grid">
              <div style={styles.formGroup}>
                <label style={styles.label}>Student Name <span style={styles.required}>*</span></label>
                <input style={styles.input} type="text" name="studentName" placeholder="e.g. Rahul Sharma" value={form.studentName} onChange={handleFormChange} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Class / Grade <span style={styles.required}>*</span></label>
                <input style={styles.input} type="text" name="className" placeholder="e.g. Class 10" value={form.className} onChange={handleFormChange} />
              </div>
              <div style={{ ...styles.formGroup, gridColumn:"1 / -1" }}>
                <label style={styles.label}>Board <span style={styles.required}>*</span></label>
                <select style={styles.input} name="board" value={form.board} onChange={handleFormChange}>
                  <option value="">Select Board</option>
                  {["CBSE","ICSE","RBSE","UP Board","MP Board","Maharashtra Board","Other"].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            <button style={styles.btnNext} onClick={handleNextStep}>Next: Upload Files →</button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={styles.card}>
            <div style={styles.cardTitleRow}>
              <p style={styles.cardTitle}>📁 Upload Files</p>
              {isIdle && <button style={styles.btnBack} onClick={() => { setStep(1); setPendingFiles([]); }}>← Back</button>}
            </div>

            <div style={styles.summaryBox}>
              <div style={styles.summaryHeader}>
                <div style={styles.avatarCircle}>{getInitials(form.studentName)}</div>
                <div>
                  <p style={styles.summaryHeading}>Student Information</p>
                  <p style={styles.summarySubheading}>Review before uploading</p>
                </div>
              </div>
              <div style={styles.summaryDivider} />
              <div style={styles.summaryGrid} className="summary-grid">
                {[["👤","Student Name",form.studentName],["🏫","Class / Grade",form.className],["📋","Board",form.board]].map(([icon,label,val]) => (
                  <div key={label} style={styles.summaryItem} className="summary-item">
                    <div style={styles.summaryIconBox}>{icon}</div>
                    <div><p style={styles.summaryLabel}>{label}</p><p style={styles.summaryVal} className="summary-val">{val}</p></div>
                  </div>
                ))}
              </div>
            </div>

            {isIdle && (
              <>
                <div
                  style={{ ...styles.dropZone, ...(dragging ? styles.dropZoneActive : {}), ...(pendingFiles.length > 0 ? styles.dropZoneReady : {}) }}
                  className="drop-zone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <div style={styles.uploadIconWrap}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p style={styles.dropText}>Tap or drag files here</p>
                  <p style={styles.dropSub}>PDF, JPG, PNG, DOC — up to 25GB</p>
                  <button style={styles.btnBrowse} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>Choose Files</button>
                </div>

                {pendingFiles.length > 0 && (
                  <div style={styles.selectedFilesBox}>
                    <div style={styles.selectedFilesHeader}>
                      <span style={styles.selectedFilesTitle}>📎 {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""}</span>
                      <span style={styles.selectedFilesSize}>{formatSize(totalSize)}</span>
                      <button style={styles.btnClearAll} onClick={() => setPendingFiles([])}>Clear All</button>
                    </div>
                    <div style={styles.selectedFilesList}>
                      {pendingFiles.map((file, i) => (
                        <div key={i} style={styles.selectedFileItem}>
                          <span style={{ fontSize:"18px" }}>{getFileIconByName(file.name)}</span>
                          <div style={styles.selectedFileInfo}>
                            <p style={styles.selectedFileName}>{file.name}</p>
                            <p style={styles.selectedFileSize}>{formatSize(file.size)}</p>
                          </div>
                          <button style={styles.btnRemoveFile} onClick={() => removeFile(i)}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pendingFiles.length > 0 && (
  <>
    {storageUsed >= ALERT_THRESHOLD && (
      <div style={{
        background: "#fef2f2",
        border: "1.5px solid #fecaca",
        borderRadius: "10px",
        padding: "12px 16px",
        marginTop: "12px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        fontSize: "13px",
        color: "#dc2626",
        fontWeight: "600"
      }}>
        <span style={{ fontSize: "20px" }}>🚫</span>
        <div>
          <div>Storage is full! You cannot upload more files.</div>
          <div style={{ fontSize: "12px", fontWeight: "400", marginTop: "3px", color: "#ef4444" }}>
            Please delete some files to free up space, then try again.
          </div>
        </div>
      </div>
    )}
    <button
      style={{
        ...styles.btnUpload,
        ...(storageUsed >= ALERT_THRESHOLD ? {
          background: "#e2e8f0",
          color: "#94a3b8",
          cursor: "not-allowed",
          opacity: 0.7
        } : {})
      }}
      onClick={uploadFiles}
      disabled={storageUsed >= ALERT_THRESHOLD}
    >
      {storageUsed >= ALERT_THRESHOLD ? "🚫 Storage Full" : `☁️ Upload ${pendingFiles.length} File${pendingFiles.length !== 1 ? "s" : ""}`}
    </button>
  </>
)}
              </>
            )}

            {isUploading && (
              <div style={styles.progressBox}>
                <div style={styles.progressHeader}>
                  <span style={styles.progressTitle}>☁️ Uploading...</span>
                  <span style={styles.progressPercent}>{progress}%</span>
                </div>
                <div style={styles.progressTrack}>
                  <div style={{ ...styles.progressFill, width:`${progress}%` }} />
                </div>
                <p style={styles.progressFileName}>📄 {currentFile}</p>
                <div style={styles.progressSteps}>
                  {progressFiles.map((file, index) => {
                    const filePct = ((index + 1) / progressFiles.length) * 100;
                    const done = progress >= filePct;
                    const active = progress >= (index / progressFiles.length) * 100 && !done;
                    return (
                      <div key={index} style={{ ...styles.progressStep, ...(done ? styles.progressStepDone : active ? styles.progressStepActive : {}) }}>
                        <span>{done ? "✅" : active ? "⏳" : "⬜"}</span>
                        <span style={styles.progressStepName}>{file.name.length > 25 ? file.name.slice(0,25)+"..." : file.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isDone && (
              <div style={styles.doneBox}>
                <div style={styles.doneHeader}>
                  <span style={{ fontSize:"40px" }}>✅</span>
                  <div>
                    <p style={styles.doneTitle}>{savedCount} File{savedCount !== 1 ? "s" : ""} Saved!</p>
                    <p style={styles.doneSub}>Permanently stored in cloud.</p>
                  </div>
                </div>
                <div style={styles.doneBtns} className="done-btns">
                  <button style={styles.btnAddMore} onClick={handleAddMore}>➕ Add More</button>
                  <button style={styles.btnSubmit} onClick={handleSubmit}>✓ Submit</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stored List */}
        <div style={styles.listSection}>
          <div style={styles.listHeader} className="list-header">
            <span style={styles.sectionTitle}>📂 Marksheets ({pdfs.length})</span>
            {pdfs.length > 0 && (
              <input style={styles.searchInput} className="search-input" type="text"
                placeholder="Search name, class, board..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            )}
          </div>

          {pdfs.length > 0 && (
            <div style={styles.toolbar} className="toolbar">
              <div style={styles.toolbarLeft}>
                {!selectMode ? (
                  <button style={styles.btnSelectMode} onClick={() => setSelectMode(true)}>☑️ Select</button>
                ) : (
                  <div style={styles.selectBar}>
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} style={styles.masterCheckbox} />
                    <span style={styles.selectCount}>{selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select"}</span>
                    <button style={styles.btnCancelSelect} onClick={exitSelectMode}>✕</button>
                  </div>
                )}
              </div>
              <div style={styles.toolbarRight} className="toolbar-right">
                {selectMode && selectedIds.length > 0 && (
                  <>
                    <button style={styles.btnBulkDownload} onClick={downloadSelected}>⬇️ ({selectedIds.length})</button>
                    <button style={styles.btnBulkDelete} onClick={deleteSelected}>🗑️ ({selectedIds.length})</button>
                    <div style={styles.toolbarDivider} />
                  </>
                )}
                <button style={styles.btnAllDownload} onClick={downloadAll}>⬇️ All</button>
                <button style={styles.btnAllDelete} onClick={deleteAll}>🗑️ All</button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={styles.empty}>{pdfs.length === 0 ? "No marksheets yet. Upload one above." : "No results found."}</div>
          ) : (
            <div style={styles.list}>
              {filtered.map((p) => {
                const isSelected = selectedIds.includes(p.id);
                const isViewing = viewingPdf?.id === p.id;
                return (
                  <div key={p.id}>
                    <div style={{
                      ...styles.pdfItem,
                      ...(isViewing ? styles.pdfItemActive : {}),
                      ...(isSelected ? styles.pdfItemSelected : {}),
                      ...(isViewing ? { borderBottomLeftRadius:0, borderBottomRightRadius:0, borderBottom:"none" } : {}),
                    }} className="pdf-item">
                      {selectMode && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)} style={styles.rowCheckbox} />
                      )}
                      <div style={styles.pdfIcon}><span style={{ fontSize:"20px" }}>{getFileIconByName(p.originalName)}</span></div>
                      <div style={styles.pdfInfo}>
                        <p style={styles.pdfName}>{p.name}</p>
                        <p style={styles.pdfMeta}>{p.className} · {p.board}</p>
                        <p style={{ ...styles.pdfMeta, marginTop:"2px" }}>📎 {p.originalName} · {formatSize(p.size)} · {formatDate(p.date)}</p>
                      </div>
                      <div style={styles.pdfActions} className="pdf-actions">
                        <button style={isViewing ? styles.btnViewActive : styles.btnView}
                          onClick={() => setViewingPdf(isViewing ? null : p)}>
                          {isViewing ? "▲" : "▼ View"}
                        </button>
                        <button style={styles.btnDownload} onClick={() => { downloadFile(p); showToast("✓ Downloading..."); }}>⬇</button>
                        <button style={styles.btnDel} onClick={() => deletePDF(p)}>✕</button>
                      </div>
                    </div>

                    {isViewing && (
                      <div style={styles.inlineViewer}>
                        <div style={styles.viewerHeader} className="viewer-header">
                          <div style={styles.viewerTitleRow}>
                            <span style={{ fontSize:"16px" }}>{getFileIconByName(p.originalName)}</span>
                            <div>
                              <p style={styles.viewerTitle}>{p.name} — {p.originalName}</p>
                              <p style={{ fontSize:"11px", color:"#94a3b8", margin:0 }}>{p.className} · {p.board}</p>
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:"8px" }} className="viewer-header-btns">
                            <button style={styles.btnDownloadHeader} onClick={() => { downloadFile(p); showToast("✓ Downloading..."); }}>⬇ Download</button>
                            <button style={styles.btnClose} onClick={() => setViewingPdf(null)}>✕ Close</button>
                          </div>
                        </div>
                        {renderViewer(p)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
};

const styles = {
  page: { minHeight:"100vh", background:"#f1f5f9", fontFamily:"'Segoe UI', system-ui, sans-serif", color:"#1e293b" },
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", animation:"fadeIn 0.15s ease" },
  confirmBox: { background:"#fff", borderRadius:"20px", padding:"2rem 2.25rem", textAlign:"center", maxWidth:"360px", width:"90%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", animation:"scaleIn 0.2s ease" },
  confirmTitle: { fontSize:"17px", fontWeight:"800", color:"#1e293b", margin:"0 0 8px" },
  confirmSub: { fontSize:"13px", color:"#64748b", margin:"0 0 1.5rem", lineHeight:"1.55" },
  confirmBtns: { display:"flex", gap:"12px" },
  btnCancel: { flex:1, padding:"11px", fontSize:"14px", fontWeight:"600", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:"10px", cursor:"pointer", color:"#475569" },
  btnConfirmDel: { flex:1, padding:"11px", fontSize:"14px", fontWeight:"700", background:"#dc2626", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer" },
  btnConfirmDownload: { flex:1, padding:"11px", fontSize:"14px", fontWeight:"700", background:"#16a34a", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer" },
  alertBanner: { display:"flex", alignItems:"flex-start", gap:"12px", background:"#fef2f2", color:"#991b1b", borderBottom:"2px solid #fecaca", padding:"12px 1rem", fontSize:"13px", fontWeight:"500", animation:"pulseBg 1.5s ease-in-out infinite" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0.85rem 2rem", background:"#7c3aed", boxShadow:"0 2px 8px rgba(124,58,237,0.3)", flexWrap:"wrap", gap:"10px" },
  headerLeft: { display:"flex", alignItems:"center", gap:"12px" },
  headerRight: { display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"6px" },
  logo: { width:"42px", height:"42px", background:"rgba(255,255,255,0.2)", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  title: { fontSize:"18px", fontWeight:"700", color:"#ffffff", margin:0 },
  subtitle: { fontSize:"11px", color:"rgba(255,255,255,0.85)", margin:"3px 0 0" },
  storageBarWrap: { display:"flex", alignItems:"center", gap:"8px" },
  storageBarTrack: { width:"160px", height:"8px", background:"rgba(255,255,255,0.25)", borderRadius:"20px", overflow:"hidden" },
  storagePercent: { fontSize:"11px", color:"rgba(255,255,255,0.9)", fontWeight:"700", minWidth:"38px", textAlign:"right" },
  badge: { padding:"5px 14px", background:"rgba(255,255,255,0.2)", color:"#ffffff", borderRadius:"20px", fontSize:"12px", fontWeight:"600", border:"1px solid rgba(255,255,255,0.3)" },
  body: { maxWidth:"780px", margin:"0 auto", padding:"2rem 1.5rem" },
  stepRow: { display:"flex", alignItems:"center", marginBottom:"1.5rem" },
  stepItem: { display:"flex", alignItems:"center", gap:"8px" },
  stepCircle: { width:"32px", height:"32px", borderRadius:"50%", background:"#e2e8f0", color:"#94a3b8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:"700", border:"2px solid #cbd5e1", flexShrink:0 },
  stepCircleActive: { background:"#7c3aed", color:"#fff", border:"2px solid #7c3aed" },
  stepLabel: { fontSize:"13px", color:"#94a3b8", fontWeight:"500" },
  stepLabelActive: { color:"#7c3aed", fontWeight:"700" },
  stepLine: { flex:1, height:"3px", background:"#e2e8f0", margin:"0 12px", borderRadius:"2px" },
  stepLineActive: { background:"#7c3aed" },
  card: { background:"#ffffff", border:"1px solid #e2e8f0", borderRadius:"16px", padding:"1.5rem", marginBottom:"1.5rem", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" },
  cardTitle: { fontSize:"16px", fontWeight:"700", color:"#1e293b", margin:"0 0 1.25rem" },
  cardTitleRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem" },
  formGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"1.25rem" },
  formGroup: { display:"flex", flexDirection:"column", gap:"6px" },
  label: { fontSize:"12px", color:"#475569", fontWeight:"600" },
  required: { color:"#ef4444" },
  input: { padding:"11px 13px", fontSize:"14px", border:"1.5px solid #e2e8f0", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", outline:"none", width:"100%" },
  btnNext: { width:"100%", padding:"13px", fontSize:"15px", fontWeight:"700", background:"#7c3aed", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer" },
  btnBack: { padding:"7px 16px", fontSize:"12px", background:"transparent", border:"1.5px solid #e2e8f0", borderRadius:"8px", cursor:"pointer", color:"#64748b", fontWeight:"600" },
  btnUpload: { width:"100%", padding:"13px", fontSize:"15px", fontWeight:"700", background:"#7c3aed", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer", marginTop:"1rem" },
  summaryBox: { background:"linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)", border:"2px solid #ddd6fe", borderRadius:"16px", padding:"20px", marginBottom:"1.25rem" },
  summaryHeader: { display:"flex", alignItems:"center", gap:"16px", marginBottom:"16px" },
  avatarCircle: { width:"52px", height:"52px", borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#6d28d9)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", fontWeight:"800", flexShrink:0 },
  summaryHeading: { fontSize:"16px", fontWeight:"800", color:"#4c1d95", margin:"0 0 4px" },
  summarySubheading: { fontSize:"12px", color:"#a78bfa", margin:0 },
  summaryDivider: { height:"1px", background:"#ddd6fe", marginBottom:"16px" },
  summaryGrid: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px" },
  summaryItem: { display:"flex", alignItems:"flex-start", gap:"8px", background:"#ffffff", borderRadius:"10px", padding:"12px", border:"1px solid #ede9fe" },
  summaryIconBox: { fontSize:"18px", lineHeight:1 },
  summaryLabel: { fontSize:"10px", color:"#a78bfa", fontWeight:"700", textTransform:"uppercase", letterSpacing:"0.5px", margin:"0 0 3px" },
  summaryVal: { fontSize:"15px", color:"#4c1d95", fontWeight:"800", margin:0, wordBreak:"break-word" },
  dropZone: { border:"2px dashed #cbd5e1", borderRadius:"12px", padding:"1.5rem", textAlign:"center", cursor:"pointer", background:"#f8fafc", transition:"all 0.2s" },
  dropZoneActive: { border:"2px dashed #7c3aed", background:"#f5f3ff" },
  dropZoneReady: { border:"2px solid #7c3aed", background:"#f5f3ff" },
  uploadIconWrap: { width:"52px", height:"52px", background:"#ede9fe", borderRadius:"14px", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" },
  dropText: { fontSize:"14px", color:"#334155", marginBottom:"4px", fontWeight:"600" },
  dropSub: { fontSize:"11px", color:"#94a3b8", marginBottom:"14px" },
  btnBrowse: { padding:"9px 24px", fontSize:"13px", fontWeight:"600", background:"#7c3aed", color:"#fff", border:"none", borderRadius:"8px", cursor:"pointer" },
  selectedFilesBox: { background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:"12px", padding:"14px", marginTop:"12px" },
  selectedFilesHeader: { display:"flex", alignItems:"center", gap:"10px", marginBottom:"10px", flexWrap:"wrap" },
  selectedFilesTitle: { fontSize:"13px", fontWeight:"700", color:"#1e293b", flex:1 },
  selectedFilesSize: { fontSize:"12px", color:"#64748b", background:"#e2e8f0", padding:"3px 10px", borderRadius:"20px" },
  btnClearAll: { padding:"4px 12px", fontSize:"11px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:"6px", cursor:"pointer", color:"#dc2626", fontWeight:"600" },
  selectedFilesList: { display:"flex", flexDirection:"column", gap:"6px", maxHeight:"180px", overflowY:"auto" },
  selectedFileItem: { display:"flex", alignItems:"center", gap:"10px", background:"#ffffff", border:"1px solid #e2e8f0", borderRadius:"8px", padding:"8px 12px" },
  selectedFileInfo: { flex:1, minWidth:0 },
  selectedFileName: { fontSize:"13px", fontWeight:"500", color:"#1e293b", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  selectedFileSize: { fontSize:"11px", color:"#94a3b8", margin:"2px 0 0" },
  btnRemoveFile: { background:"transparent", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:"14px", padding:"2px 6px", flexShrink:0 },
  progressBox: { background:"#f5f3ff", border:"2px solid #ddd6fe", borderRadius:"14px", padding:"18px", marginTop:"12px" },
  progressHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" },
  progressTitle: { fontSize:"14px", fontWeight:"700", color:"#6d28d9" },
  progressPercent: { fontSize:"16px", fontWeight:"800", color:"#6d28d9" },
  progressTrack: { height:"12px", background:"#ede9fe", borderRadius:"20px", overflow:"hidden", marginBottom:"10px" },
  progressFill: { height:"100%", background:"linear-gradient(90deg,#7c3aed,#a855f7)", borderRadius:"20px", transition:"width 0.3s ease" },
  progressFileName: { fontSize:"12px", color:"#6d28d9", marginBottom:"12px", fontWeight:"500", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  progressSteps: { display:"flex", flexDirection:"column", gap:"5px" },
  progressStep: { display:"flex", alignItems:"center", gap:"8px", padding:"5px 10px", borderRadius:"8px", background:"#ede9fe", fontSize:"12px", color:"#64748b" },
  progressStepDone: { background:"#dcfce7", color:"#16a34a" },
  progressStepActive: { background:"#ddd6fe", color:"#7c3aed", fontWeight:"600" },
  progressStepName: { overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  doneBox: { background:"#f0fdf4", border:"2px solid #bbf7d0", borderRadius:"16px", padding:"20px", marginTop:"1rem" },
  doneHeader: { display:"flex", alignItems:"center", gap:"14px", marginBottom:"16px" },
  doneTitle: { fontSize:"16px", fontWeight:"800", color:"#16a34a", margin:"0 0 4px" },
  doneSub: { fontSize:"12px", color:"#22c55e", margin:0 },
  doneBtns: { display:"flex", gap:"10px" },
  btnAddMore: { flex:1, padding:"12px", fontSize:"14px", fontWeight:"700", background:"#ffffff", color:"#7c3aed", border:"2px solid #7c3aed", borderRadius:"10px", cursor:"pointer" },
  btnSubmit: { flex:1, padding:"12px", fontSize:"14px", fontWeight:"700", background:"#16a34a", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer" },
  listSection: { marginBottom:"1.5rem" },
  listHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"0.6rem", gap:"8px" },
  sectionTitle: { fontSize:"13px", fontWeight:"700", color:"#475569", textTransform:"uppercase", letterSpacing:"0.8px" },
  searchInput: { padding:"8px 13px", fontSize:"13px", border:"1.5px solid #e2e8f0", borderRadius:"8px", background:"#fff", color:"#1e293b", outline:"none", width:"220px" },
  toolbar: { display:"flex", alignItems:"center", justifyContent:"space-between", background:"#ffffff", border:"1.5px solid #e2e8f0", borderRadius:"10px", padding:"9px 14px", marginBottom:"10px", gap:"10px", flexWrap:"wrap" },
  toolbarLeft: { display:"flex", alignItems:"center" },
  toolbarRight: { display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap" },
  toolbarDivider: { width:"1px", height:"20px", background:"#e2e8f0", margin:"0 2px" },
  btnSelectMode: { padding:"6px 14px", fontSize:"12px", fontWeight:"600", background:"#f5f3ff", border:"1.5px solid #ddd6fe", borderRadius:"7px", cursor:"pointer", color:"#7c3aed" },
  selectBar: { display:"flex", alignItems:"center", gap:"10px" },
  masterCheckbox: { width:"16px", height:"16px", cursor:"pointer", accentColor:"#7c3aed" },
  selectCount: { fontSize:"13px", fontWeight:"600", color:"#475569" },
  btnCancelSelect: { padding:"5px 12px", fontSize:"12px", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:"7px", cursor:"pointer", color:"#64748b", fontWeight:"600" },
  btnBulkDownload: { padding:"6px 13px", fontSize:"12px", fontWeight:"700", background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:"7px", cursor:"pointer", color:"#16a34a" },
  btnBulkDelete: { padding:"6px 13px", fontSize:"12px", fontWeight:"700", background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:"7px", cursor:"pointer", color:"#dc2626" },
  btnAllDownload: { padding:"6px 13px", fontSize:"12px", fontWeight:"600", background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:"7px", cursor:"pointer", color:"#475569" },
  btnAllDelete: { padding:"6px 13px", fontSize:"12px", fontWeight:"600", background:"#fff5f5", border:"1.5px solid #fecaca", borderRadius:"7px", cursor:"pointer", color:"#b91c1c" },
  empty: { textAlign:"center", padding:"2.5rem", color:"#94a3b8", fontSize:"13px", background:"#ffffff", borderRadius:"12px", border:"1.5px dashed #e2e8f0" },
  list: { display:"flex", flexDirection:"column", gap:"10px" },
  pdfItem: { display:"flex", alignItems:"center", gap:"12px", background:"#ffffff", border:"1.5px solid #e2e8f0", borderTopLeftRadius:"12px", borderTopRightRadius:"12px", borderBottomLeftRadius:"12px", borderBottomRightRadius:"12px", padding:"14px 16px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", transition:"border-color 0.15s" },
  pdfItemActive: { border:"1.5px solid #7c3aed", background:"#f5f3ff" },
  pdfItemSelected: { border:"1.5px solid #a78bfa", background:"#faf5ff" },
  rowCheckbox: { width:"17px", height:"17px", cursor:"pointer", accentColor:"#7c3aed", flexShrink:0 },
  pdfIcon: { width:"38px", height:"38px", background:"#f5f3ff", border:"1.5px solid #ddd6fe", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  pdfInfo: { flex:1, minWidth:0 },
  pdfName: { fontSize:"14px", fontWeight:"600", color:"#1e293b", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  pdfMeta: { fontSize:"11px", color:"#94a3b8", margin:"3px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  pdfActions: { display:"flex", gap:"6px", flexShrink:0 },
  btnView: { padding:"6px 12px", fontSize:"12px", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:"6px", cursor:"pointer", color:"#475569", fontWeight:"500", whiteSpace:"nowrap" },
  btnViewActive: { padding:"6px 12px", fontSize:"12px", background:"#ede9fe", border:"1.5px solid #c4b5fd", borderRadius:"6px", cursor:"pointer", color:"#6d28d9", fontWeight:"600" },
  btnDownload: { padding:"6px 10px", fontSize:"13px", background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:"6px", cursor:"pointer", color:"#16a34a" },
  btnDownloadHeader: { padding:"6px 14px", fontSize:"12px", background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:"6px", cursor:"pointer", color:"#16a34a", fontWeight:"500" },
  btnDownloadLarge: { padding:"10px 24px", fontSize:"14px", fontWeight:"600", background:"#7c3aed", color:"#fff", border:"none", borderRadius:"8px", cursor:"pointer" },
  btnDel: { padding:"6px 10px", fontSize:"12px", background:"#fef2f2", border:"1.5px solid #fecaca", borderRadius:"6px", cursor:"pointer", color:"#dc2626" },
  inlineViewer: { background:"#ffffff", border:"1.5px solid #7c3aed", borderTop:"none", borderBottomLeftRadius:"12px", borderBottomRightRadius:"12px", overflow:"hidden", marginBottom:"2px" },
  viewerHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1.5px solid #e2e8f0", background:"#f8fafc", flexWrap:"wrap", gap:"8px" },
  viewerTitleRow: { display:"flex", alignItems:"center", gap:"10px", minWidth:0 },
  viewerTitle: { fontSize:"13px", fontWeight:"600", color:"#1e293b", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  btnClose: { padding:"6px 14px", fontSize:"12px", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:"6px", cursor:"pointer", color:"#64748b", fontWeight:"500" },
  iframe: { width:"100%", height:"500px", border:"none", display:"block", background:"#fff" },
  toast: { position:"fixed", bottom:"20px", left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#fff", padding:"10px 20px", borderRadius:"24px", fontSize:"13px", fontWeight:"500", zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.15)", whiteSpace:"nowrap", maxWidth:"90vw", overflow:"hidden", textOverflow:"ellipsis" },
};

export default Mark;