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
exports.uploadViaSsh = exports.createSshProcess = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const state_1 = require("./state");
const progress_1 = require("./progress");
const toPosix = (value) => value.split(path.sep).join(path.posix.sep);
const expandHome = (input) => {
    if (!input.startsWith('~')) {
        return input;
    }
    const trimmed = input.slice(1);
    const home = os.homedir();
    return path.join(home, trimmed);
};
const escapeDoubleQuotes = (value) => value.replace(/(["\\$`])/g, '\\$1');
const getTotalBytes = (filePaths) => filePaths.reduce((total, filePath) => {
    return total + fs.statSync(filePath).size;
}, 0);
const getTarArchiveSize = (sourceDir) => {
    return new Promise((resolve, reject) => {
        var _a, _b;
        const tarProcess = (0, child_process_1.spawn)('tar', ['-czf', '-', '-C', sourceDir, '.']);
        let totalBytes = 0;
        let stderrBuffer = '';
        (_a = tarProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (chunk) => {
            totalBytes += chunk.length;
        });
        (_b = tarProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
            stderrBuffer += data.toString();
        });
        tarProcess.on('error', (error) => reject(error));
        tarProcess.on('close', (code) => {
            if (code === 0) {
                resolve(totalBytes);
                return;
            }
            reject(new Error(stderrBuffer.trim() || `tar exited with code ${code}`));
        });
    });
};
const getAllFiles = (dirPath, arrayOfFiles = []) => {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const absolute = path.join(dirPath, file);
        if (fs.statSync(absolute).isDirectory()) {
            getAllFiles(absolute, arrayOfFiles);
        }
        else {
            arrayOfFiles.push(absolute);
        }
    }
    return arrayOfFiles;
};
const resolveSshCredentials = (base, overrides) => {
    var _a, _b, _c, _d;
    return ({
        host: (_a = overrides === null || overrides === void 0 ? void 0 : overrides.host) !== null && _a !== void 0 ? _a : base.host,
        username: (_b = overrides === null || overrides === void 0 ? void 0 : overrides.username) !== null && _b !== void 0 ? _b : base.username,
        privateKey: (_c = overrides === null || overrides === void 0 ? void 0 : overrides.privateKey) !== null && _c !== void 0 ? _c : base.privateKey,
        password: (_d = overrides === null || overrides === void 0 ? void 0 : overrides.password) !== null && _d !== void 0 ? _d : base.password,
    });
};
const hasPrivateKey = (credentials) => {
    return Boolean(credentials.privateKey && credentials.privateKey.trim());
};
const hasPassword = (credentials) => Boolean(credentials.password);
const ensureSshAuth = (credentials) => {
    if (!hasPrivateKey(credentials) && !hasPassword(credentials)) {
        throw new Error('SSH authentication is missing.');
    }
};
const buildSshArgs = (credentials, command) => {
    const sshTarget = `${credentials.username}@${credentials.host}`;
    const args = [];
    if (hasPrivateKey(credentials) && credentials.privateKey) {
        const privateKeyPath = expandHome(credentials.privateKey);
        args.push('-i', privateKeyPath);
    }
    args.push(sshTarget, command);
    return args;
};
const mapSpawnError = (error, credentials) => {
    if (error.code === 'ENOENT' && hasPassword(credentials) && !hasPrivateKey(credentials)) {
        return new Error('SSH password authentication requires sshpass. Install sshpass or use privateKey.');
    }
    return error;
};
const createSshProcess = (credentials, command, options = {}) => {
    ensureSshAuth(credentials);
    const args = buildSshArgs(credentials, command);
    if (hasPassword(credentials) && !hasPrivateKey(credentials)) {
        return (0, child_process_1.spawn)('sshpass', ['-p', credentials.password, 'ssh', ...args], {
            env: options.env,
        });
    }
    return (0, child_process_1.spawn)('ssh', args, { env: options.env });
};
exports.createSshProcess = createSshProcess;
const uploadViaSshTar = (sourceDir, destinationDir, credentials, preserveMode, ui, state) => __awaiter(void 0, void 0, void 0, function* () {
    const allFiles = getAllFiles(sourceDir);
    let totalBytes = 0;
    try {
        ui.info('Calculating archive size for progress...');
        totalBytes = yield getTarArchiveSize(sourceDir);
    }
    catch (error) {
        ui.warn(`Archive size estimate failed, falling back to file sizes. Error: ${error.message}`);
        totalBytes = getTotalBytes(allFiles);
    }
    const progress = {
        totalBytes,
        transferredBytes: 0,
    };
    yield new Promise((resolve, reject) => {
        var _a, _b, _c;
        const escapedDest = escapeDoubleQuotes(destinationDir);
        const extractArgs = preserveMode
            ? `tar -xzf - -p -C "${escapedDest}"`
            : `tar -xzf - -C "${escapedDest}"`;
        const remoteCommand = `mkdir -p "${escapedDest}" && ${extractArgs}`;
        const sshProcess = (0, exports.createSshProcess)(credentials, remoteCommand);
        const tarProcess = (0, child_process_1.spawn)('tar', ['-czf', '-', '-C', sourceDir, '.']);
        let sshStderr = '';
        let tarStderr = '';
        let sshCode = null;
        let tarCode = null;
        const finalize = () => {
            if (sshCode === null || tarCode === null) {
                return;
            }
            if (sshCode === 0 && tarCode === 0) {
                progress.transferredBytes = progress.totalBytes;
                (0, progress_1.logByteProgress)(progress, ui);
                state.uploadedFiles = allFiles;
                (0, state_1.saveState)(state);
                resolve();
                return;
            }
            const details = [
                sshStderr.trim() ? `SSH: ${sshStderr.trim()}` : '',
                tarStderr.trim() ? `tar: ${tarStderr.trim()}` : '',
            ].filter(Boolean).join(' | ');
            reject(new Error(details || `SSH/tar upload failed (ssh=${sshCode}, tar=${tarCode}).`));
        };
        (_a = sshProcess.stderr) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
            sshStderr += data.toString();
        });
        (_b = tarProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
            tarStderr += data.toString();
        });
        sshProcess.on('error', (error) => reject(mapSpawnError(error, credentials)));
        tarProcess.on('error', (error) => {
            sshProcess.kill();
            reject(error);
        });
        (_c = tarProcess.stdout) === null || _c === void 0 ? void 0 : _c.on('data', (chunk) => {
            progress.transferredBytes += chunk.length;
            (0, progress_1.logByteProgress)(progress, ui);
        });
        if (!sshProcess.stdin || !tarProcess.stdout) {
            tarProcess.kill();
            sshProcess.kill();
            reject(new Error('SSH upload failed to initialize streams.'));
            return;
        }
        sshProcess.stdin.on('error', (error) => {
            tarProcess.kill();
            reject(new Error(`SSH upload failed: ${error.message}`));
        });
        tarProcess.stdout.pipe(sshProcess.stdin);
        tarProcess.on('close', (code) => {
            tarCode = code !== null && code !== void 0 ? code : 1;
            if (sshProcess.stdin) {
                sshProcess.stdin.end();
            }
            finalize();
        });
        sshProcess.on('close', (code) => {
            sshCode = code !== null && code !== void 0 ? code : 1;
            finalize();
        });
    });
});
const uploadViaSsh = (config_1, ui_1, state_2, ...args_1) => __awaiter(void 0, [config_1, ui_1, state_2, ...args_1], void 0, function* (config, ui, state, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const baseCredentials = config.ssh;
    if (!baseCredentials) {
        throw new Error('SSH configuration is missing.');
    }
    const credentials = resolveSshCredentials(baseCredentials, options.ssh);
    ensureSshAuth(credentials);
    const sourceDir = (_b = (_a = options.sourceDir) !== null && _a !== void 0 ? _a : config.sourceDir) !== null && _b !== void 0 ? _b : config.final_folder;
    const remoteDestinationFolder = toPosix((_e = (_d = (_c = options.destinationDir) !== null && _c !== void 0 ? _c : config.destinationDir) !== null && _d !== void 0 ? _d : config.destination_folder) !== null && _e !== void 0 ? _e : '');
    if (!sourceDir || !remoteDestinationFolder) {
        throw new Error('Invalid run configuration.');
    }
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error(`Source directory for SSH upload does not exist: ${sourceDir}`);
    }
    const preserveMode = (_g = (_f = options.preserveMode) !== null && _f !== void 0 ? _f : config.preserveMode) !== null && _g !== void 0 ? _g : false;
    const uploadStrategy = (_j = (_h = options.uploadStrategy) !== null && _h !== void 0 ? _h : config.uploadStrategy) !== null && _j !== void 0 ? _j : 'files';
    if (uploadStrategy === 'tar') {
        yield uploadViaSshTar(sourceDir, remoteDestinationFolder, credentials, preserveMode, ui, state);
        return;
    }
    const allFiles = getAllFiles(sourceDir);
    const totalFiles = allFiles.length;
    const progress = {
        totalBytes: getTotalBytes(allFiles),
        transferredBytes: 0,
    };
    for (let index = 0; index < allFiles.length; index++) {
        const localPath = allFiles[index];
        const progressLabel = totalFiles > 0 ? `[${index + 1}/${totalFiles}] ` : '';
        if (state.uploadedFiles.includes(localPath)) {
            ui.info(`${progressLabel}Skipping already uploaded file: ${localPath}`);
            const fileSize = fs.statSync(localPath).size;
            progress.transferredBytes += fileSize;
            (0, progress_1.logByteProgress)(progress, ui);
            continue;
        }
        const relativePath = toPosix(path.relative(sourceDir, localPath));
        const remotePath = toPosix(path.posix.join(remoteDestinationFolder, relativePath));
        const remoteDirPath = path.posix.dirname(remotePath);
        const remoteMkdirCommand = `mkdir -p "${escapeDoubleQuotes(remoteDirPath)}"`;
        yield new Promise((resolve, reject) => {
            var _a;
            const mkdirProcess = (0, exports.createSshProcess)(credentials, remoteMkdirCommand);
            let stderrBuffer = '';
            (_a = mkdirProcess.stderr) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                stderrBuffer += data.toString();
            });
            mkdirProcess.on('error', (error) => reject(mapSpawnError(error, credentials)));
            mkdirProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`Failed to create remote directory: ${stderrBuffer.trim() || `exit code ${code}`}`));
            });
        });
        yield new Promise((resolve, reject) => {
            var _a;
            ui.step(`${progressLabel}Uploading ${localPath} to ${remotePath}`);
            const remoteWriteCommand = `cat > "${escapeDoubleQuotes(remotePath)}"`;
            const sshProcess = (0, exports.createSshProcess)(credentials, remoteWriteCommand);
            let stderrBuffer = '';
            (_a = sshProcess.stderr) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                stderrBuffer += data.toString();
            });
            sshProcess.on('error', (error) => reject(mapSpawnError(error, credentials)));
            const readStream = fs.createReadStream(localPath);
            readStream.on('data', (chunk) => {
                progress.transferredBytes += chunk.length;
                (0, progress_1.logByteProgress)(progress, ui);
            });
            readStream.on('error', (error) => {
                sshProcess.kill();
                reject(error);
            });
            sshProcess.on('close', (code) => {
                if (code === 0) {
                    state.uploadedFiles.push(localPath);
                    (0, state_1.saveState)(state);
                    ui.success(`Successfully uploaded: ${localPath}`);
                    resolve();
                    return;
                }
                const details = stderrBuffer.trim();
                reject(new Error(`SSH upload failed for ${localPath}: ${details || `exit code ${code}`}`));
            });
            if (!sshProcess.stdin) {
                sshProcess.kill();
                reject(new Error('SSH upload failed to initialize stdin.'));
                return;
            }
            sshProcess.stdin.on('error', (error) => {
                reject(new Error(`SSH upload failed for ${localPath}: ${error.message}`));
            });
            readStream.pipe(sshProcess.stdin);
        });
        if (preserveMode) {
            const mode = (fs.statSync(localPath).mode & 0o777).toString(8);
            const chmodCommand = `chmod ${mode} "${escapeDoubleQuotes(remotePath)}"`;
            yield new Promise((resolve, reject) => {
                var _a;
                const chmodProcess = (0, exports.createSshProcess)(credentials, chmodCommand);
                let stderrBuffer = '';
                (_a = chmodProcess.stderr) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                    stderrBuffer += data.toString();
                });
                chmodProcess.on('error', (error) => reject(mapSpawnError(error, credentials)));
                chmodProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                        return;
                    }
                    reject(new Error(`Failed to preserve permissions for ${localPath}: ${stderrBuffer.trim() || `exit code ${code}`}`));
                });
            });
        }
    }
});
exports.uploadViaSsh = uploadViaSsh;
