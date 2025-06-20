import dotenv from 'dotenv';
import express from 'express';
import mysql from 'mysql2/promise';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import { Client } from 'ssh2';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function checkFileExists(baseFilePath, fileType, timestamp) {
  return new Promise((resolve) => {
    const conn = new Client();
    const expectedHour = timestamp.getUTCHours();

    const possibleFilenames = [];

    if (fileType === 'metar') {
      if (expectedHour === 0) {
        possibleFilenames.push('mmetar.csv');
      } else {
        possibleFilenames.push(`mmetar${expectedHour}.csv`);
        possibleFilenames.push(`mmetar${expectedHour.toString().padStart(2, '0')}.csv`);
      }
    } else if (fileType === 'synop') {
      possibleFilenames.push(`${fileType}${expectedHour.toString().padStart(2, '0')}.csv`);
      possibleFilenames.push(`${fileType}${expectedHour.toString().padStart(3, '0')}.csv`);
    } else {
      possibleFilenames.push(`${fileType}${expectedHour.toString().padStart(2, '0')}.csv`);
    }

    let attemptIndex = 0;

    const tryNextFilename = () => {
      if (attemptIndex >= possibleFilenames.length) {
        console.warn(`All filename patterns for ${fileType} at ${timestamp.toISOString()} failed.`);
        conn.end();
        return resolve(false);
      }

      const currentFilename = possibleFilenames[attemptIndex];
      const fullPath = `${baseFilePath}/${currentFilename}`;
      console.log(`Attempting to check file existence for: ${fullPath}`);

      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            console.error(`SFTP Initialization Error for ${fullPath}:`, err);
            conn.end();
            return resolve(false);
          }

          sftp.stat(fullPath, (err, stats) => {
            conn.end();
            if (err) {
              attemptIndex++;
              conn.removeAllListeners('ready');
              conn.removeAllListeners('error');
              tryNextFilename();
            } else if (stats.isFile()) {
              console.log(`File found: ${fullPath}`);
              resolve(true);
            } else {
              console.warn(`${fullPath} exists but is not a file.`);
              attemptIndex++;
              conn.removeAllListeners('ready');
              conn.removeAllListeners('error');
              tryNextFilename();
            }
          });
        });
      }).on('error', (err) => {
        console.error(`SSH Connection Error trying to connect to ${process.env.SERVER_IP}:`, err.message);
        resolve(false);
      }).connect({
        host: process.env.SERVER_IP,
        port: 22,
        username: process.env.SERVER_USER,
        password: process.env.SERVER_PASSWORD
      });
    };

    tryNextFilename();
  });
}

function isWithinDelayedThreshold(timestamp) {
  const timeDiffMinutes = (new Date() - new Date(timestamp)) / (1000 * 60);
  return timeDiffMinutes < 10;
}

async function checkFileStatus() {
  console.log(`[${new Date().toISOString()}] Running checkFileStatus...`);
  const now = new Date();

  // Get all received files to establish last received timestamps
  const [receivedFiles] = await db.query(
    `SELECT file_type, MAX(timestamp) as last_received
     FROM files__status
     WHERE status = 'received'
     GROUP BY file_type`
  );

  // Create a map of last received timestamps per file type
  const lastReceivedMap = new Map();
  receivedFiles.forEach(file => {
    lastReceivedMap.set(file.file_type, new Date(file.last_received));
  });

  // Get files that need checking
  const [filesToCheck] = await db.query(
    `SELECT * FROM files__status 
     WHERE timestamp <= ?
     ORDER BY timestamp ASC`,
    [now]
  );

  const serverPath = process.env.SERVER_PATH;
  if (!serverPath) {
    console.error('SERVER_PATH environment variable is not set!');
    return;
  }

  for (const file of filesToCheck) {
    const fileTimestamp = new Date(file.timestamp);
    let newStatus = file.status;
    let previousTimestamp = lastReceivedMap.get(file.file_type);

    // Only check files that are expected or delayed
    if (file.status === 'expected' || file.status === 'delayed') {
      const fileExists = await checkFileExists(serverPath, file.file_type, fileTimestamp);

      if (fileExists) {
        newStatus = 'received';
        // Update last received timestamp
        lastReceivedMap.set(file.file_type, fileTimestamp);
      } else {
        newStatus = isWithinDelayedThreshold(fileTimestamp) ? 'delayed' : 'missing';
      }
    }

    if (newStatus !== file.status) {
      console.log(`Status change for ${file.file_type} at ${fileTimestamp.toISOString()}: ${file.status} -> ${newStatus}`);

      // Update the database with the new status and previous timestamp
      await db.query(
        `UPDATE files__status 
         SET status = ?, 
             previous_timestamp = ?
         WHERE id = ?`,
        [newStatus, previousTimestamp || null, file.id]
      );

      io.emit('status-update', {
        fileType: file.file_type,
        timestamp: file.timestamp,
        status: newStatus,
        filename: file.filename,
        previousTimestamp: previousTimestamp || null
      });
    }
  }
  console.log(`[${new Date().toISOString()}] checkFileStatus complete.`);
}

async function initDailyFiles() {
  console.log(`[${new Date().toISOString()}] Initializing daily files...`);
  const types = ['metar', 'synop', 'buoy', 'ship'];
  const intervals = { metar: 1, synop: 3, buoy: 1, ship: 1 };

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  for (const type of types) {
    const interval = intervals[type];
    for (let hour = 0; hour < 24; hour += interval) {
      const timestamp = new Date(today.getTime() + hour * 60 * 60 * 1000);
      let filename;

      if (type === 'metar') {
        filename = hour === 0 ? 'mmetar.csv' : `mmetar${hour}.csv`;
      } else if (type === 'synop') {
        filename = `synop${hour.toString().padStart(2, '0')}.csv`;
      } else {
        filename = `${type}${hour.toString().padStart(2, '0')}.csv`;
      }

      try {
        await db.execute(
          `INSERT INTO files__status (file_type, timestamp, status, filename) 
           VALUES (?, ?, 'expected', ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), filename = VALUES(filename)`,
          [type, timestamp, filename]
        );
      } catch (error) {
        console.error(`Error initializing DB entry for ${type} at ${timestamp.toISOString()}:`, error.message);
      }
    }
  }
  console.log(`[${new Date().toISOString()}] Daily file initialization complete.`);
}

app.get('/api/status/:type', async (req, res) => {
  try {
    const type = req.params.type;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [rows] = await db.query(
      `SELECT * FROM files__status 
       WHERE file_type = ? AND timestamp >= ? AND timestamp < ?
       ORDER BY timestamp ASC`,
      [type, today, tomorrow]
    );
    res.json(rows);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error in /api/status/${req.params.type}:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trigger-email', async (req, res) => {
  try {
    const { fileType, timestamp } = req.body;

    console.log(`[${new Date().toISOString()}] Attempting to send email for missing file: ${fileType} at ${timestamp}`);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `Missing File: ${fileType.toUpperCase()} - ${timestamp}`,
      text: `File ${fileType.toUpperCase()} for ${timestamp} is missing!`,
      html: `<p>File <strong>${fileType.toUpperCase()}</strong> for <strong>${timestamp}</strong> is missing!</p><p>Please investigate.</p>`
    });

    console.log(`[${new Date().toISOString()}] Email notification sent successfully for ${fileType} at ${timestamp}!`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error sending email for ${fileType} at ${timestamp}:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, '../frontend'), { index: 'dashboard.html' }));

cron.schedule('* * * * *', checkFileStatus);
cron.schedule('0 0 * * *', initDailyFiles);

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port http://localhost:${PORT}`);
  try {
    await initDailyFiles();
    await checkFileStatus();
    console.log('Initial file monitoring setup complete.');
  } catch (err) {
    console.error('Server initialization error:', err);
  }
});

io.on('connection', (socket) => {
  console.log('A client connected to Socket.IO');
  socket.on('disconnect', () => {
    console.log('A client disconnected from Socket.IO');
  });
});
