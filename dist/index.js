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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const inquirer_1 = __importDefault(require("inquirer"));
const ftp_1 = require("./services/ftp");
const configFilePath = path.join(process.cwd(), 'efoy-sync.json');
const logDir = path.join(process.cwd(), 'efoy-sync-logs');
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
    ui.error(`An unexpected error occurred: ${error.message}`);
    process.exit(1);
};
const runBuildCommand = (command) => {
    return new Promise((resolve, reject) => {
        var _a, _b;
        ui.step(`Running build command: ${command}`);
        const buildProcess = (0, child_process_1.exec)(command);
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
    });
};
const uploadViaFtp = (config) => __awaiter(void 0, void 0, void 0, function* () {
    const client = new ftp_1.CustomFtpClient(config.ftp.FTP_ADDRESS);
    try {
        ui.step('Connecting to FTP server...');
        yield client.connect(config.ftp.FTP_USERNAME, config.ftp.FTP_PASSWORD);
        ui.success('FTP connection successful.');
        ui.step(`Uploading files from ${config.final_folder} to ${config.destination_folder}`);
        yield client.ensureDir(config.destination_folder);
        yield client.uploadFromDir(config.final_folder, config.destination_folder);
        ui.success('File upload completed successfully.');
    }
    catch (err) {
        handleError(err);
    }
    finally {
        client.close();
    }
});
const uploadViaSsh = (config) => __awaiter(void 0, void 0, void 0, function* () {
    const { host, username, privateKey } = config.ssh;
    const sourceDir = `${config.final_folder}/.`;
    const scpCommand = `scp -r -i ${privateKey} "${sourceDir}" ${username}@${host}:"${config.destination_folder}"`;
    return new Promise((resolve, reject) => {
        ui.step('Uploading files via SCP...');
        (0, child_process_1.exec)(scpCommand, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = `SCP failed with error: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`;
                ui.error(errorMessage);
                return reject(new Error(errorMessage));
            }
            if (stderr) {
                ui.warn(`SCP stderr (non-fatal): ${stderr}`);
            }
            ui.info(`SCP stdout: ${stdout}`);
            ui.success('File upload completed successfully.');
            resolve();
        });
    });
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    ui.log('🚀 Starting efoy-sync...', ui.icons.rocket, ui.colors.cyan);
    if (!fs.existsSync(configFilePath)) {
        ui.error('efoy-sync.json not found. Please create it in your project root.');
        return;
    }
    const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    if (config.run) {
        yield runBuildCommand(config.run);
    }
    const { final_folder, destination_folder, method } = config;
    if (!final_folder || !destination_folder || !method) {
        handleError(new Error('Missing required fields in efoy-sync.json'));
    }
    const questions = [
        {
            type: 'confirm',
            name: 'proceed',
            message: `You are about to sync the contents of '${final_folder}' to '${destination_folder}' on the remote server using ${method}. Do you want to proceed?`,
            default: true,
        },
    ];
    const answers = yield inquirer_1.default.prompt(questions);
    if (answers.proceed) {
        ui.step(`Starting deployment via ${method}...`);
        if (method === 'ftp') {
            yield uploadViaFtp(config);
        }
        else if (method === 'ssh') {
            yield uploadViaSsh(config);
        }
        else {
            handleError(new Error('Invalid deployment method specified in efoy-sync.json'));
        }
        ui.log('🎉 Deployment finished successfully!', ui.icons.finish, ui.colors.green);
    }
    else {
        ui.log('🛑 Deployment cancelled by user.', ui.icons.cancel, ui.colors.yellow);
    }
});
main().catch(handleError);
