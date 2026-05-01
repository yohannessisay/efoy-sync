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
    var _a, _b, _c;
    if (!progress.totalBytes || progress.totalBytes <= 0) {
        return;
    }
    const transferred = Math.min(progress.transferredBytes, progress.totalBytes);
    const maxPercent = (_a = progress.maxPercent) !== null && _a !== void 0 ? _a : 100;
    const percent = Math.min(maxPercent, Math.floor((transferred / progress.totalBytes) * 100));
    const now = Date.now();
    const lastPercent = (_b = progress.lastLoggedPercent) !== null && _b !== void 0 ? _b : -1;
    const lastLoggedAt = (_c = progress.lastLoggedAt) !== null && _c !== void 0 ? _c : 0;
    const shouldLog = percent >= lastPercent + 5 || now - lastLoggedAt >= 1500 || (percent === 100 && lastPercent < 100);
    if (!shouldLog) {
        return;
    }
    progress.lastLoggedPercent = percent;
    progress.lastLoggedAt = now;
    ui.info(`${label}: ${percent}% (${formatBytes(transferred)}/${formatBytes(progress.totalBytes)})`);
};
exports.logByteProgress = logByteProgress;
