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
const basic_ftp_1 = require("basic-ftp");
const node_ssh_1 = require("node-ssh");
const inquirer_1 = __importDefault(require("inquirer"));
const configFilePath = path.join(process.cwd(), 'efoy-sync.json');
const logDir = path.join(process.cwd(), 'efoy-sync-logs');
const log = (message) => {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }
    const logFile = path.join(logDir, `log-${new Date().toISOString().split('T')[0]}.txt`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    console.log(message);
};
const handleError = (error) => {
    log(`ERROR: ${error.message}`);
    process.exit(1);
};
const runBuildCommand = (command) => {
    return new Promise((resolve, reject) => {
        var _a, _b;
        log(`Running build command: ${command}`);
        const buildProcess = (0, child_process_1.exec)(command);
        (_a = buildProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => console.log(data.toString()));
        (_b = buildProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => console.error(data.toString()));
        buildProcess.on('close', (code) => {
            if (code === 0) {
                log('Build command completed successfully.');
                resolve();
            }
            else {
                reject(new Error(`Build command failed with exit code ${code}`));
            }
        });
    });
};
const uploadViaFtp = (config) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const client = new basic_ftp_1.Client();
    client.ftp.verbose = true;
    try {
        log('Connecting to FTP server...');
        yield client.access({
            host: (_a = config.ftp) === null || _a === void 0 ? void 0 : _a.FTP_ADDRESS,
            user: (_b = config.ftp) === null || _b === void 0 ? void 0 : _b.FTP_USERNAME,
            password: (_c = config.ftp) === null || _c === void 0 ? void 0 : _c.FTP_PASSWORD,
        });
        log('FTP connection successful.');
        log(`Uploading files from ${config.final_folder} to ${config.destination_folder}`);
        yield client.ensureDir(config.destination_folder);
        yield client.uploadFromDir(config.final_folder, config.destination_folder);
        log('File upload completed successfully.');
    }
    catch (err) {
        handleError(err);
    }
    finally {
        client.close();
    }
});
const uploadViaSsh = (config) => __awaiter(void 0, void 0, void 0, function* () {
    const ssh = new node_ssh_1.NodeSSH();
    try {
        log('Connecting to SSH server...');
        yield ssh.connect({
            host: config.ssh.host,
            username: config.ssh.username,
            privateKey: fs.readFileSync(config.ssh.privateKey, 'utf8'),
        });
        log('SSH connection successful.');
        log(`Uploading files from ${config.final_folder} to ${config.destination_folder}`);
        yield ssh.putDirectory(config.final_folder, config.destination_folder, {
            recursive: true,
            concurrency: 10,
        });
        log('File upload completed successfully.');
    }
    catch (err) {
        handleError(err);
    }
    finally {
        ssh.dispose();
    }
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!fs.existsSync(configFilePath)) {
        log('efoy-sync.json not found. Please create it in your project root.');
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
        if (method === 'ftp') {
            yield uploadViaFtp(config);
        }
        else if (method === 'ssh') {
            yield uploadViaSsh(config);
        }
        else {
            handleError(new Error('Invalid deployment method specified in efoy-sync.json'));
        }
        log('Deployment finished.');
    }
    else {
        log('Deployment cancelled by user.');
    }
});
main().catch(handleError);
