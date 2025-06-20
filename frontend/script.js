const tabs = document.querySelectorAll('.tab-btn');
const fileTitle = document.getElementById('file-title');
const tableBody = document.getElementById('status-table-body');
const dashboardContent = document.getElementById('dashboard-content');
const darkModeToggle = document.getElementById('dark-mode-toggle');

let lastUpdatedSpan = document.getElementById('last-updated');
if (!lastUpdatedSpan) {
  lastUpdatedSpan = document.createElement('div');
  lastUpdatedSpan.id = 'last-updated';
  lastUpdatedSpan.style.fontSize = '0.9rem';
  lastUpdatedSpan.style.color = '#666';
  document.querySelector('header').appendChild(lastUpdatedSpan);
}

const refreshButton = document.createElement('button');
refreshButton.id = 'refresh-btn';
refreshButton.innerHTML = '🔄 Refresh';
refreshButton.style.position = 'absolute';
refreshButton.style.top = '20px';
refreshButton.style.right = '20px';
refreshButton.style.padding = '0.5rem 1rem';
refreshButton.style.background = '#4b6cb7';
refreshButton.style.color = 'white';
refreshButton.style.border = 'none';
refreshButton.style.borderRadius = '4px';
refreshButton.style.cursor = 'pointer';
refreshButton.style.zIndex = '100';
document.querySelector('header').appendChild(refreshButton);

let currentType = "metar";
let chartInstance;
let isLoading = false;

const socket = io('http://localhost:3000');

const escapeSingleQuotes = (str) => {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
};

if (localStorage.getItem('darkMode') === 'enabled') {
  document.body.classList.add('dark');
  darkModeToggle.checked = true;
}

function updateLastUpdated() {
  const now = new Date();
  lastUpdatedSpan.textContent = `Last updated: ${now.toLocaleTimeString()}`;
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('active') || isLoading) return;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentType = tab.dataset.type;

    fadeOutIn(() => {
      fileTitle.textContent = `🛰 ${currentType.toUpperCase()} File Status`;
      loadStatusTable(currentType);
    });
  });
});

refreshButton.addEventListener('click', () => {
  if (isLoading) return;
  loadStatusTable(currentType);
});

darkModeToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode',
    document.body.classList.contains('dark') ? 'enabled' : 'disabled');
});

function fadeOutIn(callback) {
  if (dashboardContent) {
    dashboardContent.classList.add('out');
    setTimeout(() => {
      callback();
      dashboardContent.classList.remove('out');
    }, 300);
  } else {
    callback();
  }
}

function showLoading() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <div>Loading data...</div>
      </td>
    </tr>
  `;
}

async function loadStatusTable(fileType) {
  if (isLoading) return;

  isLoading = true;
  showLoading();

  try {
    const response = await fetch(`http://localhost:3000/api/status/${fileType}`);
    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();
    renderTable(data, fileType);
    updateLastUpdated();
  } catch (error) {
    console.error('Error loading status:', error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="error">
          Failed to load data. Retrying in 5 seconds...
          <div>${error.message}</div>
        </td>
      </tr>
    `;
    setTimeout(() => loadStatusTable(fileType), 5000);
  } finally {
    isLoading = false;
  }
}
function renderTable(data, fileType) {
  tableBody.innerHTML = "";
  let received = 0, delayed = 0, missing = 0, expected = 0;

  data.forEach(file => {
    const fileDate = new Date(file.timestamp);
    const formattedDate = `${fileDate.getUTCFullYear()}-${(fileDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${fileDate.getUTCDate().toString().padStart(2, '0')}`;
    const formattedTime = `${fileDate.getUTCHours().toString().padStart(2, '0')}:${fileDate.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    let statusInfo, actionContent;

    if (file.status === 'received') {
      statusInfo = { label: "✅ Received", class: "status-good" };
      received++;
      actionContent = `Received: ${formattedDate} ${formattedTime}`;
    }
    else if (file.status === 'missing') {
      statusInfo = { label: "❌ Missing", class: "status-missing" };
      missing++;
      actionContent = file.previous_timestamp
        ? `Last Received: ${new Date(file.previous_timestamp).toISOString().replace('T', ' ').substring(0, 16)} UTC`
        : "No previous record";
      actionContent += `
        <div style="margin-top: 5px;">
          <button class="manual-btn" 
            onclick="sendManualEmail('${escapeSingleQuotes(fileType)}', '${escapeSingleQuotes(file.timestamp)}')">
            📧 Notify
          </button>
        </div>`;
    }
    else if (file.status === 'delayed') {
      statusInfo = { label: "⏳ Delayed", class: "status-delayed" };
      delayed++;
      actionContent = file.previous_timestamp
        ? `Last Received: ${new Date(file.previous_timestamp).toISOString().replace('T', ' ').substring(0, 16)} UTC`
        : "Checking...";
    }
    else if (file.status === 'expected') {
      statusInfo = { label: `🕒 Expected at ${formattedTime}`, class: "status-expected" };
      expected++;
      actionContent = file.previous_timestamp
        ? `Last Received: ${new Date(file.previous_timestamp).toISOString().replace('T', ' ').substring(0, 16)} UTC`
        : `Expected: ${formattedTime}`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formattedDate}<br>${formattedTime}</td>
      <td>${file.filename || 'N/A'}</td>
      <td class="${statusInfo.class}">${statusInfo.label}</td>
      <td>${actionContent}</td>
    `;
    tableBody.appendChild(tr);
  });

  updatePieChart(received, delayed, missing, expected);
}

function updatePieChart(received, delayed, missing, expected) {
  const ctx = document.getElementById('statusChart').getContext('2d');

  if (chartInstance) {
    chartInstance.destroy();
  }

  const data = {
    labels: ['Received', 'Delayed', 'Missing', 'Expected'],
    datasets: [{
      data: [received, delayed, missing, expected],
      backgroundColor: [
        'rgba(75, 192, 192, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)'
      ],
      borderColor: [
        'rgba(75, 192, 192, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(54, 162, 235, 1)'
      ],
      borderWidth: 1
    }]
  };

  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 14 },
            color: document.body.classList.contains('dark') ? '#e0e0e0' : '#222'
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.label}: ${context.raw} files`;
            }
          }
        },
        title: {
          display: true,
          text: 'File Status Distribution',
          font: {
            size: 16
          },
          color: document.body.classList.contains('dark') ? '#e0e0e0' : '#222'
        }
      }
    }
  });
}

socket.on('status-update', (data) => {
  if (data.fileType === currentType) {
    showAlert(`Status updated: ${data.fileType} at ${new Date(data.timestamp).toLocaleTimeString()} is now ${data.status}`, 'success');
    if (data.status === 'missing') {
      showAlert(`Automatic notification sent for missing ${data.fileType} file`, 'info');
    }
    loadStatusTable(currentType);
  }
});

window.sendManualEmail = async function (fileType, timestamp) {
  try {
    const response = await fetch('http://localhost:3000/api/trigger-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileType, timestamp })
    });

    if (!response.ok) throw new Error('Email failed');
    showAlert('Email notification sent successfully!', 'success');
  } catch (error) {
    console.error('Error sending email:', error);
    showAlert('Failed to send email notification', 'error');
  }
}

function showAlert(message, type) {
  document.querySelectorAll('.alert').forEach(alert => alert.remove());

  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  document.body.appendChild(alert);

  setTimeout(() => {
    alert.style.opacity = '0';
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .loading-spinner {
      border: 4px solid rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      border-top: 4px solid #4b6cb7;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  loadStatusTable(currentType);

  setInterval(updateLastUpdated, 60000);
  setInterval(() => loadStatusTable(currentType), 5 * 60 * 1000);
});
