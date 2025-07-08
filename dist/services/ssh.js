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
exports.uploadViaSsh = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const state_1 = require("./state");
const getAllFiles = (dirPath, arrayOfFiles = []) => { const files = fs.readdirSync(dirPath); arrayOfFiles = arrayOfFiles || []; files.forEach((file) => { if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
    arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
}
else {
    arrayOfFiles.push(path.join(dirPath, file));
} }); return arrayOfFiles; };
const uploadViaSsh = (config, ui, state) => __awaiter(void 0, void 0, void 0, function* () {
    const { host, username, privateKey } = config.ssh;
    const remoteDestinationFolder = config.destination_folder;
    const sourceDir = config.final_folder;
    const allFiles = getAllFiles(sourceDir);
    for (const localPath of allFiles) {
        if (state.uploadedFiles.includes(localPath)) {
            ui.info(`Skipping already uploaded file: ${localPath}`);
            continue;
        }
        const remotePath = path.posix.join(remoteDestinationFolder, path.relative(sourceDir, localPath));
        const remoteDirPath = path.posix.dirname(remotePath);
        const mkdirCommand = `ssh -i ${privateKey} ${username}@${host} "mkdir -p ${remoteDirPath}"`;
        const scpCommand = `scp -i ${privateKey} "${localPath}" ${username}@${host}:"${remotePath}"`;
        yield new Promise((resolve, reject) => { (0, child_process_1.exec)(mkdirCommand, (error, stdout, stderr) => { if (error) {
            return reject(new Error(`Failed to create remote directory: ${stderr}`));
        } resolve(); }); });
        yield new Promise((resolve, reject) => { ui.step(`Uploading ${localPath} to ${remotePath}`); (0, child_process_1.exec)(scpCommand, (error, stdout, stderr) => { if (error) {
            const errorMessage = `SCP failed for ${localPath}: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`;
            ui.error(errorMessage);
            return reject(new Error(errorMessage));
        } state.uploadedFiles.push(localPath); (0, state_1.saveState)(state); ui.success(`Successfully uploaded: ${localPath}`); resolve(); }); });
    }
});
exports.uploadViaSsh = uploadViaSsh;
