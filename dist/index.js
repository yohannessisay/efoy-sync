#!/usr/bin/env node
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const child_process_1 = require("child_process");
const ftp_1 = require("./services/ftp");
const ssh_1 = require("./services/ssh");
const prompt_1 = require("./services/prompt");
const state_1 = require("./services/state");
const expandHomePath = (input) => {
    if (!input.startsWith('~')) {
        return input;
    }
    return path.join(os.homedir(), input.slice(1));
};
const configFilePath = path.join(process.cwd(), 'efoy-sync.json');
const logDir = path.join(process.cwd(), 'efoy-sync-logs');
const getDefaultSourceDir = (config) => { var _a, _b; return (_b = (_a = config.sourceDir) !== null && _a !== void 0 ? _a : config.final_folder) !== null && _b !== void 0 ? _b : ''; };
const getDefaultDestinationDir = (config) => { var _a, _b; return (_b = (_a = config.destinationDir) !== null && _a !== void 0 ? _a : config.destination_folder) !== null && _b !== void 0 ? _b : ''; };
const listLocalFiles = (dirPath, results = []) => {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
        const absolute = path.join(dirPath, entry);
        if (fs.statSync(absolute).isDirectory()) {
            listLocalFiles(absolute, results);
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
const sortObject = (value) => {
    if (Array.isArray(value)) {
        return value.map(sortObject);
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        const result = {};
        for (const [key, entryValue] of entries) {
            result[key] = sortObject(entryValue);
        }
        return result;
    }
    return value;
};
const hashStep = (step, config) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    if (step.type === 'command') {
        const target = (_a = step.target) !== null && _a !== void 0 ? _a : 'local';
        const env = step.env
            ? Object.keys(step.env)
                .sort()
                .reduce((acc, key) => {
                acc[key] = step.env[key];
                return acc;
            }, {})
            : undefined;
        const normalized = {
            type: step.type,
            target,
            command: step.command,
            cwd: step.cwd,
            env,
            ssh: target === 'ssh' ? resolveSshConfig(config, step.ssh) : undefined,
        };
        const payload = JSON.stringify(sortObject(normalized));
        return crypto.createHash('sha256').update(payload).digest('hex');
    }
    const method = (_b = step.method) !== null && _b !== void 0 ? _b : config.method;
    const sourceDir = (_c = step.sourceDir) !== null && _c !== void 0 ? _c : getDefaultSourceDir(config);
    const destinationDir = (_d = step.destinationDir) !== null && _d !== void 0 ? _d : getDefaultDestinationDir(config);
    const preserveMode = (_f = (_e = step.preserveMode) !== null && _e !== void 0 ? _e : config.preserveMode) !== null && _f !== void 0 ? _f : false;
    const uploadStrategy = (_h = (_g = step.uploadStrategy) !== null && _g !== void 0 ? _g : config.uploadStrategy) !== null && _h !== void 0 ? _h : 'files';
    const ftpConfig = {
        FTP_USERNAME: (_k = (_j = step.ftp) === null || _j === void 0 ? void 0 : _j.FTP_USERNAME) !== null && _k !== void 0 ? _k : (_l = config.ftp) === null || _l === void 0 ? void 0 : _l.FTP_USERNAME,
        FTP_PASSWORD: (_o = (_m = step.ftp) === null || _m === void 0 ? void 0 : _m.FTP_PASSWORD) !== null && _o !== void 0 ? _o : (_p = config.ftp) === null || _p === void 0 ? void 0 : _p.FTP_PASSWORD,
        FTP_ADDRESS: (_r = (_q = step.ftp) === null || _q === void 0 ? void 0 : _q.FTP_ADDRESS) !== null && _r !== void 0 ? _r : (_s = config.ftp) === null || _s === void 0 ? void 0 : _s.FTP_ADDRESS,
    };
    const normalized = {
        type: step.type,
        method,
        sourceDir,
        destinationDir,
        preserveMode,
        uploadStrategy,
        ftp: method === 'ftp' ? ftpConfig : undefined,
        ssh: method === 'ssh' ? resolveSshConfig(config, step.ssh) : undefined,
    };
    const payload = JSON.stringify(sortObject(normalized));
    return crypto.createHash('sha256').update(payload).digest('hex');
};
const normalizeCompletedSteps = (completedSteps, stepHashes) => {
    const hashSet = new Set(stepHashes);
    const resolved = new Set();
    for (const entry of completedSteps) {
        if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < stepHashes.length) {
            resolved.add(stepHashes[entry]);
            continue;
        }
        if (typeof entry === 'string' && hashSet.has(entry)) {
            resolved.add(entry);
        }
    }
    return Array.from(resolved);
};
const ui = {
    colors: {
        reset: "\x1b[0m",
        green: "\x1b[32m",
        red: "\x1b[31m",
        blue: "\x1b[34m",
        yellow: "\x1b[33m",
        cyan: "\x1b[36m",
    },
    icons: {
        rocket: '🚀',
        gear: '⚙️',
        success: '✓',
        error: '✗',
        info: 'ℹ️',
        warn: '⚠️',
        sync: '🔄',
        upload: '📤',
        connect: '🔌',
        build: '🛠️',
        finish: '🎉',
        cancel: '🛑',
    },
    log: (message, icon = ' ', color = ui.colors.reset) => {
        const coloredMessage = `${color}${icon} ${message}${ui.colors.reset}`;
        console.log(coloredMessage);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }
        const logFile = path.join(logDir, `log-${new Date().toISOString().split('T')[0]}.txt`);
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    },
    info: (message) => ui.log(message, ui.icons.info, ui.colors.blue),
    success: (message) => ui.log(message, ui.icons.success, ui.colors.green),
    error: (message) => ui.log(message, ui.icons.error, ui.colors.red),
    warn: (message) => ui.log(message, ui.icons.warn, ui.colors.yellow),
    step: (message) => ui.log(message, ui.icons.gear, ui.colors.cyan),
};
const handleError = (error) => {
    let errorMessage = error.message;
    // Check for common configuration-related errors
    const configErrorPatterns = [
        /Could not resolve hostname/i,
        /Identity file .* not accessible/i,
        /Permission denied/i,
        /scp: Connection closed/i,
        /Invalid PASV response/i,
        /FTP user command failed/i,
        /FTP pass command failed/i,
        /FTP response timeout/i,
        /FTP STOR command failed/i,
        /Failed to create directory/i,
        /Unexpected FTP welcome message/i,
        /Missing required fields in efoy-sync.json/i,
        /Invalid deployment method specified in efoy-sync.json/i,
        /Invalid upload strategy specified in efoy-sync.json/i,
        /FTP configuration is missing or incomplete/i,
        /Source directory for FTP upload does not exist/i,
        /Source directory for SSH upload does not exist/i,
        /SSH configuration is missing/i,
        /SSH authentication is missing/i,
        /sshpass/i,
        /Invalid run step definition/i,
        /Unsupported run step type/i,
        /Invalid run configuration/i,
    ];
    const isConfigError = configErrorPatterns.some(pattern => pattern.test(errorMessage));
    if (isConfigError) {
        ui.error('It looks like there\'s a problem with your efoy-sync.json configuration. Please double-check your server address, username, password, and private key path for the selected deployment method (FTP or SSH).');
        ui.info(`Original error details: ${errorMessage}`);
    }
    else {
        ui.error(`An unexpected error occurred: ${errorMessage}`);
    }
    process.exit(1);
};
const runCommand = (command, options = {}) => {
    return new Promise((resolve, reject) => {
        var _a, _b;
        ui.step(`Running command: ${command}`);
        const spawnOptions = {
            cwd: options.cwd,
            env: options.env ? Object.assign(Object.assign({}, process.env), options.env) : process.env,
            shell: true,
        };
        const buildProcess = (0, child_process_1.spawn)(command, [], spawnOptions);
        (_a = buildProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => ui.info(data.toString()));
        (_b = buildProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => ui.warn(data.toString()));
        buildProcess.on('close', (code) => {
            if (code === 0) {
                ui.success('Build command completed successfully.');
                resolve();
            }
            else {
                reject(new Error(`Build command failed with exit code ${code}`));
            }
        });
        buildProcess.on('error', (error) => reject(error));
    });
};
const resolveSshConfig = (config, overrides) => {
    var _a, _b, _c, _d, _e, _f;
    const base = config.ssh;
    if (!base && !overrides) {
        throw new Error('SSH configuration is missing.');
    }
    const resolved = {
        host: (_b = (_a = overrides === null || overrides === void 0 ? void 0 : overrides.host) !== null && _a !== void 0 ? _a : base === null || base === void 0 ? void 0 : base.host) !== null && _b !== void 0 ? _b : '',
        username: (_d = (_c = overrides === null || overrides === void 0 ? void 0 : overrides.username) !== null && _c !== void 0 ? _c : base === null || base === void 0 ? void 0 : base.username) !== null && _d !== void 0 ? _d : '',
        privateKey: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.privateKey) !== null && _e !== void 0 ? _e : base === null || base === void 0 ? void 0 : base.privateKey,
        password: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.password) !== null && _f !== void 0 ? _f : base === null || base === void 0 ? void 0 : base.password,
    };
    if (!resolved.host || !resolved.username) {
        throw new Error('SSH configuration is missing.');
    }
    if (!resolved.privateKey && !resolved.password) {
        throw new Error('SSH authentication is missing.');
    }
    return resolved;
};
const runRemoteCommand = (command, config, step) => {
    const ssh = resolveSshConfig(config, step.ssh);
    return new Promise((resolve, reject) => {
        var _a, _b;
        const spawnOptions = {
            env: step.env ? Object.assign(Object.assign({}, process.env), step.env) : process.env,
        };
        const remoteProcess = (0, ssh_1.createSshProcess)(ssh, command, spawnOptions);
        const usesPassword = Boolean(ssh.password && !ssh.privateKey);
        (_a = remoteProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => ui.info(data.toString()));
        (_b = remoteProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => ui.warn(data.toString()));
        remoteProcess.on('close', (code) => {
            if (code === 0) {
                ui.success('Remote command completed successfully.');
                resolve();
            }
            else {
                reject(new Error(`Remote command failed with exit code ${code}`));
            }
        });
        remoteProcess.on('error', (error) => {
            const typedError = error;
            if (usesPassword && typedError.code === 'ENOENT') {
                reject(new Error('SSH password authentication requires sshpass. Install sshpass or use privateKey.'));
                return;
            }
            reject(error);
        });
    });
};
const uploadViaFtp = (config_1, ui_1, state_2, ...args_1) => __awaiter(void 0, [config_1, ui_1, state_2, ...args_1], void 0, function* (config, ui, state, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const baseFtp = config.ftp;
    const mergedFtp = {
        FTP_USERNAME: (_b = (_a = options.ftp) === null || _a === void 0 ? void 0 : _a.FTP_USERNAME) !== null && _b !== void 0 ? _b : baseFtp === null || baseFtp === void 0 ? void 0 : baseFtp.FTP_USERNAME,
        FTP_PASSWORD: (_d = (_c = options.ftp) === null || _c === void 0 ? void 0 : _c.FTP_PASSWORD) !== null && _d !== void 0 ? _d : baseFtp === null || baseFtp === void 0 ? void 0 : baseFtp.FTP_PASSWORD,
        FTP_ADDRESS: (_f = (_e = options.ftp) === null || _e === void 0 ? void 0 : _e.FTP_ADDRESS) !== null && _f !== void 0 ? _f : baseFtp === null || baseFtp === void 0 ? void 0 : baseFtp.FTP_ADDRESS,
    };
    if (!mergedFtp.FTP_ADDRESS || !mergedFtp.FTP_USERNAME || !mergedFtp.FTP_PASSWORD) {
        throw new Error('FTP configuration is missing or incomplete.');
    }
    const sourceDir = (_g = options.sourceDir) !== null && _g !== void 0 ? _g : getDefaultSourceDir(config);
    const destinationDir = (_h = options.destinationDir) !== null && _h !== void 0 ? _h : getDefaultDestinationDir(config);
    if (!sourceDir || !destinationDir) {
        throw new Error('Invalid run configuration.');
    }
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error(`Source directory for FTP upload does not exist: ${sourceDir}`);
    }
    const client = new ftp_1.CustomFtpClient(mergedFtp.FTP_ADDRESS);
    try {
        ui.step('Connecting to FTP server...');
        yield client.connect(mergedFtp.FTP_USERNAME, mergedFtp.FTP_PASSWORD);
        ui.success('FTP connection successful.');
        ui.step(`Uploading files from ${sourceDir} to ${destinationDir}`);
        yield client.ensureDir(destinationDir);
        const totalFiles = listLocalFiles(sourceDir);
        const totalBytes = getTotalBytes(totalFiles);
        const progress = {
            totalFiles: totalFiles.length,
            processedFiles: 0,
            totalBytes,
            transferredBytes: 0,
        };
        yield client.uploadFromDir(sourceDir, destinationDir, state, ui, progress);
        ui.success('File upload completed successfully.');
    }
    catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
    }
    finally {
        client.close();
    }
});
const createCommandStep = (command) => ({
    type: 'command',
    command,
    target: 'local',
});
const normalizeRunSteps = (run) => {
    if (!run) {
        return [];
    }
    const entries = (Array.isArray(run) ? run : [run]);
    return entries.map((entry, index) => {
        var _a, _b, _c;
        if (typeof entry === 'string') {
            return createCommandStep(entry);
        }
        if (entry && typeof entry === 'object') {
            const candidate = entry;
            const inferredType = typeof candidate.type === 'string'
                ? candidate.type
                : typeof candidate.command === 'string'
                    ? 'command'
                    : undefined;
            if (!inferredType) {
                throw new Error(`Invalid run step definition at index ${index}. Missing 'type'.`);
            }
            if (inferredType === 'command') {
                const command = candidate.command;
                if (typeof command !== 'string' || command.trim() === '') {
                    throw new Error(`Invalid command step at index ${index}. 'command' must be a non-empty string.`);
                }
                const order = candidate.order;
                if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
                    throw new Error(`Invalid command step at index ${index}. 'order' must be a number.`);
                }
                const env = candidate.env;
                const envRecord = env && typeof env === 'object'
                    ? env
                    : undefined;
                const sshOverride = candidate.ssh && typeof candidate.ssh === 'object'
                    ? candidate.ssh
                    : undefined;
                const commandStep = {
                    type: 'command',
                    command,
                    target: (_a = candidate.target) !== null && _a !== void 0 ? _a : 'local',
                    name: candidate.name,
                    description: candidate.description,
                    order: order,
                    cwd: candidate.cwd,
                    env: envRecord,
                    ssh: sshOverride,
                };
                if (candidate.continueOnError === true) {
                    commandStep.continueOnError = true;
                }
                return commandStep;
            }
            if (inferredType === 'upload') {
                const order = candidate.order;
                if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
                    throw new Error(`Invalid upload step at index ${index}. 'order' must be a number.`);
                }
                const rawSourceDir = (_b = candidate.sourceDir) !== null && _b !== void 0 ? _b : candidate.source;
                if (rawSourceDir !== undefined && typeof rawSourceDir !== 'string') {
                    throw new Error(`Invalid upload step at index ${index}. 'sourceDir' must be a string.`);
                }
                const rawDestinationDir = (_c = candidate.destinationDir) !== null && _c !== void 0 ? _c : candidate.destination;
                if (rawDestinationDir !== undefined && typeof rawDestinationDir !== 'string') {
                    throw new Error(`Invalid upload step at index ${index}. 'destinationDir' must be a string.`);
                }
                const preserveMode = candidate.preserveMode;
                if (preserveMode !== undefined && typeof preserveMode !== 'boolean') {
                    throw new Error(`Invalid upload step at index ${index}. 'preserveMode' must be a boolean.`);
                }
                const uploadStrategy = candidate.uploadStrategy;
                if (uploadStrategy !== undefined && uploadStrategy !== 'files' && uploadStrategy !== 'tar') {
                    throw new Error(`Invalid upload step at index ${index}. 'uploadStrategy' must be 'files' or 'tar'.`);
                }
                const sshOverride = candidate.ssh && typeof candidate.ssh === 'object'
                    ? candidate.ssh
                    : undefined;
                const ftpOverride = candidate.ftp && typeof candidate.ftp === 'object'
                    ? candidate.ftp
                    : undefined;
                const uploadStep = {
                    type: 'upload',
                    sourceDir: rawSourceDir,
                    destinationDir: rawDestinationDir,
                    method: candidate.method,
                    name: candidate.name,
                    description: candidate.description,
                    order: order,
                    preserveMode: preserveMode,
                    uploadStrategy: uploadStrategy,
                    ssh: sshOverride,
                    ftp: ftpOverride,
                };
                if (candidate.continueOnError === true) {
                    uploadStep.continueOnError = true;
                }
                return uploadStep;
            }
            throw new Error(`Unsupported run step type: ${String(inferredType)}`);
        }
        throw new Error(`Invalid run step definition at index ${index}.`);
    });
};
const sortRunSteps = (steps) => {
    const indexed = steps.map((step, index) => ({ step, index }));
    const hasOrder = indexed.some(entry => typeof entry.step.order === 'number');
    if (!hasOrder) {
        return steps;
    }
    return indexed
        .sort((a, b) => {
        const aOrder = typeof a.step.order === 'number' ? a.step.order : Number.POSITIVE_INFINITY;
        const bOrder = typeof b.step.order === 'number' ? b.step.order : Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) {
            return aOrder - bOrder;
        }
        return a.index - b.index;
    })
        .map(entry => entry.step);
};
const describeStep = (step, config) => {
    var _a, _b, _c, _d;
    if (step.description) {
        return step.description;
    }
    if (step.type === 'command') {
        const location = ((_a = step.target) !== null && _a !== void 0 ? _a : 'local') === 'ssh' ? 'remote (ssh)' : 'local';
        return `${location} command: ${step.command}`;
    }
    const method = ((_b = step.method) !== null && _b !== void 0 ? _b : config.method).toUpperCase();
    const source = (_c = step.sourceDir) !== null && _c !== void 0 ? _c : getDefaultSourceDir(config);
    const destination = (_d = step.destinationDir) !== null && _d !== void 0 ? _d : getDefaultDestinationDir(config);
    return `Upload via ${method} from ${source} to ${destination}`;
};
const executeRunStep = (step, stepIndex, config, state) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const label = (_a = step.name) !== null && _a !== void 0 ? _a : describeStep(step, config);
    ui.step(`Step ${stepIndex + 1}: ${label}`);
    if (step.type === 'command') {
        if (((_b = step.target) !== null && _b !== void 0 ? _b : 'local') === 'ssh') {
            yield runRemoteCommand(step.command, config, step);
        }
        else {
            yield runCommand(step.command, { cwd: step.cwd, env: step.env });
        }
        return;
    }
    const method = (_c = step.method) !== null && _c !== void 0 ? _c : config.method;
    if (method === 'ftp') {
        yield uploadViaFtp(config, ui, state, {
            sourceDir: step.sourceDir,
            destinationDir: step.destinationDir,
            ftp: step.ftp,
        });
        return;
    }
    if (method === 'ssh') {
        const options = {
            sourceDir: step.sourceDir,
            destinationDir: step.destinationDir,
            ssh: step.ssh,
            preserveMode: step.preserveMode,
            uploadStrategy: step.uploadStrategy,
        };
        yield (0, ssh_1.uploadViaSsh)(config, ui, state, options);
        return;
    }
    throw new Error(`Unsupported upload method: ${method}`);
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    ui.log('🚀 Starting efoy-sync...', ui.icons.rocket, ui.colors.cyan);
    const state = (0, state_1.loadState)();
    if (state.uploadedFiles.length > 0 || state.completedSteps.length > 0) {
        const uploadedSummary = state.uploadedFiles.length > 0
            ? `${state.uploadedFiles.length} file(s) already uploaded`
            : 'no files uploaded yet';
        const completedSummary = state.completedSteps.length > 0
            ? `${state.completedSteps.length} step(s) completed`
            : 'no steps recorded';
        ui.warn(`Unfinished session detected (${uploadedSummary}, ${completedSummary}).`);
        const resume = yield (0, prompt_1.confirm)('Do you want to resume the previous session?');
        if (!resume) {
            (0, state_1.clearState)();
            state.uploadedFiles = [];
            state.completedSteps = [];
            ui.info('Previous session cleared. Starting a fresh deployment.');
        }
        else {
            ui.info('Resuming previous session.');
        }
    }
    const defaultConfigContent = JSON.stringify({
        "run": [
            {
                "name": "Build project",
                "order": 1,
                "command": "npm run build",
                "target": "local"
            },
            {
                "type": "upload",
                "name": "Upload build",
                "order": 2
            }
        ],
        "sourceDir": "dist",
        "destinationDir": "/var/www/html",
        "method": "ssh",
        "ssh": {
            "host": "your_server_ip",
            "username": "your_username",
            "privateKey": "~/.ssh/id_rsa"
        },
        "ftp": {
            "FTP_USERNAME": "your_ftp_username",
            "FTP_PASSWORD": "your_ftp_password",
            "FTP_ADDRESS": "your_ftp_server"
        }
    }, null, 2);
    if (!fs.existsSync(configFilePath)) {
        ui.warn('efoy-sync.json not found.');
        const createConfig = yield (0, prompt_1.confirm)('efoy-sync will now create the config file (efoy-sync.json) in your project root. Continue?');
        if (createConfig) {
            try {
                fs.writeFileSync(configFilePath, defaultConfigContent);
                ui.success('efoy-sync.json created successfully. Please edit it with your deployment details.');
            }
            catch (error) {
                ui.error(`Error creating efoy-sync.json: ${error.message}`);
                process.exit(1);
            }
        }
        else {
            ui.info('efoy-sync.json creation skipped. You can create it manually later.');
            process.exit(0);
        }
    }
    const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    const method = config.method;
    if (!method) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }
    if (config.uploadStrategy && config.uploadStrategy !== 'files' && config.uploadStrategy !== 'tar') {
        handleError(new Error('Invalid upload strategy specified in efoy-sync.json'));
    }
    let normalizedSteps = [];
    try {
        normalizedSteps = normalizeRunSteps(config.run);
    }
    catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)));
    }
    const hasUploadStep = normalizedSteps.some(step => step.type === 'upload');
    if (!hasUploadStep) {
        normalizedSteps.push({ type: 'upload' });
    }
    normalizedSteps = sortRunSteps(normalizedSteps);
    const missingUploadDefaults = normalizedSteps
        .filter(step => step.type === 'upload')
        .some(step => {
        var _a, _b;
        const source = (_a = step.sourceDir) !== null && _a !== void 0 ? _a : getDefaultSourceDir(config);
        const destination = (_b = step.destinationDir) !== null && _b !== void 0 ? _b : getDefaultDestinationDir(config);
        return !source || !destination;
    });
    if (missingUploadDefaults) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }
    let stepHashes = [];
    try {
        stepHashes = normalizedSteps.map(step => hashStep(step, config));
    }
    catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)));
    }
    state.completedSteps = normalizeCompletedSteps(state.completedSteps, stepHashes);
    ui.info('Planned actions:');
    normalizedSteps.forEach((step, index) => {
        ui.info(`${index + 1}. ${describeStep(step, config)}`);
    });
    const proceed = yield (0, prompt_1.confirm)(`You are about to execute ${normalizedSteps.length} step(s) using ${method}. Do you want to proceed?`);
    if (!proceed) {
        ui.log('🛑 Deployment cancelled by user.', ui.icons.cancel, ui.colors.yellow);
        return;
    }
    try {
        for (let i = 0; i < normalizedSteps.length; i++) {
            const step = normalizedSteps[i];
            const stepHash = stepHashes[i];
            if (state.completedSteps.includes(stepHash)) {
                ui.info(`Skipping step ${i + 1}; already completed in previous session.`);
                continue;
            }
            try {
                yield executeRunStep(step, i, config, state);
                if (!state.completedSteps.includes(stepHash)) {
                    state.completedSteps.push(stepHash);
                }
                (0, state_1.saveState)(state);
            }
            catch (stepError) {
                if (step.continueOnError) {
                    ui.warn(`Step ${i + 1} failed but continueOnError is true. Error: ${stepError.message}`);
                    if (!state.completedSteps.includes(stepHash)) {
                        state.completedSteps.push(stepHash);
                    }
                    (0, state_1.saveState)(state);
                    continue;
                }
                throw stepError;
            }
        }
    }
    catch (error) {
        handleError(error);
    }
    (0, state_1.clearState)();
    ui.log('🎉 Deployment finished successfully!', ui.icons.finish, ui.colors.green);
});
main().catch(handleError);
