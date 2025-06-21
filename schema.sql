/* This is not a part of IDE run these commands in SQl workbench */

CREATE DATABASE IF NOT EXISTS files_monitoring;
USE files_monitoring;

CREATE TABLE files__status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_type ENUM('metar', 'synop', 'buoy', 'ship') NOT NULL,
    timestamp DATETIME NOT NULL,
    status ENUM('expected', 'received', 'delayed', 'missing') NOT NULL,
    filename VARCHAR(50) DEFAULT NULL,
    previous_timestamp DATETIME DEFAULT NULL,
    UNIQUE KEY (file_type, timestamp)
);
ALTER TABLE files__status MODIFY previous_timestamp DATETIME DEFAULT NULL;

CREATE INDEX idx_file_type ON files__status (file_type);
CREATE INDEX idx_timestamp ON files__status (timestamp);
CREATE INDEX idx_status ON files__status (status);

select*from files__status;
