"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logByteProgress = void 0;
const formatBytes = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Math.max(bytes, 0);
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const precision = unitIndex === 0 ? 0 : value < 10 ? 2 : 1;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
};
const logByteProgress = (progress, ui, label = 'Upload progress') => {
    var _a, _b;
    if (!progress.totalBytes || progress.totalBytes <= 0) {
        return;
    }
    const transferred = Math.min(progress.transferredBytes, progress.totalBytes);
    const percent = Math.min(100, Math.floor((transferred / progress.totalBytes) * 100));
    const now = Date.now();
    const lastPercent = (_a = progress.lastLoggedPercent) !== null && _a !== void 0 ? _a : -1;
    const lastLoggedAt = (_b = progress.lastLoggedAt) !== null && _b !== void 0 ? _b : 0;
    const shouldLog = percent >= lastPercent + 5 || now - lastLoggedAt >= 1500 || percent === 100;
    if (!shouldLog) {
        return;
    }
    progress.lastLoggedPercent = percent;
    progress.lastLoggedAt = now;
    ui.info(`${label}: ${percent}% (${formatBytes(transferred)}/${formatBytes(progress.totalBytes)})`);
};
exports.logByteProgress = logByteProgress;
