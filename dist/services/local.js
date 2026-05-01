"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadViaLocal = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const progress_1 = require("./progress");
const state_1 = require("./state");
const expandHome = (input) => {
    if (input === '~') {
        return os.homedir();
    }
    if (input.startsWith(`~${path.sep}`) || input.startsWith('~/')) {
        return path.join(os.homedir(), input.slice(2));
    }
    return input;
};
const resolveLocalPath = (input) => path.resolve(expandHome(input));
const isSameOrInside = (parentPath, childPath) => {
    const relative = path.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const getAllFiles = (dirPath, results = []) => {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
        const absolute = path.join(dirPath, entry);
        if (fs.statSync(absolute).isDirectory()) {
            getAllFiles(absolute, results);
        }
        else {
            results.push(absolute);
        }
    }
    return results;
};
const getTotalBytes = (filePaths) => filePaths.reduce((total, filePath) => {
    return total + fs.statSync(filePath).size;
}, 0);
const ensureWritableDestination = (destinationDir) => {
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.accessSync(destinationDir, fs.constants.W_OK);
};
const destinationMatchesSource = (sourcePath, destinationPath) => {
    if (!fs.existsSync(destinationPath)) {
        return false;
    }
    const sourceStat = fs.statSync(sourcePath);
    const destinationStat = fs.statSync(destinationPath);
    return sourceStat.size === destinationStat.size && destinationStat.isFile();
};
const renameIntoPlace = (temporaryPath, destinationPath) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield fs.promises.rename(temporaryPath, destinationPath);
    }
    catch (error) {
        const typedError = error;
        if (typedError.code !== 'EEXIST' && typedError.code !== 'EPERM') {
            throw error;
        }
        yield fs.promises.rm(destinationPath, { force: true });
        yield fs.promises.rename(temporaryPath, destinationPath);
    }
});
const copyFileRecoverably = (sourcePath, destinationPath, preserveMode, progress, ui) => __awaiter(void 0, void 0, void 0, function* () {
    yield fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    const sourceStat = yield fs.promises.stat(sourcePath);
    const temporaryPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.efoy-sync-${process.pid}-${Date.now()}.tmp`);
    try {
        yield new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(sourcePath);
            const writeStream = fs.createWriteStream(temporaryPath, { mode: sourceStat.mode });
            readStream.on('data', (chunk) => {
                progress.transferredBytes += chunk.length;
                (0, progress_1.logByteProgress)(progress, ui);
            });
            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            readStream.pipe(writeStream);
        });
        if (preserveMode) {
            yield fs.promises.chmod(temporaryPath, sourceStat.mode & 0o777);
        }
        yield renameIntoPlace(temporaryPath, destinationPath);
    }
    catch (error) {
        yield fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
});
const uploadViaLocal = (config_1, ui_1, state_2, ...args_1) => __awaiter(void 0, [config_1, ui_1, state_2, ...args_1], void 0, function* (config, ui, state, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    const rawSourceDir = (_b = (_a = options.sourceDir) !== null && _a !== void 0 ? _a : config.sourceDir) !== null && _b !== void 0 ? _b : config.final_folder;
    const rawDestinationDir = (_d = (_c = options.destinationDir) !== null && _c !== void 0 ? _c : config.destinationDir) !== null && _d !== void 0 ? _d : config.destination_folder;
    if (!rawSourceDir || !rawDestinationDir) {
        throw new Error('Invalid run configuration.');
    }
    const sourceDir = resolveLocalPath(rawSourceDir);
    const destinationDir = resolveLocalPath(rawDestinationDir);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error(`Source directory for local upload does not exist: ${sourceDir}`);
    }
    if (isSameOrInside(sourceDir, destinationDir)) {
        throw new Error('Local destination directory must not be the source directory or inside the source directory.');
    }
    const preserveMode = (_f = (_e = options.preserveMode) !== null && _e !== void 0 ? _e : config.preserveMode) !== null && _f !== void 0 ? _f : false;
    ensureWritableDestination(destinationDir);
    const allFiles = getAllFiles(sourceDir);
    const progress = {
        totalFiles: allFiles.length,
        processedFiles: 0,
        totalBytes: getTotalBytes(allFiles),
        transferredBytes: 0,
    };
    ui.step(`Copying files locally from ${sourceDir} to ${destinationDir}`);
    for (let index = 0; index < allFiles.length; index++) {
        const sourcePath = allFiles[index];
        const relativePath = path.relative(sourceDir, sourcePath);
        const destinationPath = path.join(destinationDir, relativePath);
        const progressLabel = progress.totalFiles > 0 ? `[${index + 1}/${progress.totalFiles}] ` : '';
        if (state.uploadedFiles.includes(sourcePath) && destinationMatchesSource(sourcePath, destinationPath)) {
            ui.info(`${progressLabel}Skipping already copied file: ${sourcePath}`);
            progress.processedFiles += 1;
            progress.transferredBytes += fs.statSync(sourcePath).size;
            (0, progress_1.logByteProgress)(progress, ui);
            continue;
        }
        ui.step(`${progressLabel}Copying file: ${sourcePath} to ${destinationPath}`);
        yield copyFileRecoverably(sourcePath, destinationPath, preserveMode, progress, ui);
        if (!state.uploadedFiles.includes(sourcePath)) {
            state.uploadedFiles.push(sourcePath);
        }
        progress.processedFiles += 1;
        (0, state_1.saveState)(state);
        ui.success(`Successfully copied: ${sourcePath}`);
    }
    ui.success('Local file copy completed successfully.');
});
exports.uploadViaLocal = uploadViaLocal;
