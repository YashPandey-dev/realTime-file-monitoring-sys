const socket = io('http://localhost:3000');
let summaryChart;

document.addEventListener('DOMContentLoaded', () => {
  updateLastUpdated();
  loadAllTables();
  setInterval(updateLastUpdated, 60000);
  setInterval(loadAllTables, 5 * 60 * 1000);
});

function updateLastUpdated() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const timeString = now.toLocaleTimeString();

  const dateString = `${year}/${month}/${day}`;

  // Update both header and footer
  document.getElementById('last-updated').textContent = `Last updated: ${timeString} on ${dateString}`;
  document.getElementById('footer-updated').textContent = `${dateString} ${timeString}`;
}

async function loadAllTables() {
  try {
    const types = ['metar', 'synop', 'buoy', 'ship'];
    const promises = types.map(type =>
      fetch(`http://localhost:3000/api/status/${type}`)
        .then(res => res.json())
    );

    const results = await Promise.all(promises);

    // Render each table
    results.forEach((data, index) => {
      renderTable(data, types[index], `${types[index]}-table-body`);
    });

    // Update summary chart
    updateSummaryChart(results);

  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showAlert('Failed to load dashboard data. Retrying...', 'error');
    setTimeout(loadAllTables, 5000);
  }
}

function renderTable(data, fileType, tableBodyId) {
  const tableBody = document.getElementById(tableBodyId);
  tableBody.innerHTML = "";

  data.forEach(file => {
    const fileDate = new Date(file.timestamp);
    const formattedDate = `${fileDate.getUTCFullYear()}-${(fileDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${fileDate.getUTCDate().toString().padStart(2, '0')}`;
    const formattedTime = `${fileDate.getUTCHours().toString().padStart(2, '0')}:${fileDate.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    let statusInfo, actionContent;

    if (file.status === 'received') {
      statusInfo = { label: "✅ Received", class: "status-good" };
      actionContent = `Received: ${formattedDate} ${formattedTime}`;
    }
    else if (file.status === 'missing') {
      statusInfo = { label: "❌ Missing", class: "status-missing" };
      const showLastReceived = file.previous_timestamp && new Date(file.previous_timestamp) < fileDate;
      actionContent = showLastReceived
        ? `Last Received: ${formatDateTime(file.previous_timestamp)}`
        : "Never received";
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
      actionContent = file.previous_timestamp
        ? `Last Received: ${formatDateTime(file.previous_timestamp)}`
        : "Checking...";
    }
    else if (file.status === 'expected') {
      statusInfo = { label: `🕒 Expected at ${formattedTime}`, class: "status-expected" };
      actionContent = file.previous_timestamp
        ? `Last Received: ${formatDateTime(file.previous_timestamp)}`
        : "No previous record";
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
}

// Helper function to format date/time consistently
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')} ${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')} UTC`;
}

function updateSummaryChart(results) {
  const ctx = document.getElementById('summaryChart').getContext('2d');

  // Count statuses across all file types
  const statusCounts = {
    received: 0,
    delayed: 0,
    missing: 0,
    expected: 0
  };

  results.forEach(data => {
    data.forEach(file => {
      statusCounts[file.status]++;
    });
  });

  if (summaryChart) {
    summaryChart.destroy();
  }

  summaryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Received', 'Delayed', 'Missing', 'Expected'],
      datasets: [{
        label: 'File Status Summary',
        data: [
          statusCounts.received,
          statusCounts.delayed,
          statusCounts.missing,
          statusCounts.expected
        ],
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
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Files'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: true,
          text: 'Total File Status Counts',
          font: {
            size: 16
          }
        }
      }
    }
  });
}

// Helper functions
function escapeSingleQuotes(str) {
  return str ? str.replace(/'/g, "\\'") : '';
}

function showAlert(message, type) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  document.body.appendChild(alert);

  setTimeout(() => {
    alert.style.opacity = '0';
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

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

// Handle real-time updates
socket.on('status-update', (data) => {
  showAlert(`Status updated: ${data.fileType} at ${new Date(data.timestamp).toLocaleTimeString()} is now ${data.status}`, 'success');
  loadAllTables();
});
