const STORAGE_KEY = "schooltrack_inventory_v1";
const REPORT_KEY = "schooltrack_reports_v1";

const ACTIONS = {
  add: "Add New Stock",
  borrow: "Borrow / Release",
  return: "Return Borrowed Item",
  repair: "Send to Repair",
  completeRepair: "Complete Repair",
  missing: "Mark Missing",
  found: "Mark Missing Item as Found"
};

let inventory = loadData(STORAGE_KEY, []);
let reports = loadData(REPORT_KEY, []);

function loadData(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (error) {
    return fallback;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  localStorage.setItem(REPORT_KEY, JSON.stringify(reports));
  updateAll();
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" +
    Math.random().toString(36).slice(2, 5).toUpperCase();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeInventoryItem(item) {
  const oldQuantity = numberValue(item.quantity);
  const hasStockFields =
    ["totalQuantity", "borrowedQuantity", "repairQuantity", "missingQuantity"]
      .some(key => item[key] !== undefined);

  if (!hasStockFields) {
    item.totalQuantity = oldQuantity;
    item.borrowedQuantity = 0;
    item.repairQuantity = 0;
    item.missingQuantity = 0;

    if (item.status === "Under Repair" || item.condition === "Needs Repair") {
      item.repairQuantity = oldQuantity;
    } else if (item.status === "Missing" || item.condition === "Missing") {
      item.missingQuantity = oldQuantity;
    }
  }

  item.totalQuantity = numberValue(item.totalQuantity);
  item.borrowedQuantity = numberValue(item.borrowedQuantity);
  item.repairQuantity = numberValue(item.repairQuantity);
  item.missingQuantity = numberValue(item.missingQuantity);

  const allocated =
    item.borrowedQuantity +
    item.repairQuantity +
    item.missingQuantity;

  if (allocated > item.totalQuantity) {
    item.totalQuantity = allocated;
  }

  item.availableQuantity = Math.max(
    0,
    item.totalQuantity - allocated
  );

  item.quantity = item.totalQuantity;

  if (!Array.isArray(item.stockHistory)) {
    item.stockHistory = [];
  }

  updateItemStatus(item);
  return item;
}

function normalizeAllInventory() {
  inventory = inventory.map(normalizeInventoryItem);
}

function updateItemStatus(item) {
  if (item.missingQuantity > 0 && item.availableQuantity === 0 && item.borrowedQuantity === 0 && item.repairQuantity === 0) {
    item.condition = "Missing";
    item.status = "Missing";
  } else if (item.repairQuantity > 0) {
    item.condition = "Needs Repair";
    item.status = "Under Repair";
  } else if (item.borrowedQuantity > 0 && item.availableQuantity === 0) {
    item.condition = "Good";
    item.status = "In Use";
  } else if (item.borrowedQuantity > 0) {
    item.condition = "Good";
    item.status = "In Use";
  } else if (item.availableQuantity > 0) {
    item.condition = "Good";
    item.status = "Available";
  } else {
    item.condition = "Good";
    item.status = "Available";
  }
}

normalizeAllInventory();

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function openModal(html) {
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.page).classList.add("active");
    updateAll();
  });
});

document.getElementById("addItemBtn").addEventListener("click", () => openItemForm());
document.getElementById("addReportBtn").addEventListener("click", () => openReportForm());
document.getElementById("searchInput").addEventListener("input", renderInventory);

function openItemForm(item = null) {
  const editing = Boolean(item);
  const normalized = item ? normalizeInventoryItem({ ...item }) : null;
  const minimumTotal = normalized
    ? normalized.borrowedQuantity + normalized.repairQuantity + normalized.missingQuantity
    : 0;

  openModal(`
    <h2>${editing ? "Edit Item" : "Add New Item"}</h2>
    <form id="itemForm">
      <div class="form-grid">
        <label>Item ID
          <input name="id" value="${escapeHTML(normalized?.id || uid("INV"))}" ${editing ? "readonly" : "required"}>
        </label>

        <label>Item Name
          <input name="name" value="${escapeHTML(normalized?.name || "")}" placeholder="e.g. Computer" required>
        </label>

        <label>Category
          <select name="category">
            ${options(["ICT Equipment","Furniture","Electrical Equipment","Classroom Equipment","Laboratory Equipment","Other"], normalized?.category)}
          </select>
        </label>

        <label>Total Stock
          <input name="totalQuantity" type="number" min="${minimumTotal}" value="${normalized?.totalQuantity ?? 1}" required>
        </label>

        <label>Location
          <input name="location" value="${escapeHTML(normalized?.location || "")}" placeholder="e.g. ICT Laboratory">
        </label>

        <label>Person Responsible
          <input name="responsible" value="${escapeHTML(normalized?.responsible || "")}">
        </label>
      </div>

      ${editing ? `
        <div class="stock-status-box">
          <strong>Current Stock</strong>
          <div class="stock-status-grid">
            <div><span>Total</span><strong>${normalized.totalQuantity}</strong></div>
            <div><span>Available</span><strong>${normalized.availableQuantity}</strong></div>
            <div><span>Borrowed</span><strong>${normalized.borrowedQuantity}</strong></div>
            <div><span>Repair</span><strong>${normalized.repairQuantity}</strong></div>
            <div><span>Missing</span><strong>${normalized.missingQuantity}</strong></div>
          </div>
          <small>Use the Stock button for borrowing, returning, repairs, or missing items.</small>
        </div>
      ` : ""}

      <label>Remarks
        <textarea name="remarks">${escapeHTML(normalized?.remarks || "")}</textarea>
      </label>

      <div class="form-actions">
        <button type="button" id="cancelForm">Cancel</button>
        <button type="submit" class="primary">${editing ? "Save Changes" : "Add Item"}</button>
      </div>
    </form>
  `);

  document.getElementById("cancelForm").addEventListener("click", closeModal);

  document.getElementById("itemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const totalQuantity = numberValue(form.get("totalQuantity"));

    if (editing && totalQuantity < minimumTotal) {
      alert(`Total stock cannot be lower than ${minimumTotal}, because some items are currently borrowed, under repair, or missing.`);
      return;
    }

    const data = normalizeInventoryItem({
      ...(normalized || {}),
      id: form.get("id").trim(),
      name: form.get("name").trim(),
      category: form.get("category"),
      totalQuantity,
      location: form.get("location").trim(),
      responsible: form.get("responsible").trim(),
      remarks: form.get("remarks").trim(),
      dateAdded: normalized?.dateAdded || today()
    });

    if (editing) {
      const index = inventory.findIndex(x => x.id === item.id);
      inventory[index] = data;
      showToast("Inventory item updated.");
    } else {
      inventory.push(data);
      showToast("Inventory item added.");
    }

    saveData();
    closeModal();
  });
}

function options(list, selected) {
  return list.map(value =>
    `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(value)}</option>`
  ).join("");
}

function stockSummary(item) {
  const itemCopy = normalizeInventoryItem({ ...item });
  return `
    <div class="stock-summary">
      <span class="stock-chip">Total: ${itemCopy.totalQuantity}</span>
      <span class="stock-chip available">Available: ${itemCopy.availableQuantity}</span>
      <span class="stock-chip borrowed">Borrowed: ${itemCopy.borrowedQuantity}</span>
      <span class="stock-chip repair">Repair: ${itemCopy.repairQuantity}</span>
      <span class="stock-chip missing">Missing: ${itemCopy.missingQuantity}</span>
    </div>
  `;
}

function renderInventory() {
  normalizeAllInventory();

  const search = document.getElementById("searchInput").value.toLowerCase().trim();

  const filtered = inventory.filter(item =>
    [item.id, item.name, item.category, item.location, item.condition, item.status]
      .some(value => String(value || "").toLowerCase().includes(search))
  );

  const container = document.getElementById("inventoryList");

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">No inventory items found.</div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Item</th>
          <th>Category</th>
          <th>Stock</th>
          <th>Condition</th>
          <th>Location</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(item => `
          <tr>
            <td>${escapeHTML(item.id)}</td>
            <td><strong>${escapeHTML(item.name)}</strong><br>
              <small>${escapeHTML(item.responsible || "")}</small>
            </td>
            <td>${escapeHTML(item.category)}</td>
            <td>${stockSummary(item)}</td>
            <td><span class="badge">${escapeHTML(item.condition)}</span></td>
            <td>${escapeHTML(item.location)}</td>
            <td><span class="badge">${escapeHTML(item.status)}</span></td>
            <td>
              <div class="actions">
                <button class="stock-btn" onclick="manageStock('${encodeURIComponent(item.id)}')">Stock</button>
                <button onclick="editItem('${encodeURIComponent(item.id)}')">Edit</button>
                <button onclick="reportForItem('${encodeURIComponent(item.id)}')">Report</button>
                <button class="danger" onclick="deleteItem('${encodeURIComponent(item.id)}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.editItem = function(encodedId) {
  const id = decodeURIComponent(encodedId);
  const item = inventory.find(x => x.id === id);
  if (item) openItemForm(item);
};

window.deleteItem = function(encodedId) {
  const id = decodeURIComponent(encodedId);
  const item = inventory.find(x => x.id === id);
  if (!item) return;

  if (confirm(`Delete "${item.name}" from inventory?`)) {
    inventory = inventory.filter(x => x.id !== id);
    reports = reports.filter(r => r.itemId !== id);
    saveData();
    showToast("Item deleted.");
  }
};

window.reportForItem = function(encodedId) {
  const id = decodeURIComponent(encodedId);
  openReportForm(id);
};

window.manageStock = function(encodedId) {
  const id = decodeURIComponent(encodedId);
  const item = inventory.find(x => x.id === id);
  if (!item) return;

  normalizeInventoryItem(item);

  const history = [...item.stockHistory].reverse();

  openModal(`
    <h2>Manage Stock</h2>
    <p><strong>${escapeHTML(item.name)}</strong> (${escapeHTML(item.id)})</p>

    <div class="stock-status-box">
      <div class="stock-status-grid">
        <div><span>Total</span><strong>${item.totalQuantity}</strong></div>
        <div><span>Available</span><strong>${item.availableQuantity}</strong></div>
        <div><span>Borrowed</span><strong>${item.borrowedQuantity}</strong></div>
        <div><span>Repair</span><strong>${item.repairQuantity}</strong></div>
        <div><span>Missing</span><strong>${item.missingQuantity}</strong></div>
      </div>
    </div>

    <form id="stockForm">
      <label>Stock Action
        <select name="action" id="stockAction">
          ${Object.entries(ACTIONS).map(([key, label]) =>
            `<option value="${key}">${label}</option>`
          ).join("")}
        </select>
      </label>

      <div class="form-grid">
        <label>Quantity
          <input name="amount" id="stockAmount" type="number" min="1" value="1" required>
        </label>

        <label>Person
          <input name="person" placeholder="Borrower / Staff">
        </label>
      </div>

      <label>Remarks
        <textarea name="remarks" placeholder="Optional note..."></textarea>
      </label>

      <div class="form-actions">
        <button type="button" id="cancelStock">Cancel</button>
        <button type="submit" class="primary">Save Stock Update</button>
      </div>
    </form>

    <div class="history-box">
      <strong>Recent Stock History</strong>
      <div class="history-list">
        ${history.length ? history.slice(0, 10).map(entry => `
          <div class="history-entry">
            <strong>${escapeHTML(entry.action)}</strong> — ${entry.amount}
            <br><small>${escapeHTML(entry.date)}${entry.person ? " | " + escapeHTML(entry.person) : ""}</small>
            ${entry.remarks ? `<br><small>${escapeHTML(entry.remarks)}</small>` : ""}
          </div>
        `).join("") : `<p><small>No stock transactions yet.</small></p>`}
      </div>
    </div>
  `);

  document.getElementById("cancelStock").addEventListener("click", closeModal);

  document.getElementById("stockForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const form = new FormData(e.target);
    const action = form.get("action");
    const amount = numberValue(form.get("amount"));
    const person = form.get("person").trim();
    const remarks = form.get("remarks").trim();

    if (!amount) {
      alert("Enter a quantity greater than zero.");
      return;
    }

    const result = applyStockAction(item, action, amount);

    if (!result.ok) {
      alert(result.message);
      return;
    }

    item.stockHistory.push({
      id: uid("STK"),
      action: ACTIONS[action],
      amount,
      person,
      remarks,
      date: today()
    });

    normalizeInventoryItem(item);
    saveData();
    closeModal();
    showToast(`${ACTIONS[action]} saved. Available stock: ${item.availableQuantity}.`);
  });
};

function applyStockAction(item, action, amount) {
  normalizeInventoryItem(item);

  if (action === "add") {
    item.totalQuantity += amount;
  } else if (action === "borrow") {
    if (amount > item.availableQuantity) {
      return { ok: false, message: `Only ${item.availableQuantity} item(s) are available to borrow.` };
    }
    item.borrowedQuantity += amount;
  } else if (action === "return") {
    if (amount > item.borrowedQuantity) {
      return { ok: false, message: `Only ${item.borrowedQuantity} borrowed item(s) can be returned.` };
    }
    item.borrowedQuantity -= amount;
  } else if (action === "repair") {
    if (amount > item.availableQuantity) {
      return { ok: false, message: `Only ${item.availableQuantity} item(s) are available to send to repair.` };
    }
    item.repairQuantity += amount;
  } else if (action === "completeRepair") {
    if (amount > item.repairQuantity) {
      return { ok: false, message: `Only ${item.repairQuantity} item(s) are currently under repair.` };
    }
    item.repairQuantity -= amount;
  } else if (action === "missing") {
    if (amount > item.availableQuantity) {
      return { ok: false, message: `Only ${item.availableQuantity} item(s) are available to mark as missing.` };
    }
    item.missingQuantity += amount;
  } else if (action === "found") {
    if (amount > item.missingQuantity) {
      return { ok: false, message: `Only ${item.missingQuantity} missing item(s) can be marked as found.` };
    }
    item.missingQuantity -= amount;
  } else {
    return { ok: false, message: "Unknown stock action." };
  }

  normalizeInventoryItem(item);
  return { ok: true };
}

function openReportForm(preselectedId = "") {
  if (!inventory.length) {
    alert("Add an inventory item first.");
    return;
  }

  openModal(`
    <h2>Report Equipment Problem</h2>
    <form id="reportForm">
      <label>Item
        <select name="itemId" required>
          ${inventory.map(item =>
            `<option value="${escapeHTML(item.id)}" ${item.id === preselectedId ? "selected" : ""}>
              ${escapeHTML(item.id)} — ${escapeHTML(item.name)}
            </option>`
          ).join("")}
        </select>
      </label>

      <label>Problem
        <textarea name="problem" placeholder="Describe the problem..." required></textarea>
      </label>

      <div class="form-grid">
        <label>Reported By
          <input name="reportedBy" placeholder="Teacher / Staff" required>
        </label>

        <label>Date Reported
          <input name="date" type="date" value="${today()}" required>
        </label>

        <label>Status
          <select name="status">
            ${options(["Pending","Under Review","Resolved"], "Pending")}
          </select>
        </label>

        <label>Date Resolved
          <input name="resolvedDate" type="date">
        </label>
      </div>

      <label>Action Taken
        <textarea name="actionTaken" placeholder="What was done to address the problem?"></textarea>
      </label>

      <label>Remarks
        <textarea name="remarks"></textarea>
      </label>

      <div class="form-actions">
        <button type="button" id="cancelReport">Cancel</button>
        <button type="submit" class="primary">Submit Report</button>
      </div>
    </form>
  `);

  document.getElementById("cancelReport").addEventListener("click", closeModal);

  document.getElementById("reportForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);

    const report = {
      id: uid("REP"),
      itemId: form.get("itemId"),
      problem: form.get("problem").trim(),
      reportedBy: form.get("reportedBy").trim(),
      date: form.get("date"),
      status: form.get("status"),
      resolvedDate: form.get("resolvedDate"),
      actionTaken: form.get("actionTaken").trim(),
      remarks: form.get("remarks").trim()
    };

    reports.push(report);
    saveData();
    closeModal();
    showToast("Problem report saved.");
  });
}

function renderReports() {
  const container = document.getElementById("reportsList");

  if (!reports.length) {
    container.innerHTML = `<div class="empty">No problem reports yet.</div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Report ID</th>
          <th>Item</th>
          <th>Problem</th>
          <th>Reported By</th>
          <th>Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${reports.map(report => {
          const item = inventory.find(x => x.id === report.itemId);
          return `
            <tr>
              <td>${escapeHTML(report.id)}</td>
              <td>${escapeHTML(item?.name || "Deleted item")}<br>
                <small>${escapeHTML(report.itemId)}</small>
              </td>
              <td>${escapeHTML(report.problem)}</td>
              <td>${escapeHTML(report.reportedBy)}</td>
              <td>${escapeHTML(report.date)}</td>
              <td><span class="badge">${escapeHTML(report.status)}</span></td>
              <td>
                <div class="actions">
                  <button onclick="editReport('${encodeURIComponent(report.id)}')">Edit</button>
                  <button class="danger" onclick="deleteReport('${encodeURIComponent(report.id)}')">Delete</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

window.editReport = function(encodedId) {
  const id = decodeURIComponent(encodedId);
  const report = reports.find(x => x.id === id);
  if (!report) return;

  openModal(`
    <h2>Edit Report</h2>
    <form id="editReportForm">
      <label>Status
        <select name="status">
          ${options(["Pending","Under Review","Resolved"], report.status)}
        </select>
      </label>

      <label>Action Taken
        <textarea name="actionTaken">${escapeHTML(report.actionTaken)}</textarea>
      </label>

      <label>Date Resolved
        <input name="resolvedDate" type="date" value="${escapeHTML(report.resolvedDate)}">
      </label>

      <label>Remarks
        <textarea name="remarks">${escapeHTML(report.remarks)}</textarea>
      </label>

      <div class="form-actions">
        <button type="button" id="cancelEditReport">Cancel</button>
        <button type="submit" class="primary">Save Changes</button>
      </div>
    </form>
  `);

  document.getElementById("cancelEditReport").addEventListener("click", closeModal);

  document.getElementById("editReportForm").addEventListener("submit", e => {
    e.preventDefault();
    const form = new FormData(e.target);

    report.status = form.get("status");
    report.actionTaken = form.get("actionTaken").trim();
    report.resolvedDate = form.get("resolvedDate");
    report.remarks = form.get("remarks").trim();

    saveData();
    closeModal();
    showToast("Report updated.");
  });
};

window.deleteReport = function(encodedId) {
  const id = decodeURIComponent(encodedId);
  if (!confirm("Delete this report?")) return;

  reports = reports.filter(x => x.id !== id);
  saveData();
  showToast("Report deleted.");
};

function getStockTotals() {
  return inventory.reduce((totals, item) => {
    const current = normalizeInventoryItem({ ...item });
    totals.total += current.totalQuantity;
    totals.available += current.availableQuantity;
    totals.borrowed += current.borrowedQuantity;
    totals.repair += current.repairQuantity;
    totals.missing += current.missingQuantity;
    return totals;
  }, {
    total: 0,
    available: 0,
    borrowed: 0,
    repair: 0,
    missing: 0
  });
}

function updateDashboard() {
  const totals = getStockTotals();

  document.getElementById("totalItems").textContent = totals.total;
  document.getElementById("availableItems").textContent = totals.available;
  document.getElementById("borrowedItems").textContent = totals.borrowed;
  document.getElementById("repairItems").textContent = totals.repair;
  document.getElementById("missingItems").textContent = totals.missing;

  document.getElementById("pendingReports").textContent =
    reports.filter(r => r.status !== "Resolved").length;

  const recent = reports.slice(-5).reverse();

  document.getElementById("recentReports").innerHTML = recent.length
    ? recent.map(r => {
        const item = inventory.find(x => x.id === r.itemId);
        return `<div class="report-card">
          <strong>${escapeHTML(item?.name || r.itemId)}</strong>
          — ${escapeHTML(r.problem)}
          <br><small>${escapeHTML(r.status)} | ${escapeHTML(r.date)}</small>
        </div>`;
      }).join("")
    : `<p>No reports yet.</p>`;
}

function updateAll() {
  normalizeAllInventory();
  renderInventory();
  renderReports();
  updateDashboard();
}

document.getElementById("exportBtn").addEventListener("click", () => {
  const backup = {
    app: "SchoolTrack",
    version: 2,
    exportedAt: new Date().toISOString(),
    inventory,
    reports
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `schooltrack-backup-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);

  showToast("Backup exported.");
});

document.getElementById("importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());

    if (!Array.isArray(data.inventory) || !Array.isArray(data.reports)) {
      throw new Error("Invalid backup");
    }

    inventory = data.inventory.map(normalizeInventoryItem);
    reports = data.reports;
    saveData();
    showToast("Backup imported successfully.");
  } catch (error) {
    alert("The selected file is not a valid SchoolTrack backup.");
  }

  e.target.value = "";
});

document.getElementById("sampleBtn").addEventListener("click", () => {
  if (inventory.length || reports.length) {
    if (!confirm("This will add sample data to your current data. Continue?")) return;
  }

  const computer = normalizeInventoryItem({
    id: "INV-001",
    name: "Computer",
    category: "ICT Equipment",
    totalQuantity: 10,
    borrowedQuantity: 2,
    repairQuantity: 1,
    missingQuantity: 0,
    location: "ICT Laboratory",
    responsible: "ICT Coordinator",
    remarks: "School-owned computers",
    dateAdded: today(),
    stockHistory: [
      {
        id: "STK-SAMPLE-1",
        action: "Borrow / Release",
        amount: 2,
        person: "Teacher",
        remarks: "Sample transaction",
        date: today()
      },
      {
        id: "STK-SAMPLE-2",
        action: "Send to Repair",
        amount: 1,
        person: "ICT Coordinator",
        remarks: "Sample transaction",
        date: today()
      }
    ]
  });

  const fan = normalizeInventoryItem({
    id: "INV-002",
    name: "Electric Fan",
    category: "Electrical Equipment",
    totalQuantity: 2,
    borrowedQuantity: 0,
    repairQuantity: 1,
    missingQuantity: 0,
    location: "ICT Laboratory",
    responsible: "ICT Coordinator",
    remarks: "One fan has a noisy motor",
    dateAdded: today(),
    stockHistory: []
  });

  inventory.push(computer, fan);

  reports.push({
    id: "REP-001",
    itemId: "INV-002",
    problem: "Fan makes unusual noise.",
    reportedBy: "Teacher",
    date: today(),
    status: "Pending",
    resolvedDate: "",
    actionTaken: "",
    remarks: ""
  });

  saveData();
  showToast("Sample data loaded.");
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!confirm("This will permanently remove all inventory and report data from this browser. Export a backup first. Continue?")) return;

  inventory = [];
  reports = [];
  saveData();
  showToast("All local data cleared.");
});

function updateConnectionStatus() {
  const el = document.getElementById("connectionStatus");
  if (navigator.onLine) {
    el.textContent = "Online";
  } else {
    el.textContent = "Offline";
  }
}

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
updateConnectionStatus();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .catch(() => console.log("Service worker requires localhost or HTTPS."));
  });
}

updateAll();
