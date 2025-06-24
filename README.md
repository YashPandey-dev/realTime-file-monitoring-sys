# Real Time File Monitoring System
Author - Yash Pandey
_ _ _

A comprehensive web-based application designed to monitor the status of critical data files (METAR, SYNOP, BUOY, SHIP) by regularly checking their presence on a remote server, displaying their status on an intuitive dashboard, and sending alerts for missing files.This is made by me as a intern in IMD as per their requirements.

## Table of Contents

* [About The Project](#about-the-project)
* [Features](#features)
* [Technology Stack](#technology-stack)
* [Installation](#installation)
* [Usage](#usage)
* [Video and Image Demo](#video-and-image-demo)
* [Contact](#contact)

---

## About The Project

This project provides a robust solution for monitoring the timely arrival and status of various meteorological and marine data files. It offers both a high-level dashboard view and detailed status tables for specific file types. The system automatically updates file statuses, identifies missing or delayed files, and can trigger email notifications to administrators.

The application comprises a frontend built with standard web technologies (HTML, CSS, JavaScript) and a backend powered by Node.js, interacting with a MySQL database and a remote SFTP server.

## Features

* **Real-time File Status Dashboard:** Provides an overview of METAR, SYNOP, BUOY, and SHIP file statuses.
* **Detailed File Views:** Allows users to switch between detailed tables for each file type, showing timestamps, filenames, and current status.
* **Status Indicators:** Clearly marks files as "Received" (✅), "Missing" (❌), "Delayed" (⏳), or "Expected" (🕒).
* **Automated File Checks:** Periodically checks for file existence on a remote SFTP server.
* **Email Notifications:** Automatically sends email alerts for missing files with a manual trigger option on the dashboard.
* **Dark Mode Toggle:** User-friendly interface with an option to switch between light and dark themes.
* **Responsive Design:** Adapts to various screen sizes.
* **Dynamic Data Loading:** Uses Socket.IO for potential real-time updates and fetches data from backend APIs.
* **Status Summary Chart:** Visual representation of total file status counts on the dashboard.

## Technology Stack

The project is built using a combination of frontend and backend technologies:

* **Frontend:**
    * HTML5
    * CSS3 (with `dashboard-style.css` and `style.css` for styling)
    * JavaScript (ES6+)
    * Chart.js (for data visualization)
    * Socket.IO (client-side for real-time communication)
    * Google Fonts (`Outfit`)
* **Backend:**
    * Node.js
    * Express.js (web framework)
    * MySQL2 (database interaction)
    * Node-cron (for scheduled tasks)
    * Nodemailer (for email notifications)
    * Socket.IO (server-side for real-time communication)
    * SSH2 (for SFTP file existence checks on remote server)
    * Dotenv (for environment variable management)

## Installation

To set up the project locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YashPandey-dev/realTime-file-mangement-sys.git
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd realTime-file-mangement-sys
    ```
3.  **Install Node.js dependencies for the backend:**
    ```bash
    cd backend
    npm install
    ```
4.  **Set up Environment Variables:**
    Create a `.env` file in your `backend` directory and add the following:
    ```
    DB_HOST=your_mysql_host
    DB_USER=your_mysql_user
    DB_PASSWORD=your_mysql_password
    DB_NAME=your_mysql_database_name
    EMAIL_USER=your_gmail_email@gmail.com
    EMAIL_PASS=your_gmail_app_password
    ADMIN_EMAIL=admin_recipient_email@example.com
    SERVER_IP=your_sftp_server_ip
    SERVER_USER=your_sftp_username
    SERVER_PASSWORD=your_sftp_password
    SERVER_PATH=/path/to/your/files/on/sftp/server
    ```
    *Make sure to replace placeholder values with your actual credentials and paths.*
5.  **Set up MySQL Database:**
    Create the `files__status` table in your MySQL database. An example schema might look like:
    ```sql
    CREATE TABLE files__status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_type VARCHAR(50) NOT NULL,
        timestamp DATETIME NOT NULL,
        status ENUM('expected', 'received', 'missing', 'delayed') NOT NULL,
        filename VARCHAR(255),
        previous_timestamp DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ```
6.  **Start the Backend Server:**
    ```bash
    cd .. # Go back to the project root if you were in 'backend'
    node backend/server.js
    ```
    The server should start on `http://localhost:3000`.
7.  **Open the Frontend:**
    Navigate to `dashboard.html` or `index.html` in your web browser from the project root.

## Usage

* **Dashboard View:** Upon opening `dashboard.html`, you will see a summary of file statuses for METAR, SYNOP, BUOY, and SHIP files, along with a status summary chart.
* **Detailed View:** Click on "Detailed View" from the dashboard or select a specific file type (METAR, SYNOP, BUOY, SHIP) from the sidebar in `index.html` to see a detailed table for that file type.
* **Refresh Data:** Click the "Refresh" button in the detailed view to manually update the status table.
* **Dark Mode:** Use the toggle switch in the sidebar to enable or disable dark mode.
* **Notify for Missing Files:** For files marked "Missing," a "📧 Notify" button will appear. Clicking this will trigger an email notification to the configured `ADMIN_EMAIL`(Firstly a automatic mail will go to ADMIN for missing file then you can also manually send email again).

## Video and Image Demo

* [Watch a full website demo on YouTube](https://www.youtube.com/watch?v=xfbzeQtxJ-U)
* [Watch email notifications for missing files](https://www.youtube.com/channel/UCgEcWRygTUbaAWHbT2OhvMg/community?lb=UgkxQQ_aShmHksHE876oOhXMBuclwIUephJ1)

## Contact

Yash Pandey - [strange.evilup@gmail.com](mailto:strange.evilup@gmail.com)
<br>
Project Link: [https://github.com/YashPandey-dev/realTime-file-mangement-sys.git](https://github.com/YashPandey-dev/realTime-file-mangement-sys.git)
